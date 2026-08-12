import { getAsset } from "@/lib/editor/assets"
import { wordsFromDeepgram } from "@/lib/editor/transcript"
import { getSession } from "@/lib/session"

/**
 * The words, with the timings that bind them to the recording.
 *
 * Its own route because of size and because of when it is needed. The raw
 * provider response is the largest thing on the asset row by a wide margin, and
 * nothing on first paint reads it — the editor opens, plays and cuts without
 * ever asking. It is fetched when someone wants captions or a tightening pass,
 * which is a click, not a page load.
 *
 * Normalised here rather than in the browser. `wordsFromDeepgram` is the only
 * thing that knows the provider's shape, and keeping it server-side means
 * swapping transcription providers never touches a component.
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

  // 404 rather than an empty word list. "This recording has no transcript yet"
  // and "this recording is silent" are different answers, and a caller that
  // cannot tell them apart shows an empty caption lane for both.
  if (!asset.transcript) {
    return Response.json(
      { error: "This recording has no transcript yet." },
      { status: 404 }
    )
  }

  return Response.json({
    provider: asset.transcriptProvider,
    words: wordsFromDeepgram(asset.transcript),
  })
}
