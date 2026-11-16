import { Suspense } from "react"

import { WorkspaceLab } from "./workspace-lab"

/**
 * Prototype surface: three workspace layouts for Ideas, each with Marked up
 * as the open idea and upgraded candidate components (owner's brief,
 * 2026-11-16). Outside app/(app), so it needs no session;
 * app/prototypes/layout.tsx hides it in production. Nothing imports from
 * here. The decision goes in DECISION.md; then this folder is deleted.
 */
export const metadata = {
  title: "Prototype — Workspace lab",
  robots: { index: false, follow: false },
}

export default function WorkspaceLabPage() {
  // useSearchParams (?v, ?bare) needs a boundary above it.
  return (
    <Suspense>
      <WorkspaceLab />
    </Suspense>
  )
}
