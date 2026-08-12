import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createIdGenerator } from "ai"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { constructMetadata } from "@/lib/metadata"
import { getRiffs } from "@/lib/riffs"
import { user } from "@/lib/schema"
import { getSession } from "@/lib/session"
import { composeStudioGreeting, GREETED_COOKIE } from "@/lib/studio-greeting"
import { StudioChat } from "@/components/chat/studio-chat"

const newConversationId = createIdGenerator({ prefix: "conv", size: 16 })

export const metadata = constructMetadata({
  title: "Studio",
  noIndex: true,
})

/**
 * The empty state is Quincy's turn, not a hero. Decided from
 * /prototypes/studio on 2026-08-12 — the direction, the values, and the three
 * rejected options are written down in components/chat/studio-greeting.tsx.
 *
 * A fresh id per visit, so opening Studio twice does not write two turns into
 * one thread. The id only reaches the database once something is actually
 * said. The page is request-time by nature now (`headers()` via getSession,
 * `cookies()` for the greeted flag), which is what `connection()` used to
 * force when the id generator was the only per-request read.
 */
export default async function StudioPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/studio")
  }

  // The name comes from the user row, not the session: the session cookie
  // caches its user snapshot, so after a rename it greets with the old name
  // until the cookie refreshes. The row is where the write landed.
  const [cookieStore, [account], riffs] = await Promise.all([
    cookies(),
    db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    getRiffs(session.user),
  ])

  const greeting = composeStudioGreeting({
    name: account?.name ?? session.user.name,
    riffs,
    typed: !cookieStore.has(GREETED_COOKIE),
  })

  return (
    <StudioChat conversationId={newConversationId()} greeting={greeting} />
  )
}
