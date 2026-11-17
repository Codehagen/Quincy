import { Suspense } from "react"

import { listConnections } from "@/lib/channels"
import { feedAccounts } from "@/lib/feed-accounts"
import { getLineupWeek } from "@/lib/lineup"
import { getSession } from "@/lib/session"
import { dayKeyIn, hhmmIn, resolveTimeZone } from "@/lib/timezone"
import { LineupLoading } from "@/components/lineup/lineup-loading"
import { LineupWorkspace } from "@/components/lineup/lineup-workspace"
import { constructMetadata } from "@/lib/metadata"

/**
 * When approved writing goes out.
 *
 * The step after Drafts. Drafts answers "is this good enough"; this answers
 * "when does it go out", and keeping them apart is what stops you picking a
 * time for writing you have not finished reading.
 *
 * **A calendar, chosen on purpose** (2026-11-16, /prototypes/lineup-lab,
 * "2 · Calendar"; the owner: "make this into a calendar that we also can
 * have all the times between also"). docs/vision.md warns that "everybody
 * shows a calendar", and this one stays a working surface rather than a
 * view: every block is a post a person approved or a slot they committed
 * to, each with a verb on it, and there is no count on a block, a day or the
 * week. A gap is an open slot, drawn dashed against the commitment it
 * breaks, or an empty quarter hour that offers to become one.
 *
 * The week is Monday to Sunday (`?week=` names another), read by
 * `getLineupWeek`; the list's rolling week (`getLineup`) stays for the chat.
 * See components/lineup/lineup-workspace.tsx.
 */
export const metadata = constructMetadata({
  title: "Lineup",
  noIndex: true,
})

/**
 * The reads sit under the page's own Suspense, as on /drafts: on a client
 * navigation the layout's boundary is above what re-renders, so the uncached
 * reads would block it. The fallback is the workspace's frame (LineupLoading):
 * the title, and the calendar's hours and columns at their final size.
 */
export default function LineupPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  return (
    <Suspense fallback={<LineupLoading />}>
      <Lineup searchParams={searchParams} />
    </Suspense>
  )
}

async function Lineup({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  // The layout is the gate (app/(app)/layout.tsx) and keeps the query on the way to /login.
  const session = await getSession()
  if (!session) return null

  const { week } = await searchParams
  // "Today" and "now" on the account's wall clock, read once here so the
  // server and the client agree on which slot has already passed.
  const now = new Date()
  const zone = resolveTimeZone(session.user.timezone)

  const [lineup, connections] = await Promise.all([
    getLineupWeek(session.user, { week: typeof week === "string" ? week : null, now }),
    listConnections(session.user.id),
  ])

  // Which channels can receive a post: a slot is only offered on these.
  const connected = connections.filter((c) => c.state === "active").map((c) => c.channel)

  return (
    <LineupWorkspace
      initial={lineup}
      connected={connected}
      timezone={zone}
      clock={{ day: dayKeyIn(now, zone), time: hhmmIn(now, zone) }}
      accounts={feedAccounts(session.user, connections)}
    />
  )
}
