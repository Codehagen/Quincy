"use client"

import { useEffect, useState } from "react"

import { authClient } from "@/lib/auth-client"
import { Button, Text } from "@/components/kit"

const BILLING_PATH = "/settings/billing"

/**
 * Checkout and the billing portal, both of which end in a redirect to Stripe.
 *
 * Deliberately not a form with a server action. Better Auth's client plugin
 * already owns the round trip and hands back a URL, and wrapping that in an
 * action would mean maintaining a second path to the same redirect.
 *
 * Errors render in place rather than throwing. A failed checkout is a Tuesday —
 * a declined pre-auth, a Stripe outage, a key that was rotated this morning —
 * and an error boundary would replace the whole billing page with a crash
 * screen at the exact moment somebody was trying to give us money.
 */
export function BillingActions({
  mode,
  price,
  disabled,
  disabledReason,
  variant = "action",
}: {
  mode: "subscribe" | "manage"
  /**
   * `action` (default): the page's one ink action. `quiet` where something
   * else is the action, as on the confirmation after Checkout, where the
   * next step is Studio and Manage billing stays reachable beside it.
   */
  variant?: "action" | "quiet"
  /**
   * The monthly price in dollars, from the page. Passed in rather than
   * imported: `PLAN_PRICE_USD` lives in lib/stripe.ts beside the Stripe SDK,
   * which must not reach the browser bundle.
   */
  price: number
  disabled?: boolean
  disabledReason?: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Back from Stripe with the browser's back button restores this page from
  // the back/forward cache with `pending` still true, and the button would be
  // stuck on "Taking you to Stripe…". A persisted pageshow is that case.
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
      const { error: failure } =
        mode === "subscribe"
          ? await authClient.subscription.upgrade({
              plan: "quincy",
              // Both are required by the API. successUrl is rewritten by the
              // plugin into an intermediate hop that waits for the webhook to
              // land before forwarding — without that, arriving back here
              // would race the subscription row and show the paywall to
              // someone who had just paid.
              successUrl: `${BILLING_PATH}?checkout=done`,
              cancelUrl: BILLING_PATH,
            })
          : await authClient.subscription.billingPortal({
              returnUrl: BILLING_PATH,
            })

      if (failure) {
        setError(
          failure.message ??
            (mode === "subscribe"
              ? "Stripe didn’t open checkout. Nothing was charged. Try again."
              : "Stripe didn’t open the billing portal. Try again.")
        )
        setPending(false)
        return
      }
    } catch {
      // A network failure throws rather than returning `error`. Without this
      // the button would stay pending for good.
      setError("Could not reach billing. Try again.")
      setPending(false)
      return
    }

    // On success the browser is already navigating to Stripe. Deliberately not
    // clearing `pending`: releasing the button here would let it be pressed a
    // second time during the redirect and open two checkout sessions.
  }

  return (
    <div className="flex flex-col items-start gap-kit-related">
      {/* The one action on the page unless the caller says otherwise
          (docs/design/actions.md). `pending` keeps it focusable and announces
          the label while the browser leaves. */}
      <Button
        type="button"
        variant={variant}
        size="lg"
        onClick={run}
        disabled={disabled}
        pending={pending}
        pendingLabel="Taking you to Stripe…"
      >
        {mode === "subscribe"
          ? `Subscribe for $${price} a month`
          : "Manage billing"}
      </Button>

      {disabled && disabledReason ? (
        <Text variant="small" tone="muted">
          {disabledReason}
        </Text>
      ) : null}

      {/* A refusal, not destruction (docs/design/states.md): ink, announced
          without taking focus. The button above is the retry. */}
      {error ? <Text role="status">{error}</Text> : null}
    </div>
  )
}
