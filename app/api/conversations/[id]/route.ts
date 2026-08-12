
import { getSession } from "@/lib/session"
import { deleteConversation } from "@/lib/conversations"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  const { id } = await params

  // The delete is scoped to the session's user, so someone else's id simply
  // matches no rows. No existence check first — that would answer "does this
  // conversation exist" for anyone who asks.
  await deleteConversation(id, session.user.id)

  return new Response(null, { status: 204 })
}
