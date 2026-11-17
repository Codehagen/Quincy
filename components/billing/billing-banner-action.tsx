"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { authClient } from "@/lib/auth-client"
import { Button, ButtonLink, Text } from "@/components/kit"

/** The plan's section of /settings, where billing lives since 2026-11-17. */
const BILLING_HREF = "/settings?section=plan"

/**
 * The banner's way out, except on the page it leads to. On /settings the
 * plan's row opens first when it needs you and holds its own action, and a second ink pill above it would be two
 * actions for one decision (docs/design/actions.md). The words stay: they say
 * why the page matters.
 *
 * Which way out depends on whether the subscription is still open. A past_due
 * or unpaid one (`recoverable`) is fixed in the Stripe portal — the card is
 * updated and the same subscription resumes — so "Fix billing" goes straight
 * there. Sending it to Checkout would open a second subscription beside the
 * first. Only a cancelled plan, or none, is offered Subscribe.
 */
export function BillingBannerAction({ recoverable }: { recoverable: boolean }) {
  const pathname = usePathname()
  // The path alone: usePathname carries no query, and every section of
  // /settings can reach the plan's own button in one press.
  if (pathname === "/settings") return null

  if (recoverable) return <FixBillingButton />

  return (
    <ButtonLink href={BILLING_HREF} variant="action">
      Subscribe
    </ButtonLink>
  )
}

function FixBillingButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Back from Stripe with the browser's back button restores this page from
  // the back/forward cache with `pending` still true. Release it then.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setPending(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

  async function run() {
    setPending(true)
    setError(null)
    try {
      const { error: failure } = await authClient.subscription.billingPortal({
        returnUrl: BILLING_HREF,
      })
      if (failure) {
        setError(failure.message ?? "Could not open billing. Try again.")
        setPending(false)
      }
      // On success the browser is leaving for Stripe; `pending` stays set so
      // the button cannot be pressed twice during the redirect.
    } catch {
      setError("Could not open billing. Try again.")
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-kit-related">
      <Button
        type="button"
        variant="action"
        onClick={run}
        pending={pending}
        pendingLabel="Taking you to Stripe…"
      >
        Fix billing
      </Button>
      {error ? (
        <Text variant="small" role="status">
          {error}
        </Text>
      ) : null}
    </div>
  )
}
