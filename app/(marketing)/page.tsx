import { HomePage } from "@/components/marketing"
import { constructMetadata } from "@/lib/metadata"

// The landing page is the one that wants the positioning line unsuffixed, so it
// takes the helper's defaults wholesale and only declares its canonical.
export const metadata = constructMetadata({ canonicalUrl: "/" })

/**
 * The homepage (plans/029). The page is in components/marketing/home.tsx so
 * /prototypes/landing renders the same component. Static: nothing here reads
 * per request; the header's session read is behind Suspense in the layout.
 */
export default function MarketingPage() {
  return <HomePage />
}
