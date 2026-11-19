import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { Studio, type MediaEntry } from "@/components/editor/studio"
import { getAsset } from "@/lib/editor/assets"
import { mediaEntryFor } from "@/lib/editor/media-entry"
import { referencedMediaIds } from "@/lib/editor/placement"
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
export default function CutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Its own boundary, with `params` read under it: on a client navigation
  // the layout's is above what re-renders. The fallback holds the editor's
  // area and nothing else; a drawn editor that swapped would move more than
  // it saved.
  return (
    <Suspense
      fallback={
        <div className="h-full min-h-0 w-full">
          <span role="status" className="sr-only">
            Opening the cut
          </span>
        </div>
      }
    >
      <Cut params={params} />
    </Suspense>
  )
}

async function Cut({ params }: { params: Promise<{ id: string }> }) {
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
 * Signed URLs for whatever the document currently references, and for what
 * the person brought into the project and has not placed yet (its library).
 *
 * Read off the elements rather than a stored list: the document is the only
 * thing that knows what it uses right now, and a stored list goes stale the
 * moment a clip is deleted. The library is the one list kept, because an
 * unplaced picture is referenced by nothing else.
 */
async function resolveMedia(
  document: VideoDocument,
  userId: string
): Promise<Record<string, MediaEntry>> {
  const mediaIds = new Set<string>([
    ...referencedMediaIds(document.scenes),
    ...(document.metadata.library ?? []),
  ])

  const storage = createR2Storage()

  const entries = await Promise.all(
    [...mediaIds].map(async (mediaId) => {
      const asset = await getAsset(mediaId, userId)
      if (!asset) return null
      return [mediaId, await mediaEntryFor(asset, storage)] as const
    })
  )

  return Object.fromEntries(entries.filter((entry) => entry !== null))
}
