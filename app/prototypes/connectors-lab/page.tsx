import { Suspense } from "react"

import { ConnectorsLab } from "./connectors-lab"

/**
 * Prototype surface: Sources and Channels as one Connectors page, after the
 * owner's reference (2026-11-16), on fixtures, at true size in the app
 * shell. Outside app/(app), so it needs no session of its own;
 * app/prototypes/layout.tsx hides it in production. Nothing imports from
 * here. The decision goes in DECISION.md; then this folder is deleted.
 */
export const metadata = {
  title: "Prototype · Connectors lab",
  robots: { index: false, follow: false },
}

export default function ConnectorsLabPage() {
  // useSearchParams (?v, ?state, ?clean, ?cols) needs a boundary above it.
  return (
    <Suspense>
      <ConnectorsLab />
    </Suspense>
  )
}
