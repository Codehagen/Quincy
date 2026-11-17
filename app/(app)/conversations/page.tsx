import { Suspense } from "react"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/session"
import { listAllConversations } from "@/lib/conversations"
import { formatConversationDate } from "@/lib/format-date"
import { resolveTimeZone } from "@/lib/timezone"
import {
  ButtonLink,
  EmptyState,
  KitPage,
  List,
  ListHeading,
  NavRow,
  Stage,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { StageSkeleton } from "@/components/quincy/stage-skeleton"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Conversations",
  noIndex: true,
})

/**
 * Every conversation, newest first.
 *
 * On the kit since 2026-11-16. A row goes to a page, so each is a NavRow
 * (docs/design/lists.md); the list is ordered by time across several days,
 * so the day is a ListHeading over its rows rather than a date repeated at
 * the end of every one.
 */
/**
 * The reads sit under the page's own Suspense, not only the layout's: on a
 * client navigation the layout's boundary is above what re-renders, so the
 * old page held until every read landed. The fallback is the page's frame,
 * its title (states.md, "Working"), so the page opens at once and the title
 * never moves when the rest arrives.
 */
export default function ConversationsPage() {
  return (
    <Suspense
      fallback={
        <KitPage title="Conversations">
          <StageSkeleton lead={null} lines={["18%", "64%", "52%", "70%", "18%", "58%", "46%"]} />
        </KitPage>
      }
    >
      <Conversations />
    </Suspense>
  )
}

async function Conversations() {
  const session = await getSession()

  if (!session) {
    redirect("/login?next=%2Fconversations")
  }

  const conversations = await listAllConversations(session.user.id)
  // "Today" has to mean the reader's today, not the server's. See lib/timezone.
  const zone = resolveTimeZone(session.user.timezone)

  // Already newest first, so the days come out in order and each label starts
  // a new group exactly once.
  const now = new Date()
  const days: { label: string; items: typeof conversations }[] = []
  for (const item of conversations) {
    const label = formatConversationDate(item.updatedAt, zone, now)
    const last = days.at(-1)
    if (last && last.label === label) last.items.push(item)
    else days.push({ label, items: [item] })
  }

  if (conversations.length === 0) {
    return (
      <KitPage title="Conversations">
        <Stage aria-label="Conversations">
          <EmptyState
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold="No conversations yet."
            rest="Ask Quincy something in Studio and it shows up here."
          >
            <ButtonLink href="/studio">Open Studio</ButtonLink>
          </EmptyState>
        </Stage>
      </KitPage>
    )
  }

  return (
    <KitPage
      title="Conversations"
      summary="Studio holds one conversation. This holds all of them."
      actions={<ButtonLink href="/studio">New conversation</ButtonLink>}
    >
      <Stage aria-label="Conversations">
        <List>
          {days.map((day) => [
            <ListHeading key={`day-${day.label}`}>{day.label}</ListHeading>,
            ...day.items.map((item) => (
              <NavRow key={item.id} href={`/c/${item.id}`}>
                {item.title ?? "Untitled"}
              </NavRow>
            )),
          ])}
        </List>
      </Stage>
    </KitPage>
  )
}
