import { FatalError } from "workflow"

import { deleteObject, downloadObject } from "@/lib/editor/storage-r2"
import {
  completeSpokenRiff,
  failSpokenRiff,
  type CompleteSpokenRiffResult,
} from "@/lib/riffs"
import {
  recordTranscriptionCost,
  transcribeVoiceNote,
  type TranscriptionOutcome,
} from "@/lib/voice-note"

/**
 * Audio in R2 becomes a riff with angles. See plans/018.
 *
 * The first background job in the product that is not a cron. Four Vercel
 * crons were the whole of the infrastructure before this, and a cron is the
 * wrong shape for a voice note twice over: it fires on a clock rather than on
 * a person pressing stop, and it has no per-run state, so a card on /riffs
 * would have nothing to read while the work was in flight.
 *
 * **Why not `after()`.** It was the cheaper option and it does not survive the
 * comparison. `after()` is not durable — a crashed function loses the work
 * with no retry and no row that knows it was running — and the pipeline here
 * is two failure-prone external calls back to back, with nobody watching. The
 * stuck-state story /riffs needed anyway (`startedAt`, a terminal state, a
 * retry) is the machinery Workflow already ships; writing it by hand to avoid
 * the dependency would have been writing the dependency.
 *
 * **The shape.** Orchestration only, per the Workflow docs: everything that
 * touches the network or the database lives in a `"use step"` function with
 * full Node access, and this function just sequences them. Steps are the retry
 * boundary, so a transcription that fails on a blip is retried without
 * re-running the angle generation that has not happened yet.
 */
export async function runVoiceRiffWorkflow(payload: {
  riffId: string
  userId: string
  /** The R2 key the route uploaded to. */
  audioKey: string
  mediaType: string
  /** What the browser clocked, for metering when the provider reports no
   *  duration — which is the live case. See lib/voice-note.ts. */
  recordedSeconds: number
}) {
  "use workflow"

  const transcript = await transcribeStep(payload)

  /**
   * The audio is deleted as soon as the words exist, success or not.
   *
   * A recording of somebody thinking out loud on a walk is the most personal
   * thing this product ever holds, and it has no second use: the transcript is
   * what every downstream step reads, and `completeSpokenRiff` stores that
   * before it asks for angles. Keeping the audio would be keeping it for
   * nobody. Deleting before the riff is finished rather than after means a
   * failure in the angle step cannot strand a file either.
   *
   * Its own step so a delete failure is retried on its own, and so it cannot
   * take the riff down with it — see the swallow inside.
   */
  await deleteAudioStep(payload.audioKey)

  if (!transcript.ok) {
    await failStep({
      riffId: payload.riffId,
      userId: payload.userId,
      message: transcript.message,
    })
    return { ok: false as const, reason: transcript.reason }
  }

  await meterStep({ userId: payload.userId, seconds: transcript.seconds })

  const result = await anglesStep({
    riffId: payload.riffId,
    userId: payload.userId,
    transcript: transcript.text,
  })

  if (!result.ok) {
    await failStep({
      riffId: payload.riffId,
      userId: payload.userId,
      message: result.message,
    })
    return { ok: false as const, reason: "no-angles" }
  }

  return { ok: true as const, angles: result.angles }
}

/**
 * Download the audio and transcribe it.
 *
 * Returns the outcome object rather than throwing on a refusal. A recording
 * that came back empty, or ran past the ceiling, is a *finished* answer — the
 * riff should say so and stop. Throwing would make Workflow retry a call whose
 * result will not change, spending the same money again for the same answer.
 *
 * A genuine infrastructure failure (R2 unreachable, the download truncated)
 * still throws, because that one is worth retrying.
 */
async function transcribeStep(payload: {
  audioKey: string
  mediaType: string
  recordedSeconds: number
}): Promise<TranscriptionOutcome> {
  "use step"

  /**
   * To a temp file, then into memory.
   *
   * `downloadObject` streams to a path because the video editor's takes are
   * most of a gigabyte and buffering one would blow the function's memory. A
   * voice note is capped at 24MB, so reading it back is safe — but reusing the
   * existing helper is better than adding a second R2 read path that could
   * drift from it.
   */
  const { mkdtemp, readFile, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")

  const dir = await mkdtemp(join(tmpdir(), "voice-"))
  const path = join(dir, "note")

  try {
    await downloadObject(payload.audioKey, path)
    const audio = await readFile(path)

    return await transcribeVoiceNote({
      audio: new Uint8Array(audio),
      mediaType: payload.mediaType,
      recordedSeconds: payload.recordedSeconds,
    })
  } finally {
    // The function may be reused across invocations under Fluid Compute, so
    // the temp directory is cleaned rather than left for the sandbox to
    // reclaim. Failing to clean must not fail the transcription.
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

async function deleteAudioStep(audioKey: string): Promise<void> {
  "use step"

  try {
    await deleteObject(audioKey)
  } catch (cause) {
    /**
     * Swallowed, deliberately.
     *
     * An orphaned object in R2 costs fractions of a cent and can be swept
     * later. Failing the run over it would turn a successful transcript into a
     * failed riff, which is the wrong trade by a wide margin — and because
     * this step sits before the angle generation, a throw here would also
     * stop work that has every reason to proceed.
     */
    console.error("[voice-riff] could not delete audio:", cause)
  }
}

async function meterStep(input: {
  userId: string
  seconds: number
}): Promise<void> {
  "use step"
  await recordTranscriptionCost(input.userId, input.seconds)
}

async function anglesStep(input: {
  riffId: string
  userId: string
  transcript: string
}): Promise<CompleteSpokenRiffResult> {
  "use step"
  return completeSpokenRiff(input)
}

async function failStep(input: {
  riffId: string
  userId: string
  message: string
}): Promise<void> {
  "use step"

  try {
    await failSpokenRiff(input)
  } catch (cause) {
    /**
     * A `FatalError`, not a retry.
     *
     * If the database cannot be written the riff is stuck on `working`, and
     * the card's `RIFF_STUCK_AFTER_MS` clock is exactly the fallback for that
     * — the user sees "this is taking too long" rather than a skeleton
     * forever. Retrying a write that just failed, in order to record that
     * something else failed, is a loop with no better outcome at the end
     * of it.
     */
    console.error("[voice-riff] could not mark riff failed:", cause)
    throw new FatalError("could not record the failure")
  }
}
