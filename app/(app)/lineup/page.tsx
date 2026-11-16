import { redirect } from "next/navigation"

import { listConnections } from "@/lib/channels"
import { getLineup } from "@/lib/lineup"
import { dayKeyIn, hhmmIn, resolveTimeZone } from "@/lib/timezone"
import { getSession } from "@/lib/session"
import { LineupScreen } from "@/components/lineup/lineup-list"
import { constructMetadata } from "@/lib/metadata"

/**
 * When approved writing goes out.
 *
 * The step after Drafts. Drafts answers "is this good enough"; this answers
 * "when does it go out", and keeping them apart is what stops you picking a
 * time for writing you have not finished reading.
 *
 * **Not a calendar.** docs/vision.md files that under what we are deliberately
 * not building: "Nobody shows lineage; everybody shows a calendar." Three
 * layouts were built in app/prototypes/lineup and the day-grouped list won —
 * seven columns left ~135px each with the sidebar open, wrapped every idea onto
 * three lines, and spent four of seven columns saying "nothing scheduled". A
 * month grid would be thirty mostly-empty cells at a volume of a few posts a
 * week. The placeholder this replaced already promised as much: "a running
 * order rather than a calendar grid".
 *
 * What survived from the losing variants is the one sentence they alone could
 * say: a standing slot with nothing in it. That is an absence measured against
 * a commitment rather than a blank date, and it renders as a dashed row inside
 * its own day, in time order.
 *
 * The window is a rolling week from today, not a calendar week from Monday. The
 * question starts now; a Monday-anchored week would spend its first rows on
 * days that have already happened.
 *
 * **A kit page since 2026-11-16** (plans/029: a page moves whole). The queued
 * posts are one running order (kit Reorderable): the day and time belong to the
 * position, so dragging a post moves its day, through `reorderLineup` (one
 * batched write for the whole drop).
 * See components/lineup/lineup-list.tsx.
 */
export const metadata = constructMetadata({
  title: "Lineup",
  noIndex: true,
})

export default async function LineupPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/lineup")
  }

  // Concurrent, because neither read needs the other — the lineup and the
  // connection list are two independent questions about the same account.
  const [lineup, allConnections] = await Promise.all([
    getLineup(session.user),
    listConnections(session.user.id),
  ])

  // The zone every time on this page is drawn in. Passed down rather than read
  // in the client, so the page names the account's zone instead of the
  // browser's — those differ the moment someone travels, and the slot follows
  // the account.
  const zone = resolveTimeZone(session.user.timezone)

  // "Today" and "now" on the account's wall clock, read once here so the
  // server and the client agree on which open slot has already passed.
  const now = new Date()

  // Which channels can actually receive a post on this account. The dialog used
  // to default to X regardless, so an account connected only to LinkedIn made
  // its first slot on a channel that could never publish.
  const connected = allConnections
    .filter((c) => c.state === "active")
    .map((c) => c.channel)

  // The screen renders KitPage itself: its summary counts what is queued, and
  // that changes with every move (docs/design/page.md).
  return (
    <LineupScreen
      initial={lineup}
      connected={connected}
      timezone={zone}
      today={dayKeyIn(now, zone)}
      clock={hhmmIn(now, zone)}
    />
  )
}
