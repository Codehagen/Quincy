import { Suspense } from "react"
import { redirect } from "next/navigation"

import { SettingsLoading } from "@/components/settings/settings-loading"
import { constructMetadata } from "@/lib/metadata"

/**
 * Billing is the "Plan & billing" section of /settings since 2026-11-17
 * (docs/design/decisions.md, "Settings is a working surface"). This route
 * stays so the links already out there keep working: a bookmark, an old
 * mail, a Stripe portal session or a Checkout started before the change,
 * whose return address is this path. It forwards to the plan's section and
 * keeps `?checkout=done`, so the confirmation (and the "never offer
 * Subscribe while Stripe confirms" rule) still holds on the way back.
 *
 * Under the page's Suspense because `searchParams` is a runtime read under
 * cacheComponents; the fallback is the frame the redirect lands on.
 */
export const metadata = constructMetadata({
  title: "Settings",
  noIndex: true,
})

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default function BillingPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <Forward searchParams={searchParams} />
    </Suspense>
  )
}

async function Forward({ searchParams }: Props): Promise<null> {
  const { checkout } = await searchParams
  redirect(checkout === "done" ? "/settings?section=plan&checkout=done" : "/settings?section=plan")
}
