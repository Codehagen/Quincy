import { redirect } from "next/navigation"

import { constructMetadata } from "@/lib/metadata"
import { getNumbers } from "@/lib/numbers"
import { getSession } from "@/lib/session"
import { resolveTimeZone } from "@/lib/timezone"
import { NumbersScreen } from "@/components/numbers/numbers-screen"

/**
 * What actually landed — the shape first, then the cause.
 *
 * This surface was a `SurfacePlaceholder` for months, promising to "read
 * backwards into Riffs, so the next round starts from what performed instead of
 * from nothing". Three readings were built at /prototypes/numbers against this
 * account's real corpus, and two of them are here, in the order you need them:
 *
 * 1. **Baseline** — the distribution. Every post as a deviation from your own
 *    median, on one log2 scale, with the chart/table toggle above it. This is
 *    the *shape* of what you have published: a long quiet floor with a few
 *    spikes standing out of it.
 * 2. **Ledger** — the cause. Rows are angles, posts are the evidence filed
 *    under them. This is the part that keeps the placeholder's promise: the
 *    distribution tells you that a few posts carry the rest, and the ledger
 *    tells you what those posts had in common.
 *
 * They are not two pages stapled together. Baseline's own closing note asked
 * exactly the question Ledger answers — "six of the posts below the line are
 * link replies that were never competing for reach; filtering those out is the
 * next question this page has to answer" — and that sentence is now derived
 * from the corpus rather than asserted.
 *
 * Two things the page refuses to do:
 *
 * - **Compare you to anybody else.** Every number is a multiple of your own
 *   median. A follower count is not something you control.
 * - **Claim a join it does not have.** The angles are inferred from the shape of
 *   each opening line, because `scheduled_post` has published nothing yet and
 *   there is no `riff_angle` → post edge to read. The page says so, above the
 *   rows, rather than in a comment nobody reads. When a riff does produce a
 *   post, `getNumbers` swaps the inference for the join and this layout does not
 *   change.
 *
 * A kit page since 2026-11-16 (plans/029). This file reads; the markup is
 * components/numbers/numbers-screen.tsx, so a filled corpus can be laid out
 * from fixtures in app/prototypes/setup-pages.
 */
export const metadata = constructMetadata({
  title: "Numbers",
  noIndex: true,
})

export default async function NumbersPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/numbers")
  }

  // Dates are formatted on the server in the reader's zone. See lib/timezone.
  const zone = resolveTimeZone(session.user.timezone)
  const numbers = await getNumbers(session.user.id, zone)

  return <NumbersScreen numbers={numbers} />
}
