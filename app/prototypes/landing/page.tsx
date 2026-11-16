import { HomePage, MarketingShell } from "@/components/marketing"
import { constructMetadata } from "@/lib/metadata"

/**
 * The landing prototype, now the homepage. It renders the same HomePage as
 * `/`, in the same shell, so a link to this route keeps working while the
 * move settles. Delete it once nothing points here.
 */
export const metadata = constructMetadata({
  title: "Landing",
  noIndex: true,
})

export default function LandingPrototype() {
  return (
    <MarketingShell>
      <HomePage />
    </MarketingShell>
  )
}
