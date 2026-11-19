import { join } from "node:path"

import {
  claimForIngest,
  completeImage,
  completeIngest,
  failIngest,
  getAsset,
} from "@/lib/editor/assets"
import { runIngest, type Transcriber } from "@/lib/editor/ingest"
import {
  cooldownMessage,
  dailyVerdict,
  IngestRefusedError,
  recordingVerdict,
} from "@/lib/editor/ingest-limits"
import {
  ingestCooldown,
  recordIngestStart,
  recordTranscription,
  transcribedSecondsToday,
} from "@/lib/editor/ingest-meter"
import { peaksFromPcm } from "@/lib/editor/media"
import { imageProblem } from "@/lib/editor/image-check"
import { createR2Storage, downloadObject, readObjectHead } from "@/lib/editor/storage-r2"
import {
  createFfmpegTranscoder,
  withWorkspace,
} from "@/lib/editor/transcoder-ffmpeg"
import {
  isSpeechConfigured,
  pcmTranscriber,
  speechProviderFor,
  speechToTextFor,
} from "@/lib/transcription"
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
import { getSession } from "@/lib/session"

/**
 * Turn uploaded bytes into something the editor can open.
 *
 * Called by the browser once its PUT to R2 finishes. Synchronous on purpose for
 * now: the client is already waiting and watching, and a queue would add a
 * moving part before there is a durability problem to solve. The thing that
 * would force one is not complexity, it is the ceiling below — a 4K take long
 * enough to exceed it needs a worker, and `lib/editor/ingest.ts` is written
 * against ports so that move does not reach into the pipeline.
 *
 * The claim is what makes calling this twice safe. Two tabs, a retry, a
 * double-click: the second call finds the row already `processing` and is told
 * so, rather than starting a second transcode of the same gigabyte.
 *
 * **What it may spend** (AGENTS.md, "Money"; numbers in
 * lib/editor/ingest-limits.ts). Entitlement first, as on the editor agent.
 * Then the cooldown, because a claim is not one: a claim is released when the
 * run ends, and a failed asset is claimable again at once. Then the day's
 * Deepgram seconds, before anything is downloaded. Then, inside the pipeline,
 * the recording's own length against the per-recording ceiling and the day —
 * after the probe and before the transcode. Every Deepgram request is metered
 * before it is sent.
 */

/** Seconds. The platform ceiling on all plans; nothing gains from asking for less. */
export const maxDuration = 300

/**
 * How long into an ingest the cleaned voice may still start. Half of
 * `maxDuration`: the voice pass on a 20-minute take fits in the rest, with
 * room for `completeIngest` after it. Past this the step is skipped rather
 * than risking the whole upload for something the Sound button can make.
 */
const VOICE_BUDGET_MS = 150_000

