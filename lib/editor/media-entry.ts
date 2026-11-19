import type { MediaEntry } from "@/components/editor/studio"

import { getAsset, type VideoAssetRow } from "./assets"
import { storageKeys } from "./media"
import { referencedMediaIds } from "./placement"
import { readTake, strongLineSlot } from "./reading"
import type { Storage } from "./ingest"
import { createR2Storage } from "./storage-r2"
import { wordsFromDeepgram } from "./transcript"
import type { VideoDocument } from "./types"

/**
 * What the studio needs to show one asset, with URLs that work.
 *
 * Shared by the cut page (every asset the project uses) and the entry route
 * (one asset just added to the library), so an image dropped in during a
 * session reads exactly like one that was there when the page opened.
 */
export async function mediaEntryFor(
  asset: VideoAssetRow,
  storage: Pick<Storage, "url" | "exists">
): Promise<MediaEntry> {
  const kind = mediaKindOf(asset.mimeType)
  const voiceKey = storageKeys.voice(asset.contentHash)
  const [proxyUrl, seekIndexUrl, filmstripUrl, voiceUrl, thumbnailUrl] =
    await Promise.all([
      asset.proxyKey ? storage.url(asset.proxyKey) : null,
      asset.seekIndexKey ? storage.url(asset.seekIndexKey) : null,
      asset.filmstripKey ? storage.url(asset.filmstripKey) : null,
      // The cleaned voice, when ingest made one. A failed check is a take
      // that plays its own sound, never a page that does not open.
      asset.hasAudio && kind === "video"
        ? storage
            .exists(voiceKey)
            .then((found) => (found ? storage.url(voiceKey) : null))
            .catch(() => null)
        : null,
      asset.thumbnailKey ? storage.url(asset.thumbnailKey) : null,
    ])

  return {
    id: asset.id,
    filename: asset.filename,
    kind,
    durationUs: asset.durationUs,
    width: asset.width,
    height: asset.height,
    fps: asset.fps,
    rotation: asset.rotation,
    hasAudio: asset.hasAudio,
    proxyUrl,
    seekIndexUrl,
    voiceUrl,
    thumbnailUrl,
    // All four or none: a sheet whose geometry did not survive is a sheet
    // nothing can slice into tiles.
    filmstrip:
      filmstripUrl &&
      asset.filmstripTiles &&
      asset.filmstripIntervalUs &&
      asset.filmstripTileWidth &&
      asset.filmstripTileHeight
        ? {
            url: filmstripUrl,
            tiles: asset.filmstripTiles,
            intervalUs: asset.filmstripIntervalUs,
            tileWidth: asset.filmstripTileWidth,
            tileHeight: asset.filmstripTileHeight,
          }
        : null,
    // The reading of the take, counted here from the transcript the row
    // already carries: a few numbers cross to the client, never the provider
    // response (lib/editor/reading.ts).
    reading:
      asset.transcript && kind === "video"
        ? readTake(
            wordsFromDeepgram(asset.transcript),
            asset.durationUs ?? 0,
            strongLineOf(asset.transcript)
          )
        : null,
  }
}

export function mediaKindOf(mimeType: string): "video" | "audio" | "image" {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("audio/")) return "audio"
  return "video"
}

/** The cached strong line, when one has been chosen (lib/editor/strong-line.ts). */
function strongLineOf(transcript: unknown): string | null {
  const slot = strongLineSlot(transcript)
  return slot?.state === "done" ? slot.line : null
}

/**
 * Every asset a project shows, with URLs: what its elements reference and
 * what the person brought in and has not placed yet (its library). Read off
 * the document rather than a stored list, because the document is the only
 * thing that knows what it uses right now. One lookup for the cut page and
 * the project API, so neither can fall behind the other.
 */
export async function resolveProjectMedia(
  document: VideoDocument,
  userId: string,
  storage: Pick<Storage, "url" | "exists"> = createR2Storage()
): Promise<Record<string, MediaEntry>> {
  const mediaIds = new Set<string>([
    ...referencedMediaIds(document.scenes),
    ...(document.metadata.library ?? []),
  ])
  const entries = await Promise.all(
    [...mediaIds].map(async (mediaId) => {
      const asset = await getAsset(mediaId, userId)
      if (!asset) return null
      return [mediaId, await mediaEntryFor(asset, storage)] as const
    })
  )
  return Object.fromEntries(entries.filter((entry) => entry !== null))
}
