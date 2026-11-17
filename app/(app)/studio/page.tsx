import { Suspense } from "react"
import { cookies } from "next/headers"
import { createIdGenerator } from "ai"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { constructMetadata } from "@/lib/metadata"
import { getRiffs } from "@/lib/riffs"
import { user } from "@/lib/schema"
import { getSession } from "@/lib/session"
import { composeStudioGreeting, GREETED_COOKIE } from "@/lib/studio-greeting"
import { waitingWork } from "@/lib/waiting-work"
import { initialsOf } from "@/lib/initials"
import { StudioLoading } from "@/components/studio/studio-loading"
import { StudioScreen } from "@/components/studio/studio-screen"

const newConversationId = createIdGenerator({ prefix: "conv", size: 16 })

export const metadata = constructMetadata({
  title: "Studio",
  noIndex: true,
})

/**
 * The empty state is Quincy's turn, not a hero. Decided from
 * /prototypes/studio on 2026-08-12 — the direction, the values, and the three
 * rejected options are written down in components/quincy/quincy-greeting.tsx
 * and lib/studio-greeting.ts. A kit page since 2026-11-16: the chatbot
 * template's structure (components/studio/) on the kit.
 *
 * A fresh id per visit, so opening Studio twice does not write two turns into
 * one thread. The id only reaches the database once something is actually
 * said. The page is request-time by nature now (`headers()` via getSession,
 * `cookies()` for the greeted flag), which is what `connection()` used to
 * force when the id generator was the only per-request read.
 */
export default function StudioPage() {
  // Its own boundary: on a client navigation the layout's is above what
  // re-renders, so reads awaited outside one held the navigation.
  return (
    <Suspense fallback={<StudioLoading />}>
      <Studio />
    </Suspense>
  )
}

async function Studio() {
  // The layout is the gate (app/(app)/layout.tsx): a missing session
  // redirects there to /login with the path and query kept. Returning nothing
  // here leaves that one redirect to answer.
  const session = await getSession()
  if (!session) return null

  // The name comes from the user row, not the session: the session cookie
  // caches its user snapshot, so after a rename it greets with the old name
  // until the cookie refreshes. The row is where the write landed.
  // `waitingWork` alongside the others rather than after them: it is a read of
  // the same desk from a different angle (plan 028, 2a — what has been sitting
  // there and never been offered), it depends on nothing the others return,
  // and sequencing it would add a round trip to the morning page for a
  // sentence. It answers null on any failure, so nothing here has to guard it.
  const [cookieStore, [account], riffs, offer] = await Promise.all([
    cookies(),
    db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    getRiffs(session.user),
    waitingWork(session.user),
  ])

  const greeting = composeStudioGreeting({
    name: account?.name ?? session.user.name,
    riffs,
    offer,
    typed: !cookieStore.has(GREETED_COOKIE),
  })

  // key, as on /c/[id]: useChat reads its id and messages only when the Chat
  // instance is built, so a second visit to /studio (a client navigation that
  // reuses this component) must get a new instance for its new id.
  const conversationId = newConversationId()
  return (
    <StudioScreen
      key={conversationId}
      conversationId={conversationId}
      greeting={greeting}
      initials={initialsOf(session.user)}
    />
  )
}
