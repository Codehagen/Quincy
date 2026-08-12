import Link from "next/link"
import { redirect } from "next/navigation"
import { Message01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { getSession } from "@/lib/session"
import { listAllConversations } from "@/lib/conversations"
import { formatConversationDate } from "@/lib/format-date"
import { resolveTimeZone } from "@/lib/timezone"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { constructMetadata } from "@/lib/metadata"

export const metadata = constructMetadata({
  title: "Conversations",
  noIndex: true,
})

export default async function ConversationsPage() {
  const session = await getSession()

  if (!session) {
    redirect("/login?next=%2Fconversations")
  }

  const conversations = await listAllConversations(session.user.id)
  // "Today" has to mean the reader's today, not the server's. See lib/timezone.
  const zone = resolveTimeZone(session.user.timezone)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pt-6 pb-12">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Everything you&rsquo;ve asked.</PageHeaderTitle>
          <PageHeaderDescription>
            Studio holds one conversation. This holds all of them.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          {/* nativeButton={false} because this renders an anchor. Base UI
              defaults to assuming a real <button> and warns otherwise — the
              two have different keyboard behaviour, and claiming to be one
              while being the other is what breaks it for assistive tech. */}
          <Button nativeButton={false} render={<Link href="/studio" />}>
            New conversation
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {conversations.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Message01Icon} strokeWidth={1.8} />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>
              Ask Quincy something in Studio and it will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // Rows with hairline separators rather than cards — the same call the
        // Rhythm list made. Twenty cards of identical weight say nothing about
        // which one you want.
        <div className="divide-border/60 divide-y">
          {conversations.map((item) => (
            <Link
              key={item.id}
              href={`/c/${item.id}`}
              className="ring-ring hover:bg-accent/50 flex items-baseline justify-between gap-6 rounded-md px-3 py-3 outline-hidden focus-visible:ring-2"
            >
              <span className="text-body truncate">
                {item.title ?? "Untitled"}
              </span>
              {/* tabular-nums so the dates form a column instead of jittering. */}
              <span className="text-caption text-muted-foreground shrink-0 tabular-nums">
                {formatConversationDate(item.updatedAt, zone)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
