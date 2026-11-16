import { Suspense } from "react"

import { Harness } from "./harness"

/**
 * Prototype surface. Deliberately outside the `(app)` route group: that group
 * redirects to /login, and a design exploration should not need a session.
 * Nothing in `app/(app)` or `components/` imports from here — when a variant
 * is chosen, it gets rebuilt in place and this directory is deleted.
 */
export const metadata = {
  title: "Prototype — Sources",
  robots: { index: false, follow: false },
}

export default function SourcesPrototypePage() {
  // No wrapper of our own: the harness renders the real SidebarProvider shell,
  // which owns its height and background. Suspense is what useSearchParams
  // needs to read ?v=N without opting the whole route out of static rendering.
  return (
    <Suspense>
      <Harness />
    </Suspense>
  )
}
