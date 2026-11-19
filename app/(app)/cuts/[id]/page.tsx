import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"

import { Studio } from "@/components/editor/studio"
import { resolveProjectMedia } from "@/lib/editor/media-entry"
import { getProject } from "@/lib/editor/projects"
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

  const media = await resolveProjectMedia(project.document, session.user.id)

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
