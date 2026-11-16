import { getAsset } from "@/lib/editor/assets"
import { createProjectFromAsset, listProjects } from "@/lib/editor/projects"
import { getSession } from "@/lib/session"

/**
 * The project list, and the door from a finished ingest into an edit.
 *
 * A project is created *from* an asset rather than empty-then-populated. An
 * empty project is a state with nothing to show and nothing to do, and it would
 * exist only in the seconds between two calls — the same seconds where a failed
 * second call leaves a row nobody can explain.
 */

export async function GET() {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  const projects = await listProjects(session.user.id)

  // Deliberately without the document. It is the whole timeline, it is the
  // largest column on the row, and a list that loads every one of them to
  // render a grid of titles gets slower with every project a person makes.
  return Response.json({
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      revision: project.revision,
      thumbnailKey: project.thumbnailKey,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
    })),
  })
}

export async function POST(request: Request) {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  let body: { assetId?: unknown }
  try {
    body = (await request.json()) as { assetId?: unknown }
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }

  if (typeof body.assetId !== "string" || !body.assetId) {
    return Response.json({ error: "assetId is required." }, { status: 400 })
  }

  const asset = await getAsset(body.assetId, session.user.id)

  if (!asset) {
    return Response.json({ error: "No such asset." }, { status: 404 })
  }

  if (asset.state !== "ready") {
    // Opening an editor on an asset with no proxy shows a black rectangle and
    // a timeline of zero length, which reads as a broken editor rather than as
    // an unfinished upload.
    return Response.json(
      {
        error: "That file is still being processed.",
        state: asset.state,
      },
      { status: 409 }
    )
  }

  const project = await createProjectFromAsset(session.user.id, asset)

  return Response.json(
    {
      id: project.id,
      title: project.title,
      revision: project.revision,
    },
    { status: 201 }
  )
}
