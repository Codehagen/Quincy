import { Suspense } from "react"

import { listConnections } from "@/lib/channels"
import { getDrafts } from "@/lib/drafts"
import { initialsOf } from "@/lib/initials"
import { getSession } from "@/lib/session"
import { DraftsWorkspace } from "@/components/drafts/drafts-workspace"
import type { FeedAccount } from "@/components/drafts/draft-feed"
import type { FeedAccounts } from "@/components/drafts/open-draft"
import { constructMetadata } from "@/lib/metadata"

/**
 * Where the writing gets approved.
 *
 * The step after Ideas: an idea you decided was worth writing comes back as
 * a piece, written once per channel in a version native to each. You read
 * them and approve what survives. Approving places a version in the next
 * free slot you made on Lineup; nothing here invents a time.
 *
 * **Approval is per version.** Three texts going to three places is three
 * judgements, and one "Approve all" would mean approving writing you have not
 * read.
 *
 * **The page has no editing beyond the text.** No reordering, no adding a
 * channel, no rewrite prompt. Steering belongs upstream on /ideas where the
 * decision is still open; by the time a piece is written, the question is
 * whether these words go out.
 *
 * **A workspace since 2026-11-17** (docs/design/workspace.md; decided on
 * /prototypes/drafts-lab): a toolbar, a dense table of drafts, and the open
 * draft drawn as the real feed it will land in (X's column, LinkedIn's
 * card), edited in place, with Quincy's marks in the margin. Under the fold
 * it is one column grouped by what happens next. See
 * components/drafts/drafts-workspace.tsx.
 *
 * **The paste box is not here, and that was a mistake worth recording.** It
 * shipped on this page in plans/016, a control that creates a draft on the
 * page whose rule is that it asks one question. plans/017 moved it to
 * /ideas, where the decision it needs is still open.
 */
export const metadata = constructMetadata({
  title: "Drafts",
  noIndex: true,
})

/**
 * The reads sit under the page's own Suspense, not only the layout's: on a
 * client navigation from another app page the layout's boundary is above
 * what re-renders, so the uncached reads would block the navigation (Next's
 * instant-navigation check flags exactly that). The same boundary covers
 * `useQueryState`, which reads which piece is open (`?piece=`).
 */
export default function DraftsPage() {
  return (
    <Suspense>
      <Drafts />
    </Suspense>
  )
}

async function Drafts() {
  // The layout is the gate (app/(app)/layout.tsx), and it keeps the query
  // (?piece=…) on the way to /login; a redirect here dropped it.
  const session = await getSession()
  if (!session) return null

  const [drafts, connections] = await Promise.all([getDrafts(session.user), listConnections(session.user.id)])

  return <DraftsWorkspace drafts={drafts} accounts={feedAccounts(session.user, connections)} />
}

/**
 * Who each channel's post is from, as the feed will show it: the connected
 * account's own name, handle and picture, as the channel reported them at
 * connect time (`channel_connection`). Not only `active` rows: a connection
 * waiting on a reconnect is still the account the post goes out as.
 *
 * Where a field is not stored, it is left out rather than made up:
 * - LinkedIn stores no handle (its profile has none), so its post shows the
 *   name alone, as LinkedIn does.
 * - Nothing stores LinkedIn's headline, so the line under the name is empty.
 * - With no connection for a channel, the post is from the person's own
 *   name, with no handle: a handle Quincy has not seen would be a guess in
 *   their name.
 */
function feedAccounts(
  user: { name?: string | null; email: string },
  connections: Awaited<ReturnType<typeof listConnections>>
): FeedAccounts {
  const ownName = user.name?.trim() || user.email.split("@")[0] || user.email
  const fallback: FeedAccount = {
    name: ownName,
    handle: null,
    initials: initialsOf(user),
    avatarUrl: null,
    headline: null,
  }
  const byChannel: Record<string, FeedAccount> = {}
  for (const c of connections) {
    if (c.state === "revoked") continue
    const name = c.displayName?.trim() || ownName
    byChannel[c.channel] = {
      name,
      // Stored as X reports it, "@name"; the feed header adds its own "@".
      handle: c.handle?.replace(/^@/, "").trim() || null,
      initials: initialsOf({ name, email: user.email }),
      avatarUrl: c.avatarUrl,
      headline: null,
    }
  }
  return { byChannel, fallback }
}
