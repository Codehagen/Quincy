import { createIdGenerator } from "ai"
import { and, eq, inArray, lt, or } from "drizzle-orm"

import { db } from "../db"
import { videoAsset, type VideoAssetState } from "../schema-app"
import type { IngestResult } from "./ingest"
import { contentKey, storageKeys } from "./media"

/**
 * The asset row, and the states an ingest moves it through.
 *
 * Everything here is scoped to a user id in the `where` clause rather than
 * checked after the read. An id belonging to someone else matches no rows and
 * comes back as "not found", which is the same answer as an id that never
 * existed — the alternative tells anyone who asks which asset ids are real.
 */

const newAssetId = createIdGenerator({ prefix: "va", size: 16 })

export type VideoAssetRow = typeof videoAsset.$inferSelect

/**
 * How long a `processing` row is believed before it is treated as abandoned.
 *
 * A function that dies mid-transcode leaves the row claimed and nothing ever
 * clears it, so without this the asset is stuck forever and the only fix is a
 * re-upload of a file already sitting in R2. Longer than the transcoder's own
 * 15 minute budget, so a slow-but-alive run is never stolen from.
 */
export const PROCESSING_STALE_MS = 20 * 60_000

export type CreateAssetInput = {
  userId: string
  filename: string
  mimeType: string
  sizeBytes: number
  /** The raw digest. The stored key is built from it — see contentKey. */
  hash: string
}

/**
 * Find the row for this content, or make one.
 *
 * Re-uploading the same file is free, which is the whole point of hashing on
 * the client before asking for an upload URL. A returning user gets back the
 * asset they already have — proxy, transcript, everything — and never spends a
 * second transcode on it.
 *
 * `created` is what the caller branches on: false means the bytes are already
 * in R2 and the browser can skip the PUT entirely.
 */
export async function findOrCreateAsset(
  input: CreateAssetInput
): Promise<{ asset: VideoAssetRow; created: boolean }> {
  const contentHash = contentKey(input.sizeBytes, input.hash)

  const existing = await db
    .select()
    .from(videoAsset)
    .where(
      and(
        eq(videoAsset.userId, input.userId),
        eq(videoAsset.contentHash, contentHash)
      )
    )
    .limit(1)

  if (existing[0]) return { asset: existing[0], created: false }

  const inserted = await db
    .insert(videoAsset)
    .values({
      id: newAssetId(),
      userId: input.userId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      contentHash,
      storageKey: storageKeys.original(contentHash),
      state: "uploaded",
    })
    // Two uploads of the same file racing each other both reach the insert.
    // The unique index refuses the second; this turns that refusal into the
    // row the first one wrote, which is what the caller wanted anyway.
    .onConflictDoNothing({
      target: [videoAsset.userId, videoAsset.contentHash],
    })
    .returning()

  if (inserted[0]) return { asset: inserted[0], created: true }

  const raced = await db
    .select()
    .from(videoAsset)
    .where(
      and(
        eq(videoAsset.userId, input.userId),
        eq(videoAsset.contentHash, contentHash)
      )
    )
    .limit(1)

  if (!raced[0]) throw new Error("asset insert conflicted with nothing")
  return { asset: raced[0], created: false }
}

