import { redirect } from "next/navigation"

import { listConnections } from "@/lib/channels"
import { getLineup } from "@/lib/lineup"
import { resolveTimeZone } from "@/lib/timezone"
import { getSession } from "@/lib/session"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { LineupList } from "@/components/lineup/lineup-list"
import { NoLineup } from "@/components/lineup/lineup-parts"
import { SlotComposer } from "@/components/lineup/slot-composer"
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
  const hasAnything =
    lineup.days.some((d) => d.entries.length > 0) || lineup.slots.length > 0

  // The zone every time on this page is drawn in. Passed down rather than read
  // in the client, so the dialog names the account's zone instead of the
  // browser's — those differ the moment someone travels, and the slot follows
  // the account.
  const zone = resolveTimeZone(session.user.timezone)

  // Which channels can actually receive a post on this account. The dialog used
  // to default to X regardless, so an account connected only to LinkedIn made
  // its first slot on a channel that could never publish.
  const connected = allConnections
    .filter((c) => c.state === "active")
    .map((c) => c.channel)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Lineup</PageHeaderTitle>
          <PageHeaderDescription>
            When approved writing goes out. Drafts decides what; this decides
            when.
          </PageHeaderDescription>
        </PageHeaderContent>
        {/* Only once there is a week worth looking at. On an empty account the
            same action is the whole of NoLineup, and offering it twice would
            make the first-run screen a decoration around a button. */}
        {hasAnything ? (
          <SlotComposer
            existing={lineup.slots}
            connected={connected}
            timezone={zone}
          />
        ) : null}
      </PageHeader>

      {/* An account with no slots and nothing scheduled has never used this
          surface, so it gets the first-run screen rather than seven empty days.
          Once a single slot exists the week is worth showing, because an empty
          slot is itself information. */}
      {hasAnything ? (
        <LineupList initial={lineup} />
      ) : (
        <NoLineup timezone={zone} connected={connected} />
      )}
    </div>
  )
}
