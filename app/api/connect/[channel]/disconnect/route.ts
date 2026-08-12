import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/session"
import { disconnect, isConnectableChannel } from "@/lib/channels"

/**
 * POST, not GET. Disconnecting is destructive, and a GET would let a link in
 * an email or an image tag revoke someone's channel by being loaded.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params

  if (!isConnectableChannel(channel)) {
    return new Response("Not found", { status: 404 })
  }

  const session = await getSession()

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  // Scoped to the session's user, so another account's channel simply matches
  // no rows. No existence check first — that would answer "is this connected"
  // for anyone who asks.
  await disconnect(session.user.id, channel)

  revalidatePath("/channels")
  revalidatePath(`/channels/${channel}`)

  return new Response(null, { status: 204 })
}
