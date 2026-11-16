import { Suspense } from "react"

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
 * channel, no rewrite prompt. Steering belongs upstream on /ideas where the
 * decision is still open; by the time a piece is written, the question is whether
 * these words go out, and a page that asks two questions answers neither.
 *
 * **A kit page since 2026-11-16** (plans/029: a page moves whole). The
 * two-pane inbox became list and detail in one Stage (docs/design/page.md):
 * the pieces as ListRows, the open piece under them as one DraftCard per
 * version. The argument that killed the old card grid still holds — five of
 * seven real pieces have one version — so the versions stack, never sit side
 * by side. See components/drafts/drafts-inbox.tsx.
 *
 * **The paste box is not here, and that was a mistake worth recording.** It
 * shipped on this page in plans/016 — a control that creates a draft, on the page
 * whose own rule two paragraphs up is that it asks one question. plans/017 moved
 * it to /ideas, where the decision it needs is still open. Everything that
 * arrives here has already been decided on; this page only asks whether the words
 * go out.
 */
export const metadata = constructMetadata({
  title: "Drafts",
  noIndex: true,
})

/** Two characters at most, from the name or else the address, for the card's Avatar. */
function initialsOf(user: { name?: string | null; email: string }) {
  return (user.name?.trim() || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export default async function DraftsPage() {
  // The layout is the gate (app/(app)/layout.tsx), and it keeps the query
  // (?piece=…) on the way to /login; a redirect here dropped it.
  const session = await getSession()
  if (!session) return null

  const drafts = await getDrafts(session.user)

  /**
   * The screen renders KitPage itself, because the summary counts what is
   * still waiting and that count changes with every Approve
   * (docs/design/page.md, "Where KitPage renders").
   *
   * `useQueryState` reads which piece is open; Suspense is what keeps that from
   * opting the whole route out of static rendering.
   */
  return (
    <Suspense>
      <DraftsInbox initial={drafts} initials={initialsOf(session.user)} />
    </Suspense>
  )
}