export async function getAsset(
  id: string,
  userId: string
): Promise<VideoAssetRow | null> {
  const rows = await db
    .select()
    .from(videoAsset)
    .where(and(eq(videoAsset.id, id), eq(videoAsset.userId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function listAssets(
  userId: string,
  limit = 50
): Promise<VideoAssetRow[]> {
  return db
    .select()
    .from(videoAsset)
    .where(eq(videoAsset.userId, userId))
    .orderBy(videoAsset.createdAt)
    .limit(limit)
}

/**
 * Take the asset for processing, or say who has it.
 *
 * One conditional UPDATE, for the same reason the X import claims its cooldown
 * that way: the HTTP driver has no session, no advisory locks and no
 * interactive transactions, so a read-then-write leaves a gap that two
 * concurrent ingest calls both walk through — and the cost of losing that race
 * is two functions transcoding the same gigabyte at the same time.
 *
 * `failed` is claimable because retrying a failure is the point of showing it.
 * `processing` is claimable only once it is stale, which is the crash case; a
 * live run inside its budget keeps the claim.
 */
export async function claimForIngest(
  id: string,
  userId: string
): Promise<{ claimed: boolean; state: VideoAssetState | null }> {
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS)

  const claimed = await db
    .update(videoAsset)
    .set({ state: "processing", error: null, updatedAt: new Date() })
    .where(
      and(
        eq(videoAsset.id, id),
        eq(videoAsset.userId, userId),
        or(
          inArray(videoAsset.state, ["uploaded", "probed", "failed"]),
          and(
            eq(videoAsset.state, "processing"),
            lt(videoAsset.updatedAt, staleBefore)
          )
        )
      )
    )
    .returning({ state: videoAsset.state })

  if (claimed[0]) return { claimed: true, state: claimed[0].state }

  // Nothing was claimed. Read once more to tell "someone else has it" apart
  // from "no such asset", which are a 409 and a 404 to the caller.
  const current = await getAsset(id, userId)
  return { claimed: false, state: current?.state ?? null }
}

/**
 * Write everything the pipeline produced and open the asset for editing.
 *
 * `ready` even with warnings on it. A missing transcript means captions are not
 * available yet; it does not mean the footage cannot be scrubbed, and gating
 * the editor on Deepgram would make an outage there look like a broken upload.
 */
export async function completeIngest(
  id: string,
  userId: string,
  result: IngestResult
): Promise<VideoAssetRow | null> {
  const { probe, keys } = result

  const rows = await db
    .update(videoAsset)
    .set({
      state: "ready",
      proxyKey: keys.proxy,
      seekIndexKey: keys.seekIndex,
      thumbnailKey: keys.thumbnail,
      // Key and geometry together, or neither. A key with no tile count is a
      // sheet nothing can slice, and it would read as "the strip is there" to
      // every caller that only checks the key.
      filmstripKey: result.filmstrip ? keys.filmstrip : null,
      filmstripTiles: result.filmstrip?.count ?? null,
      filmstripIntervalUs: result.filmstrip?.intervalUs ?? null,
      filmstripTileWidth: result.filmstrip?.tileWidth ?? null,
      filmstripTileHeight: result.filmstrip?.tileHeight ?? null,
      durationUs: probe.durationUs,
      width: probe.width,
      height: probe.height,
      // The column is an integer and 29.97 is a real frame rate. Rounding is
      // for display and for snapping; lib/editor/time.ts holds the exact rate
      // where arithmetic happens, in microseconds, so nothing here is used to
      // compute a cut boundary.
      fps: Math.round(probe.fps),
      rotation: probe.rotation,
      hasAudio: probe.hasAudio,
      transcript: result.transcript as Record<string, unknown> | null,
      transcriptProvider: result.transcriptProvider,
      transcribedAt: result.transcript ? new Date() : null,
      geminiFileUri: result.vision?.uri ?? null,
      geminiExpiresAt: result.vision?.expiresAt ?? null,
      error: result.warnings.length > 0 ? result.warnings.join("; ") : null,
      updatedAt: new Date(),
    })
    .where(and(eq(videoAsset.id, id), eq(videoAsset.userId, userId)))
    .returning()

  return rows[0] ?? null
}

/**
 * The asset could not be opened, and the reason is shown to the user.
 *
 * Verbatim, not paraphrased — "ffmpeg: Invalid data found when processing
 * input" tells someone their file is truncated, and "ingest failed" tells them
 * to email support.
 */
export async function failIngest(
  id: string,
  userId: string,
  reason: string
): Promise<void> {
  await db
    .update(videoAsset)
    .set({
      state: "failed",
      error: reason.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(and(eq(videoAsset.id, id), eq(videoAsset.userId, userId)))
}
