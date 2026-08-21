"use client"

import { useState } from "react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

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
  disabled,
  disabledReason,
}: {
  mode: "subscribe" | "manage"
  disabled?: boolean
  disabledReason?: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setPending(true)
    setError(null)

    const { error: failure } =
      mode === "subscribe"
        ? await authClient.subscription.upgrade({
            plan: "quincy",
            // Both are required by the API. successUrl is rewritten by the
            // plugin into an intermediate hop that waits for the webhook to
            // land before forwarding — without that, arriving back here would
            // race the subscription row and show the paywall to someone who
            // had just paid.
            successUrl: `${BILLING_PATH}?checkout=done`,
            cancelUrl: BILLING_PATH,
          })
        : await authClient.subscription.billingPortal({
            returnUrl: BILLING_PATH,
          })

    if (failure) {
      setError(failure.message ?? "Something went wrong. Try again.")
      setPending(false)
      return
    }

    // On success the browser is already navigating to Stripe. Deliberately not
    // clearing `pending`: releasing the button here would let it be pressed a
    // second time during the redirect and open two checkout sessions.
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        onClick={run}
        disabled={pending || disabled}
        size="lg"
      >
        {pending
          ? "Taking you to Stripe…"
          : mode === "subscribe"
            ? "Subscribe — $49/month"
            : "Manage billing"}
      </Button>

      {disabled && disabledReason ? (
        <p className="text-caption text-muted-foreground">{disabledReason}</p>
      ) : null}

      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
