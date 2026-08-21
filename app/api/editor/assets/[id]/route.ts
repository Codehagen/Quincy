import { getAsset } from "@/lib/editor/assets"
import { createR2Storage } from "@/lib/editor/storage-r2"
import { getSession } from "@/lib/session"

/**
 * Everything needed to open one asset, including URLs that work.
 *
 * The keys are never handed to the client on their own. A key is a location in
 * a bucket the browser cannot read, so returning one would mean the editor
 * builds a URL it has no credentials for — the signature is the access, and it
 * is minted here per request with an hour on it.
 *
 * The transcript is deliberately not in this response. It is the largest thing
 * on the row by a wide margin and only the caption builder reads it, so it gets
 * its own fetch rather than sitting in the payload that gates first paint.
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

  const storage = createR2Storage()

  // In parallel: three independent signatures, and doing them in sequence puts
  // two avoidable round trips in front of the editor opening.
  const [proxyUrl, seekIndexUrl, thumbnailUrl] = await Promise.all([
    asset.proxyKey ? storage.url(asset.proxyKey) : null,
    asset.seekIndexKey ? storage.url(asset.seekIndexKey) : null,
    asset.thumbnailKey ? storage.url(asset.thumbnailKey) : null,
  ])

  return Response.json({
    id: asset.id,
    state: asset.state,
    filename: asset.filename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    durationUs: asset.durationUs,
    width: asset.width,
    height: asset.height,
    fps: asset.fps,
    rotation: asset.rotation,
    hasAudio: asset.hasAudio,
    hasTranscript: asset.transcript !== null,
    transcriptProvider: asset.transcriptProvider,
    // Whatever went wrong, or the warnings from a run that finished anyway.
    // The state says which of the two this is.
    error: asset.error,
    proxyUrl,
    seekIndexUrl,
    thumbnailUrl,
    createdAt: asset.createdAt,
  })
}
