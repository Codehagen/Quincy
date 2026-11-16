import { join } from "node:path"

import {
  claimForIngest,
  completeIngest,
  failIngest,
  getAsset,
} from "@/lib/editor/assets"
import { runIngest, type Transcriber } from "@/lib/editor/ingest"
import { peaksFromPcm } from "@/lib/editor/media"
import { createR2Storage, downloadObject } from "@/lib/editor/storage-r2"
import {
  createFfmpegTranscoder,
  withWorkspace,
} from "@/lib/editor/transcoder-ffmpeg"
import {
  createDeepgramTranscriber,
  isDeepgramConfigured,
  readDeepgramOptions,
} from "@/lib/editor/transcriber-deepgram"
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
 */

/** Seconds. The platform ceiling on all plans; nothing gains from asking for less. */
export const maxDuration = 300

// ffmpeg needs a real filesystem, which only the Node.js runtime has — and
// Node.js is the default, so this route no longer says so: cacheComponents
// rejects the `runtime` segment config outright.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  const { id } = await params
  const userId = session.user.id

  const asset = await getAsset(id, userId)
  if (!asset) {
    return Response.json({ error: "No such asset." }, { status: 404 })
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

  const claim = await claimForIngest(id, userId)
  if (!claim.claimed) {
    return Response.json(
      { error: "This file is already being processed.", state: claim.state },
      { status: 409 }
    )
  }

  try {
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
          transcriber: transcriber(),
          peaksFromPcm,
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

    return Response.json({ error: reason, state: "failed" }, { status: 422 })
  }
}

/**
 * A transcriber, configured or not.
 *
 * When the key is absent this returns one that throws on use, which `runIngest`
 * catches into a warning — so the asset still reaches `ready` and the footage
 * is still editable, minus captions. The alternative, skipping the port
 * entirely, would make a missing key indistinguishable from a file with no
 * speech in it, and only one of those is worth telling someone about.
 */
function transcriber(): Transcriber {
  if (isDeepgramConfigured()) {
    return createDeepgramTranscriber(readDeepgramOptions())
  }

  return {
    name: "none",
    transcribe: () => {
      throw new Error(
        "DEEPGRAM_API_KEY is not set, so this asset has no captions yet. " +
          "Set it and re-run ingest to add them."
      )
    },
  }
}
