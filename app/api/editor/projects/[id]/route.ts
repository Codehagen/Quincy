import { resolveProjectMedia } from "@/lib/editor/media-entry"
import {
  getProject,
  RevisionConflictError,
  saveDocument,
} from "@/lib/editor/projects"
import type { VideoDocument } from "@/lib/editor/types"
import { getSession } from "@/lib/session"

/**
 * One project, with everything needed to render it.
 *
 * The response carries the document *and* the media behind it. The editor
 * cannot draw a frame from the document alone — a VideoElement holds a mediaId
 * and no URL, deliberately, because a signed URL expires and a document does
 * not. Resolving them here means one request instead of one per clip, and it
 * means the URLs are always as fresh as the page.
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
  const project = await getProject(id, session.user.id)

  if (!project) {
    return Response.json({ error: "No such project." }, { status: 404 })
  }

  const media = await resolveProjectMedia(project.document, session.user.id)

  return Response.json({
    id: project.id,
    title: project.title,
    revision: project.revision,
    lock: project.lock,
    document: project.document,
    media,
    updatedAt: project.updatedAt,
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  const { id } = await params

  let body: { document?: unknown; revision?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }

  if (typeof body.revision !== "number" || !Number.isInteger(body.revision)) {
    // Not optional, and not defaulted to "whatever is there". A save with no
    // revision is a save that cannot lose a race, which is the same as a save
    // that overwrites whatever it did not see.
    return Response.json(
      { error: "revision is required and must be an integer." },
      { status: 400 }
    )
  }

  if (!isDocument(body.document)) {
    return Response.json(
      { error: "document is required and must be a video document." },
      { status: 400 }
    )
  }

  /**
   * Refused while a run holds the document.
   *
   * The revision guard alone is not enough here. An agent run applies its edits
   * to a working snapshot and writes once at the end, so for the seconds it is
   * thinking the stored revision has not moved — an autosave landing in that
   * window succeeds, bumps the revision, and the run's own save then loses the
   * whole cut to a conflict. The lock is what makes the read-only timeline the
   * user is looking at true on the server as well.
   */
  const held = await getProject(id, session.user.id)

  if (held?.lock.status === "locked") {
    return Response.json(
      {
        error: "This project is being cut right now. Try again in a moment.",
        runId: held.lock.runId,
      },
      { status: 423 }
    )
  }

  try {
    const saved = await saveDocument(
      id,
      session.user.id,
      body.document,
      body.revision
    )

    return Response.json({ id: saved.id, revision: saved.revision })
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      // 409 and the number that won, so the client can re-read and replay
      // rather than guess. The document is not returned here — the client
      // fetches it, because a conflict body carrying a whole timeline makes
      // every conflict expensive.
      return Response.json(
        {
          error: error.message,
          expected: error.expected,
          actual: error.actual,
        },
        { status: 409 }
      )
    }

    if (error instanceof Error && error.message === "No such project.") {
      return Response.json({ error: error.message }, { status: 404 })
    }

    throw error
  }
}

/**
 * Shallow, on purpose. This is a shape check to keep a stray payload out of a
 * jsonb column, not a validator — the document is written by our own editor and
 * read back by our own reducer, and a full schema here would be a second
 * definition of VideoDocument to keep in step with the first.
 */
function isDocument(value: unknown): value is VideoDocument {
  if (typeof value !== "object" || value === null) return false

  const candidate = value as Partial<VideoDocument>

  return (
    typeof candidate.version === "number" &&
    typeof candidate.metadata === "object" &&
    candidate.metadata !== null &&
    Array.isArray(candidate.scenes) &&
    typeof candidate.currentSceneId === "string"
  )
}
