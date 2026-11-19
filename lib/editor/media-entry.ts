import type { MediaEntry } from "@/components/editor/studio"

import type { VideoAssetRow } from "./assets"
import { storageKeys } from "./media"
import { readTake, strongLineSlot } from "./reading"
import type { Storage } from "./ingest"
import { wordsFromDeepgram } from "./transcript"

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
