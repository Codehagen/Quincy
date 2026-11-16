import { Suspense } from "react"

import { IdeasLab } from "./ideas-lab"

/**
 * Prototype surface: four directions for /ideas, judged against the
 * landing's ideas picture (owner's brief, 2026-11-16). Outside app/(app), so
 * it needs no session; app/prototypes/layout.tsx hides it in production.
 * Nothing imports from here. When a direction is chosen, record it in
 * DECISION.md, rebuild it in components/riffs/, and delete this folder.
 */
export const metadata = {
  title: "Prototype — Ideas lab",
  robots: { index: false, follow: false },
}

export default function IdeasLabPage() {
  // Suspense is what useSearchParams needs to read ?d= without opting the
  // route out of static rendering.
  return (
    <Suspense>
      <IdeasLab />
    </Suspense>
  )
}
