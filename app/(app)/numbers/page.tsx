import { Suspense } from "react"

import { constructMetadata } from "@/lib/metadata"
import { loadNumbers } from "@/lib/numbers-load"
import { getSession } from "@/lib/session"
import { NumbersReading, NumbersWorkspace } from "@/components/numbers/numbers-workspace"

/**
 * How it is going, against your own usual. **The one dashboard**
 * (docs/design/decisions.md, "Never"; picked 2026-11-16 from
 * /prototypes/numbers-lab: "Dashboard is the page, and Table is what it
 * opens"): a period switch, four tiles (Replies, Came back, Posts, Views per
 * post; Depth before Volume), and panels for the weekly trend, the people
 * who keep showing up, what worked and what Quincy did. A tile opens Table
 * filtered to its measure; a "What worked" row opens that post.
 *
 * Every number is a sentence against the person's own usual: no follower
 * count, no bare total, no colour for good or bad (docs/vision.md).
 *
 * This file reads (lib/numbers-load.ts, SELECTs only: nothing written,
 * nothing bought); the arithmetic is lib/numbers-read.ts and the markup is
 * components/numbers/numbers-workspace.tsx. Who replied is not stored yet,
 * so "Came back" and the people panel say "Not read yet".
 */

export const metadata = constructMetadata({
  title: "Numbers",
  noIndex: true,
})

async function Numbers() {
  // The layout is the gate (app/(app)/layout.tsx): it redirects to /login.
  const session = await getSession()
  if (!session) return null
  const data = await loadNumbers(session.user.id)
  return <NumbersWorkspace data={data} />
}

export default function NumbersPage() {
  // Suspense twice over: the read, and `useQueryStates` (the period and the
  // Table live in the URL). The fallback is the working line (the friend
  // reading, and words), never bars.
  return (
    <Suspense fallback={<NumbersReading />}>
      <Numbers />
    </Suspense>
  )
}
