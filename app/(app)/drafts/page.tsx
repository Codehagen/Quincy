import { Suspense } from "react"
import { redirect } from "next/navigation"

import { getDrafts } from "@/lib/drafts"
import { getSession } from "@/lib/session"
import { DraftsInbox } from "@/components/drafts/drafts-inbox"
import { constructMetadata } from "@/lib/metadata"

/**
 * Where the writing gets approved.
 *
 * The step after Riffs: an angle you decided was worth writing comes back as a
 * piece, written once per channel in a version native to each. You read them and
 * approve what survives. Nothing here schedules anything — that is Lineup, and
 * keeping the two apart is what stops you picking a time for writing you have
 * not finished reading.
 *
 * **Approval is per version.** Three texts going to three places is three
 * judgements, and one "Approve all" would mean approving writing you have not
 * read. The count on the rail is a fraction for the same reason.
 *
 * **The page has no editing beyond the text.** No reordering, no adding a
 * channel, no rewrite prompt. Steering belongs upstream on /riffs where the
 * decision is still open; by the time a piece is written, the question is whether
 * these words go out, and a page that asks two questions answers neither.
 *
 * **No wrapper and no page header**, which is the visible half of a decision made
 * against the production table. This used to be `max-w-6xl` holding a column of
 * cards, because the page's job was comparison: three versions side by side is
 * what makes two versions saying the same thing visible. The table said that job
 * barely exists — five of seven real pieces have exactly one version and none
 * have three — so the width was being spent on a case production has never
 * produced, at the cost of a 37-character measure for the case it produces
 * constantly. It is an inbox now: the rail owns the h1 and the description is
 * gone with the header, because a two-pane page explains itself by its shape.
 * See components/drafts/drafts-inbox.tsx for the run and the four pages it
 * compared.
 *
 * **The paste box is not here, and that was a mistake worth recording.** It
 * shipped on this page in plans/016 — a control that creates a draft, on the page
 * whose own rule two paragraphs up is that it asks one question. plans/017 moved
 * it to /riffs, where the decision it needs is still open. Everything that
 * arrives here has already been decided on; this page only asks whether the words
 * go out.
 */
export const metadata = constructMetadata({
  title: "Drafts",
  noIndex: true,
})

export default async function DraftsPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/drafts")
  }

  const drafts = await getDrafts(session.user)

  /**
   * Fills the layout's scroll container rather than growing it — the two sides
   * scroll independently, and an outer scrollbar over a page that already has two
   * would be a third thing to reason about.
   *
   * `useQueryState` reads which piece is open; Suspense is what keeps that from
   * opting the whole route out of static rendering.
   */
  return (
    <Suspense>
      <DraftsInbox initial={drafts} />
    </Suspense>
  )
}
