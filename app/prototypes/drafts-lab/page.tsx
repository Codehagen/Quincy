import { Suspense } from "react"

import { DraftsLab } from "./drafts-lab"

/**
 * Prototype surface: three working-surface layouts for Drafts (owner's
 * brief, 2026-11-16), on fixtures, at true size in the app shell. Outside
 * app/(app), so it needs no session of its own; app/prototypes/layout.tsx
 * hides it in production. Nothing imports from here. The decision goes in
 * DECISION.md; then this folder is deleted.
 */
export const metadata = {
  title: "Prototype · Drafts lab",
  robots: { index: false, follow: false },
}

export default function DraftsLabPage() {
  // useSearchParams (?v, ?clean, ?state, ?queue) needs a boundary above it.
  return (
    <Suspense>
      <DraftsLab />
    </Suspense>
  )
}
