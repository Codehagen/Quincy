import { Suspense } from "react"

import { LineupLab } from "./lineup-lab"

/**
 * Prototype surface: three working-surface layouts for Lineup (owner's
 * brief, 2026-11-16), on fixtures, at true size in the app shell. Outside
 * app/(app), so it needs no session of its own; app/prototypes/layout.tsx
 * hides it in production. Nothing imports from here. The decision goes in
 * DECISION.md; then this folder is deleted.
 */
export const metadata = {
  title: "Prototype · Lineup lab",
  robots: { index: false, follow: false },
}

export default function LineupLabPage() {
  // useSearchParams (?v, ?clean, ?state, ?week) needs a boundary above it.
  return (
    <Suspense>
      <LineupLab />
    </Suspense>
  )
}
