import { createIdGenerator } from "ai"
import { start } from "workflow/api"

import { createR2Storage, isR2Configured } from "@/lib/editor/storage-r2"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { claimVoiceRiff, voiceNoteCooldown } from "@/lib/riffs"
import { getSession } from "@/lib/session"
import {
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  VOICE_NOTE_COOLDOWN_MS,
} from "@/lib/voice-note"
import { runVoiceRiffWorkflow } from "@/workflows/run-voice-riff"

/**
 * A recording lands; a riff starts working. See plans/018.
 *
 * **A route rather than a server action**, unlike everything else on /riffs.
 * A server action serialises its arguments as JSON, so a megabyte of audio
 * would travel base64-encoded — a third larger, and built into a string in
 * memory on both ends. A route takes the blob as a body.
 *
 * **The bytes come through the function**, unlike app/api/editor/uploads,
 * which hands out a presigned URL. That route exists because a video take is
 * most of a gigabyte and piping one through a function spends its whole budget
 * being a pipe. A voice note is capped at 24MB and a typical one is closer to
 * two, which is well inside a single request — and going direct saves a round
 * trip and one dependency on the bucket's CORS policy being right.
 *
 * The response returns as soon as the row exists. Transcription and angles
 * happen in a workflow the user is not waiting on, which is the entire point:
 * they recorded this on a walk and are not looking at the screen.
 */

const newAudioKey = createIdGenerator({ prefix: "vn", size: 20 })

/**
 * What the browser is allowed to send.
 *
 * `MediaRecorder` produces webm/opus on Chrome and Firefox and mp4/aac on
 * Safari, and neither is negotiable from script — so both are here because
 * both are what the platform gives. Narrow rather than the editor's wide
 * `^(video|audio)/`: that route's real gate is an ffprobe pass, and this one
 * has no equivalent, so the list *is* the gate.
 *
 * Base types only. The browser sends `audio/webm;codecs=opus`, and the
 * parameters are stripped before this is consulted — matching on the full
 * string would mean enumerating every codec spelling each browser chooses.
 */
const ACCEPTED = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
])

/** The upload, the row and the start. None of it waits on a model. */
export const maxDuration = 30

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  if (!isR2Configured()) {
    // 503 rather than 500, matching app/api/editor/uploads: nothing is broken,
    // this deployment has no storage.
    return Response.json(
      { error: "Voice notes are not configured on this deployment." },
      { status: 503 }
    )
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return Response.json(
      {
        error:
          entitlement.state === "lapsed"
            ? "Your subscription is no longer active."
            : "Your free day is over.",
      },
      { status: 402 }
    )
  }

  const mediaType = (request.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()

  if (!ACCEPTED.has(mediaType)) {
    return Response.json(
      { error: `Quincy cannot read ${mediaType || "that"} audio.` },
      { status: 415 }
    )
  }

  /**
   * The cooldown, before the bytes are read rather than after.
   *
   * AGENTS.md asks for a ceiling and a cooldown on every path that spends, and
   * is explicit that a claim is not a cooldown. Checked here so a refused
   * request never pays to buffer a recording it is going to throw away.
   */
  const cooldown = await voiceNoteCooldown(
    session.user.id,
    VOICE_NOTE_COOLDOWN_MS
  )
  if (!cooldown.ready) {
    return Response.json(
      {
        error: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
      },
      { status: 429 }
    )
  }

  /**
   * `Content-Length` first, then the real size.
   *
   * The header is a claim and is checked because believing it costs nothing
   * and refusing early saves buffering 100MB to find out. The measurement
   * after is the actual guard — a client can send any header it likes.
   */
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "That recording is too long." },
      { status: 413 }
    )
  }

  const audio = new Uint8Array(await request.arrayBuffer())

  if (audio.byteLength === 0) {
    return Response.json({ error: "There is no audio here." }, { status: 400 })
  }

  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return Response.json(
      { error: "That recording is too long." },
      { status: 413 }
    )
  }

  /**
   * How long the browser says it recorded for.
   *
   * Only ever used to meter, and only when the provider reports no duration of
   * its own — which is the live case, see `recordedSeconds` in lib/voice-note.
   * Parsed defensively and clamped here as well as there: a header is a claim,
   * and `Number("")` is 0 while `Number("abc")` is NaN, which would propagate
   * silently into a cost calculation and record nothing at all.
   */
  const declaredSeconds = Number(
    request.headers.get("x-voice-note-seconds") ?? 0
  )
  const recordedSeconds =
    Number.isFinite(declaredSeconds) && declaredSeconds > 0
      ? Math.min(declaredSeconds, MAX_AUDIO_SECONDS * 2)
      : 0

  const key = `voice-notes/${session.user.id}/${newAudioKey()}`

  try {
    await createR2Storage().put(key, audio, mediaType)
  } catch (cause) {
    console.error("[voice-notes] upload failed:", cause)
    return Response.json(
      { error: "Could not store that recording. Try again." },
      { status: 502 }
    )
  }

  /**
   * The row before the run — and the atomic claim, not the earlier advisory
   * check. Two requests could both have passed `voiceNoteCooldown` above
   * (that check is deliberately cheap, not exclusive); this is the single
   * statement that lets only one of them actually create the riff.
   *
   * Ordered this way so there is no window in which a workflow is processing
   * audio for a riff that does not exist. The reverse would be recoverable but
   * only by the workflow knowing how to create what it was supposed to fill
   * in, which is a second code path for a case that ordering makes impossible.
   */
  const claim = await claimVoiceRiff(session.user.id, VOICE_NOTE_COOLDOWN_MS)
  if (!claim.ok) {
    return Response.json(
      { error: "Give Quincy a moment — another recording just landed." },
      { status: 429 }
    )
  }
  const riffId = claim.riffId

  try {
    await start(runVoiceRiffWorkflow, [
      {
        riffId,
        userId: session.user.id,
        audioKey: key,
        mediaType,
        recordedSeconds,
      },
    ])
  } catch (cause) {
    /**
     * The riff stays, and stays `working`.
     *
     * `RIFF_STUCK_AFTER_MS` is what catches it: after four minutes the card
     * stops claiming to be busy and offers a retry. Deleting the row here
     * instead would be tidier and worse — the user pressed record and spoke,
     * and a card that says "this did not work" is a truer answer than a page
     * that never acknowledges it happened.
     */
    console.error("[voice-notes] could not start workflow:", cause)
  }

  return Response.json({ riffId }, { status: 202 })
}
