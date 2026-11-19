import { findOrCreateAsset } from "@/lib/editor/assets"
import { MAX_IMAGE_BYTES as IMAGE_LIMIT } from "@/lib/editor/image-check"
import {
  cooldownMessage,
  dailyVerdict,
  recordingVerdict,
} from "@/lib/editor/ingest-limits"
import {
  ingestCooldown,
  transcribedSecondsToday,
} from "@/lib/editor/ingest-meter"
import { createUploadUrl, isR2Configured } from "@/lib/editor/storage-r2"
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
import { getSession } from "@/lib/session"

/**
 * Ask for somewhere to put a file.
 *
 * The upload does not come through here. The browser hashes the file, asks this
 * for a presigned URL, and PUTs the bytes straight to R2 — a talking-head take
 * is most of a gigabyte, and streaming that through a function to hand it to
 * storage spends the entire function budget being a pipe.
 *
 * The hash arrives before the bytes do, which is what makes a re-upload free:
 * a file this user already has comes back as `alreadyIngested` with no URL at
 * all, and the browser skips straight to opening it.
 *
 * The ingest limits are checked here as well as on the ingest route, read-only,
 * so a refusal arrives before a gigabyte is uploaded rather than after it.
 * The ingest route is the guard; this is the courtesy that makes the guard
 * cheap to meet. Entitlement is checked before the row exists, so nothing is
 * stored for someone who may not spend.
 */

/** Bytes. R2 takes 5GB in a single PUT; this is a product limit, not a protocol one. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024

/**
 * What the editor can open, checked before a URL is handed out.
 *
 * The proxy transcode conforms nearly anything to H.264, so this is deliberately
 * wide — the list exists to keep a presigned URL from becoming a general file
 * host, not to second-guess ffmpeg. The real gate is the probe: a file that
 * lies about its type fails ingest and says so.
 */
const ACCEPTED = /^(video|audio)\/|^image\/(png|jpeg|webp|gif)$/
/** Bytes. A still bigger than this is a print file, not something to put on a cut. */
const MAX_IMAGE_BYTES = IMAGE_LIMIT

type UploadRequest = {
  filename?: unknown
  mimeType?: unknown
  sizeBytes?: unknown
  hash?: unknown
  /**
   * Seconds, as the browser read them from the file's metadata. Optional and
   * client-supplied, so a courtesy only: it refuses an obviously long file
   * before the upload. The probe on the ingest route is the real check.
   */
  durationSeconds?: unknown
  /** "music" or a picture buys no transcription, so the daily allowance does not apply. */
  purpose?: unknown
}

export async function POST(request: Request) {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return paywallResponse(entitlement)
  }

  if (!isR2Configured()) {
    // A 503 rather than a 500: nothing is broken, the deployment has no
    // storage configured, and the message says which values are missing.
    return Response.json(
      { error: "Video storage is not configured on this deployment." },
      { status: 503 }
    )
  }

  let body: UploadRequest
  try {
    body = (await request.json()) as UploadRequest
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }

  const invalid = validate(body)
  if (invalid) return Response.json({ error: invalid }, { status: 400 })

  if (typeof body.durationSeconds === "number") {
    const length = recordingVerdict(body.durationSeconds)
    if (!length.ok) {
      return Response.json(
        { error: length.error, state: "too-long" },
        { status: 413 }
      )
    }
  }

  const filename = body.filename as string
  const mimeType = body.mimeType as string
  const sizeBytes = body.sizeBytes as number
  const hash = body.hash as string

  const { asset, created } = await findOrCreateAsset({
    userId: session.user.id,
    filename,
    mimeType,
    sizeBytes,
    hash,
  })

  // The bytes are already up and processed. Nothing to upload and nothing to
  // ingest — this is the payoff for hashing before asking.
  if (!created && asset.state === "ready") {
    return Response.json({
      assetId: asset.id,
      state: asset.state,
      alreadyIngested: true,
    })
  }

  // After the dedupe, so re-opening a file already in the library is never
  // refused: that path buys nothing.
  const [cooldown, usedSeconds] = await Promise.all([
    ingestCooldown(session.user.id),
    transcribedSecondsToday(session.user.id),
  ])

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

  const transcribes = body.purpose !== "music" && !mimeType.startsWith("image/")
  const today = transcribes ? dailyVerdict({ usedSeconds }) : ({ ok: true } as const)
  if (!today.ok) {
    return Response.json({ error: today.error, state: "ceiling" }, { status: 429 })
  }

  const upload = await createUploadUrl(asset.storageKey, mimeType)

  return Response.json({
    assetId: asset.id,
    state: asset.state,
    alreadyIngested: false,
    uploadUrl: upload.url,
    key: upload.key,
    expiresInSeconds: upload.expiresInSeconds,
  })
}

/**
 * One message per problem, naming the field. A presign that fails with "bad
 * request" leaves the client guessing which of four values it got wrong.
 */
function validate(body: UploadRequest): string | null {
  if (typeof body.filename !== "string" || !body.filename.trim()) {
    return "filename is required."
  }

  if (typeof body.mimeType !== "string" || !ACCEPTED.test(body.mimeType)) {
    return "mimeType must be a video, audio or image (PNG, JPEG, WebP, GIF) type."
  }

  if (
    typeof body.sizeBytes !== "number" ||
    !Number.isInteger(body.sizeBytes) ||
    body.sizeBytes <= 0
  ) {
    return "sizeBytes must be a positive integer."
  }

  if (body.mimeType.startsWith("image/") && body.sizeBytes > MAX_IMAGE_BYTES) {
    return `Images are limited to ${MAX_IMAGE_BYTES / 1024 ** 2}MB.`
  }

  if (body.sizeBytes > MAX_UPLOAD_BYTES) {
    return `Files are limited to ${MAX_UPLOAD_BYTES / 1024 ** 3}GB.`
  }

  // The hash identifies the file and ends up in a storage key, so it is
  // constrained here rather than trusted — a caller-supplied string in a key
  // is how one user writes over another's object.
  if (typeof body.hash !== "string" || !/^[a-f0-9]{16,64}$/i.test(body.hash)) {
    return "hash must be a hex digest."
  }

  return null
}
