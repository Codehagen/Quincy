import { Suspense } from "react"

import { listConnections } from "@/lib/channels"
import { getDrafts } from "@/lib/drafts"
import { feedAccounts } from "@/lib/feed-accounts"
import { getSession } from "@/lib/session"
import { DraftsWorkspace } from "@/components/drafts/drafts-workspace"
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
