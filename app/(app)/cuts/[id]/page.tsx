import { notFound, redirect } from "next/navigation"

import { Studio, type MediaEntry } from "@/components/editor/studio"
import { getAsset } from "@/lib/editor/assets"
import { getProject } from "@/lib/editor/projects"
import { createR2Storage } from "@/lib/editor/storage-r2"
import type { VideoDocument } from "@/lib/editor/types"
import { constructMetadata } from "@/lib/metadata"
import { getSession } from "@/lib/session"

export const metadata = constructMetadata({
  title: "Cut",
  noIndex: true,
})

/**
 * One project, opened on real footage.
 *
 * The document and the signed media URLs are resolved on the server and handed
 * down together. The alternative — the client fetching /api/editor/projects/:id
 * after mount — puts a spinner in front of a page whose data the server already
 * had, and every URL in it expires anyway, so there is nothing to cache.
 */
export default async function CutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  const { id } = await params

  if (!session) redirect(`/login?next=/cuts/${id}`)

  const project = await getProject(id, session.user.id)
  if (!project) notFound()

  const media = await resolveMedia(project.document, session.user.id)

  /**
   * The Console owns the whole area — its own rail, header and chat pane. No
   * page chrome above it: a second header over the editor's own would be two
   * title bars, and the layout was chosen as a full surface.
   */
  return (
    <div className="h-full min-h-0 w-full">
      <Studio
        projectId={project.id}
        document={project.document}
        revision={project.revision}
        media={media}
      />
    </div>
  )
}

/**
 * Signed URLs for whatever the document currently references.
 *
 * Read off the elements rather than a stored list: the document is the only
 * thing that knows what it uses right now, and a stored list goes stale the
 * moment a clip is deleted.
 */
async function resolveMedia(
  document: VideoDocument,
  userId: string
): Promise<Record<string, MediaEntry>> {
  const mediaIds = new Set<string>()

  for (const scene of document.scenes) {
    for (const track of scene.tracks) {
      for (const element of track.elements) {
        if ("mediaId" in element && element.mediaId) {
          mediaIds.add(element.mediaId)
        }
      }
    }
  }

  const storage = createR2Storage()

  const entries = await Promise.all(
    [...mediaIds].map(async (mediaId) => {
      const asset = await getAsset(mediaId, userId)
      if (!asset) return null

      const [proxyUrl, seekIndexUrl, filmstripUrl] = await Promise.all([
        asset.proxyKey ? storage.url(asset.proxyKey) : null,
        asset.seekIndexKey ? storage.url(asset.seekIndexKey) : null,
        asset.filmstripKey ? storage.url(asset.filmstripKey) : null,
      ])

      return [
        mediaId,
        {
          id: asset.id,
          filename: asset.filename,
          durationUs: asset.durationUs,
          width: asset.width,
          height: asset.height,
          fps: asset.fps,
          rotation: asset.rotation,
          hasAudio: asset.hasAudio,
          proxyUrl,
          seekIndexUrl,
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
        } satisfies MediaEntry,
      ] as const
    })
  )

  return Object.fromEntries(entries.filter((entry) => entry !== null))
}
