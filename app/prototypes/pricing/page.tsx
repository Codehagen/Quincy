import { Suspense } from "react"

import { Harness } from "./harness"

/**
 * Prototype surface for the pricing page.
 *
 * Outside the `(marketing)` route group on purpose: that group's layout is an
 * async server component that reads the session and owns the header and
 * footer, and the harness needs to render that chrome inside a client tree.
 * Nothing in `app/(marketing)` or `components/` imports from here — when a
 * direction is chosen it gets rebuilt in place and this directory is deleted.
 */
export const metadata = {
  title: "Prototype — Pricing",
  robots: { index: false, follow: false },
}

export default function PricingPrototypePage() {
  // Suspense is what useSearchParams needs to read ?v=N without opting the
  // whole route out of static rendering.
  return (
    <Suspense>
      <Harness />
    </Suspense>
  )
}
