import { getAsset } from "@/lib/editor/assets"
import { mediaEntryFor } from "@/lib/editor/media-entry"
import { createR2Storage } from "@/lib/editor/storage-r2"
import { getSession } from "@/lib/session"

/**
 * One asset as the studio shows it, for media added to a project after the
 * page opened (the library's Add, a drop on the lanes). The same shape the
 * cut page builds for the media it already had.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  const { id } = await params
  const asset = await getAsset(id, session.user.id)
  if (!asset) {
    return Response.json({ error: "No such asset." }, { status: 404 })
  }
  if (asset.state !== "ready") {
    return Response.json(
      { error: "That file is still being processed.", state: asset.state },
      { status: 409 }
    )
  }

  return Response.json(await mediaEntryFor(asset, createR2Storage()))
}
