"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { BillingActions } from "@/components/billing/billing-actions"
import { Button, ButtonLink, Card, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

/**
 * What the plan's pane on /settings shows on the way back from Checkout
 * (`/settings?section=plan&checkout=done`). Two states, both chosen by the server
 * from the snapshot, so this file never decides whether somebody has paid:
 *
 * - CheckoutConfirmed: the snapshot already says active. Normally the case,
 *   because the plugin's success hop syncs the subscription before it
 *   redirects here.
 * - CheckoutPending: the snapshot does not say active yet (the webhook has
 *   not landed, or the payment method settles later). It asks the server
 *   again a bounded number of times; when the server renders active, the
 *   page swaps this component for CheckoutConfirmed and the loop stops with
 *   the unmount.
 *
 * Neither state offers Subscribe. During the lag a Subscribe would open a
 * second subscription beside the one Stripe is still confirming, and both
 * would bill (see the `mode` comment in the billing page).
 */

/** The friend above the words: decorative, the heading names the state. */
function FriendSlot({ state }: { state: "sent" | "waiting" }) {
  return (
    <span className="text-kit-ink">
      <Friend state={state} size={48} />
    </span>
  )
}

export function CheckoutConfirmed({
  renews,
  soldThroughLink,
  price,
  disabled,
}: {
  /** The renewal date, already formatted in the person's zone by the page. */
  renews?: string
  /** MANAGED_PAYMENTS, read on the server: Link sends the receipt. */
  soldThroughLink: boolean
  price: number
  disabled?: boolean
}) {
  const titleRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    // The heading is the answer to the payment the person just made, so focus
    // lands on it and a screen reader reads it, as the auth screens do when
    // an answer replaces a form.
    titleRef.current?.focus()

    // Strip `?checkout=done` once the confirmation is on screen. Left in, a
    // reload or a bookmark days later would replay "you just subscribed" to
    // somebody who subscribed last month. Only here, never while pending:
    // there the query is what keeps Subscribe off the page across a reload.
    const url = new URL(window.location.href)
    if (url.searchParams.has("checkout")) {
      url.searchParams.delete("checkout")
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])

  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <FriendSlot state="sent" />
        <div className="flex flex-col gap-kit-related">
          <Text as="h2" weight="strong" ref={titleRef} tabIndex={-1}>
            You are on the plan.
          </Text>
          <Text tone="muted">
            <span className="text-pretty">
              {renews
                ? `Everything is switched on, and renews ${renews}.`
                : "Everything is switched on."}
              {soldThroughLink
                ? " The receipt comes from Link by email, and your card statement reads LINK.COM* QUINCY."
                : " The receipt comes from Stripe by email."}
            </span>
          </Text>
        </div>
        <div className="flex flex-wrap items-start gap-kit-related">
          <ButtonLink href="/studio" variant="action" size="lg">
            Back to Studio
          </ButtonLink>
          <BillingActions mode="manage" variant="quiet" price={price} disabled={disabled} />
        </div>
      </div>
    </Card>
  )
}

/** One refresh every 2s, at most 10: about 20s before the page says so. */
const INTERVAL_MS = 2_000
const MAX_TRIES = 10

export function CheckoutPending({ soldThroughLink }: { soldThroughLink: boolean }) {
  const router = useRouter()
  const [tries, setTries] = React.useState(0)
  const [gaveUp, setGaveUp] = React.useState(false)
  // After the first "Check again" the button stays mounted (pending) while the
  // round runs, so the focus that pressed it is not dropped onto the page.
  const [retried, setRetried] = React.useState(false)

  // Each refresh is one database read on the server (getBillingSnapshot), so
  // the ceiling is MAX_TRIES reads per round. A round only starts on landing
  // or from "Check again", which is not on screen while a round runs, so the
  // round itself is the cooldown on the button.
  React.useEffect(() => {
    if (gaveUp) return

    let timer: ReturnType<typeof setTimeout> | undefined

    function tick() {
      // A hidden tab does not ask. The visibility listener below starts the
      // timer again when the tab comes back, and the try is not spent.
      if (document.visibilityState === "hidden") return
      if (tries >= MAX_TRIES) {
        // The last refresh has had a full interval to land and did not swap
        // this component out, so Stripe has not confirmed within the round.
        setGaveUp(true)
        return
      }
      router.refresh()
      setTries((n) => n + 1)
    }

    function onVisibility() {
      if (document.visibilityState !== "visible") return
      clearTimeout(timer)
      timer = setTimeout(tick, INTERVAL_MS)
    }

    timer = setTimeout(tick, INTERVAL_MS)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [tries, gaveUp, router])

  function checkAgain() {
    setTries(0)
    setGaveUp(false)
    setRetried(true)
  }

  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <FriendSlot state="waiting" />
        {/* One live region for both lines, so the change from waiting to
            not-confirmed is announced without moving focus. */}
        <div role="status" className="flex flex-col gap-kit-related">
          <Text as="h2" weight="strong">
            {gaveUp ? "Stripe has not confirmed the plan yet." : "Confirming with Stripe."}
          </Text>
          <Text tone="muted">
            <span className="text-pretty">
              {gaveUp
                ? `Some payment methods take a few minutes to clear. Do not pay again: the payment is already with Stripe. Look for the receipt in your email${soldThroughLink ? " from Link" : ""}, or check again in a minute.`
                : "Back from checkout. Stripe usually confirms the plan within a few seconds, and this page updates when it does."}
            </span>
          </Text>
        </div>
        {gaveUp || retried ? (
          <div>
            <Button
              type="button"
              onClick={checkAgain}
              pending={!gaveUp}
              pendingLabel="Checking…"
            >
              Check again
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