// ffmpeg needs a real filesystem, which only the Node.js runtime has — and
// Node.js is the default, so this route no longer says so: cacheComponents
// rejects the `runtime` segment config outright.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return paywallResponse(entitlement)
  }

  const { id } = await params
  const userId = session.user.id

  const asset = await getAsset(id, userId)
  if (!asset) {
    return Response.json({ error: "No such asset." }, { status: 404 })
  }

  // What the file is for, from the client. Music is not transcribed: nobody
  // edits a song by its words, and every second of it would be bought.
  const options = await readIngestOptions(request)

  if (asset.mimeType.startsWith("image/") && asset.state !== "ready") {
    if (!options.image) {
      return Response.json(
        { error: "An image needs its width and height." },
        { status: 400 }
      )
    }
    // The bytes, not the browser's word for them: an image never reaches
    // ffmpeg, so this is the only place anything checks what was stored.
    const problem = imageProblem(await readObjectHead(asset.storageKey), asset.mimeType)
    if (problem) {
      // Too big or not a picture is a final answer, so the row says so, as a
      // failed video ingest does. Not uploaded yet (409) is not: the PUT may
      // still land. The bytes stay, because originals are shared by content
      // and another row may hold the same ones.
      if (problem.status !== 409) await failIngest(id, userId, problem.error)
      return Response.json({ error: problem.error }, { status: problem.status })
    }
    const done = await completeImage(id, userId, options.image)
    return Response.json({
      assetId: id,
      state: done?.state ?? "ready",
      durationUs: null,
      width: options.image.width,
      height: options.image.height,
      hasAudio: false,
      hasTranscript: false,
      warnings: [],
    })
  }

  if (asset.state === "ready") {
    // Idempotent. A retried call on a finished asset is a success, not a
    // conflict — the caller wanted it ingested and it is.
    //
    // Same shape as the response at the end of a real run, read off the row
    // instead of off the result. A shorter payload here would mean the client
    // has to know which of the two it got before it can read either, and the
    // one case that hits this path is a re-upload of a file the user already
    // has — the path most likely to be taken by code that was written against
    // the other one.
    return Response.json({
      assetId: asset.id,
      state: asset.state,
      durationUs: asset.durationUs,
      width: asset.width,
      height: asset.height,
      hasAudio: asset.hasAudio,
      hasTranscript: asset.transcript !== null,
      warnings: asset.error ? [asset.error] : [],
    })
  }

  const cooldown = await ingestCooldown(userId)
  if (!cooldown.ready) {
    return Response.json(
      {
        error: cooldownMessage(cooldown.secondsLeft),
        state: "cooldown",
        secondsLeft: cooldown.secondsLeft,
      },
      { status: 429 }
    )
  }

  // The daily allowance is transcription; music buys none, so it is not
  // refused for it. The cooldown above still holds.
  const today = options.transcribe
    ? dailyVerdict({ usedSeconds: await transcribedSecondsToday(userId) })
    : ({ ok: true } as const)
  if (!today.ok) {
    return Response.json(
      { error: today.error, state: "ceiling" },
      { status: 429 }
    )
  }

  // The attempt row, before the claim. A press that then loses the claim to
  // another tab still counts against the cooldown, which is the safe way round.
  await recordIngestStart(userId)

  const claim = await claimForIngest(id, userId)
  if (!claim.claimed) {
    return Response.json(
      { error: "This file is already being processed.", state: claim.state },
      { status: 409 }
    )
  }

  const meteredTranscriber = transcriber((audioSeconds) =>
    recordTranscription(userId, id, audioSeconds)
  )
  const passes = meteredTranscriber.maxPasses ?? 1

  try {
    const startedAt = Date.now()
    const result = await withWorkspace(async (workdir) => {
      const source = join(workdir, "original")
      await downloadObject(asset.storageKey, source)

      return runIngest(
        {
          assetId: asset.id,
          filename: asset.filename,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          contentHash: asset.contentHash,
          source: { kind: "path", path: source },
        },
        {
          storage: createR2Storage(),
          transcoder: createFfmpegTranscoder({ workdir }),
          transcriber: meteredTranscriber,
          voiceDeadline: () => Date.now() - startedAt > VOICE_BUDGET_MS,
          peaksFromPcm,
          admit: async (probe) => {
            const seconds = probe.durationUs / 1_000_000
            const length = recordingVerdict(seconds)
            if (!length.ok) throw new IngestRefusedError(length.error, 413)

            if (!probe.hasAudio) return
            const day = dailyVerdict({
              usedSeconds: await transcribedSecondsToday(userId),
              requestSeconds: seconds * passes,
            })
            if (!day.ok) throw new IngestRefusedError(day.error, 429)
          },
          // The second line, on the PCM length: a container that reported no
          // duration passed `admit` at zero seconds.
          admitTranscription: async (audioSeconds) => {
            if (!options.transcribe) return "Music is not transcribed."
            const length = recordingVerdict(audioSeconds)
            if (!length.ok) return length.error

            const day = dailyVerdict({
              usedSeconds: await transcribedSecondsToday(userId),
              requestSeconds: audioSeconds * passes,
            })
            return day.ok ? null : day.error
          },
        }
      )
    })

    const updated = await completeIngest(id, userId, result)

    return Response.json({
      assetId: id,
      state: updated?.state ?? "ready",
      durationUs: result.probe.durationUs,
      width: result.probe.width,
      height: result.probe.height,
      hasAudio: result.probe.hasAudio,
      hasTranscript: result.transcript !== null,
      warnings: result.warnings,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    // Written to the row before the response, so a client that has navigated
    // away still finds out why. `failed` is claimable again, so "try again" is
    // a real button rather than a re-upload.
    await failIngest(id, userId, reason)

    // A refusal is a limit, not a broken file: its own status, so the client
    // can tell "too long" and "enough for today" apart from a codec failure.
    if (error instanceof IngestRefusedError) {
      return Response.json(
        { error: reason, state: "failed", refused: true },
        { status: error.status }
      )
    }

    return Response.json({ error: reason, state: "failed" }, { status: 422 })
  }
}

/**
 * A transcriber, configured or not: the editor's speech-to-text
 * (`EDITOR_TRANSCRIBER`, Deepgram unless set; lib/transcription/index.ts).
 *
 * When it is not set up this returns one that throws on use, which
 * `runIngest` catches into a warning — so the asset still reaches `ready` and
 * the footage is still editable, minus captions. The alternative, skipping
 * the port entirely, would make a missing key indistinguishable from a file
 * with no speech in it, and only one of those is worth telling someone about.
 * A setting that names a provider the editor cannot use is the same: a
 * warning on the asset, never a failed upload.
 */
function transcriber(
  onRequest: (audioSeconds: number) => Promise<void>
): Transcriber {
  let problem: string
  try {
    if (isSpeechConfigured("editor")) {
      return pcmTranscriber(speechToTextFor("editor", { onRequest }))
    }
    problem =
      speechProviderFor("editor") === "deepgram"
        ? "DEEPGRAM_API_KEY is not set"
        : "the editor's transcriber is not set up"
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error)
  }

  return {
    name: "none",
    transcribe: () => {
      throw new Error(
        `${problem}, so this asset has no captions yet. ` +
          "Set it and re-run ingest to add them."
      )
    },
  }
}

type IngestOptions = {
  transcribe: boolean
  image: { width: number; height: number } | null
}

/** The body is optional; an empty or broken one is the defaults. */
async function readIngestOptions(request: Request): Promise<IngestOptions> {
  const body: unknown = await request.json().catch(() => null)
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const image = record.image as Record<string, unknown> | undefined
  const size = (value: unknown) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 20_000
  return {
    transcribe: record.purpose !== "music",
    image:
      image && size(image.width) && size(image.height)
        ? { width: image.width as number, height: image.height as number }
        : null,
  }
}
