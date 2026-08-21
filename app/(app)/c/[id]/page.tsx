import { notFound, redirect } from "next/navigation"
import { validateUIMessages, type UIMessage } from "ai"

import { getSession } from "@/lib/session"
import { getConversation, getMessageRows } from "@/lib/conversations"
import { StudioChat } from "@/components/chat/studio-chat"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Conversation",
  noIndex: true,
})

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/c/${id}`)}`)
  }

  // getConversation filters on userId, so someone else's id is indistinguishable
  // from one that does not exist — which is the point. A 403 would confirm the
  // conversation is real.
  //
  // The rows are fetched concurrently with that check rather than after it.
  // The gate has not moved: notFound() still fires before the rows are used,
  // so for a foreign id the transcript is fetched into server memory and
  // discarded — nothing observable changes, and the page stops paying two
  // round trips where one covers both.
  const [conversation, rows] = await Promise.all([
    getConversation(id, session.user.id),
    getMessageRows(id),
  ])

  if (!conversation) {
    notFound()
  }

  // jsonb comes back as unknown. validateUIMessages is the SDK's own way of
  // getting types back rather than casting and hoping.
  const initialMessages = (await validateUIMessages({
    messages: rows.map((row) => ({
      id: row.id,
      role: row.role,
      parts: row.parts,
    })),
  })) as UIMessage[]

  // key is load-bearing: useChat reads `messages` only when the Chat instance is
  // constructed, so switching conversations has to produce a new instance.
  // Without it, navigating between threads would keep showing the first one.
  return (
    <StudioChat
      key={id}
      conversationId={id}
      initialMessages={initialMessages}
    />
  )
}
