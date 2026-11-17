import { Suspense } from "react"
import { redirect } from "next/navigation"

import { getBillingSnapshot } from "@/lib/billing"
import { getSession } from "@/lib/session"
import { resolveTimeZone } from "@/lib/timezone"
import { isBillingConfigured, PLAN_PRICE_USD } from "@/lib/stripe"
import { TRIAL_DAYS } from "@/lib/trial"
import { BillingActions } from "@/components/billing/billing-actions"
import { StageSkeleton } from "@/components/quincy/stage-skeleton"
import { Card, KitPage, Stage, Text } from "@/components/kit"
import { constructMetadata } from "@/lib/metadata"

/**
 * One plan, so no pricing table. A grid of tiers is a decision the reader does
 * not have; this page answers "where do I stand and what do I press" instead.
 *
 * On the kit since 2026-11-16: the state word that used to be a Badge is the
 * first words of the page's summary, the title is the Stage's lead, and the
 * one button (Subscribe or Manage) is the page's ink action. Checkout and the
 * portal are untouched (components/billing/billing-actions.tsx).
 */
export const metadata = constructMetadata({
  title: "Billing",
  noIndex: true,
})

/**
 * The reads sit under the page's own Suspense, not only the layout's: on a
 * client navigation the layout's boundary is above what re-renders, so the
 * old page held until every read landed. The fallback is the page's frame,
 * its title (states.md, "Working"), so the page opens at once and the title
 * never moves when the rest arrives.
 */
export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <KitPage title="Billing">
          <StageSkeleton lines={["92%", "84%", "60%"]} />
        </KitPage>
      }
    >
      <Billing />
    </Suspense>
  )
}

async function Billing() {
  // The snapshot, not the gate. `getEntitlement` short-circuits on the trial
  // and would have this page offering Subscribe to somebody who had already
  // subscribed — see lib/billing.ts.
  const snapshot = await getBillingSnapshot()

  // The layout has already redirected anyone without a session. This is the
  // narrowing, not the gate.
  if (!snapshot) {
    redirect("/login?next=/settings/billing")
  }

  // The zone matters here for one reason: a period that ends at 23:30 UTC is
  // already the next day in Oslo, and "renews on 31 August" against a card that
  // charges on 1 September is the kind of small wrongness people screenshot.
  const session = await getSession()
  const zone = resolveTimeZone(session?.user.timezone)

  const renews = snapshot.periodEnd?.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zone,
  })

  const copy = {
    trialing: {
      badge: "Free trial",
      title: snapshot.trialEndsAt
        ? `Free until ${snapshot.trialEndsAt.toLocaleString("en-GB", {
            weekday: "long",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: zone,
          })}.`
        : "Your free trial is on.",
      body: `Your ${TRIAL_DAYS === 1 ? "day" : `${TRIAL_DAYS} days`} is on us. Everything is switched on, and no card is needed to finish it. Subscribe whenever you are ready and the trial rolls straight into a plan.`,
      mode: "subscribe" as const,
    },
    active: {
      badge: snapshot.cancelAtPeriodEnd ? "Ending" : "Active",
      title: snapshot.cancelAtPeriodEnd
        ? `Ends ${renews ?? "at the end of the period"}.`
        : "You are on the plan.",
      body: snapshot.cancelAtPeriodEnd
        ? "Your plan is cancelled but still running. Nothing changes until the date above, and restarting before then costs nothing."
        : `Everything is switched on${renews ? `, and renews ${renews}` : ""}. Cancel, change your card or pull an invoice from the Stripe portal. It is the same billing account, not a copy of it.`,
      mode: "manage" as const,
    },
    expired: {
      badge: "Read-only",
      title: "Your free day is over.",
      body: "Your brain, your conversations and your drafts are all still here and always will be. What has stopped is Quincy writing. Subscribe and it picks up mid-sentence.",
      mode: "subscribe" as const,
    },
    lapsed: snapshot.recoverable
      ? {
          badge: "Payment needed",
          title: "A payment did not go through.",
          body: "Your subscription is still open, but the last charge failed. Nothing has been deleted. Update your card in the Stripe portal and the same plan switches back on.",
          mode: "manage" as const,
        }
      : {
          badge: "Payment needed",
          title: "Your subscription is no longer active.",
          body: "The plan was cancelled. Nothing has been deleted. Start the plan again and everything switches back on.",
          mode: "subscribe" as const,
        },
  }[snapshot.state]

  // A past_due or unpaid subscription is still open in Stripe. Whatever the
  // state word says (a trial can still be running beside it), the way out is
  // the portal: a Subscribe here would start a second subscription, and both
  // would bill once the card is fixed. Only cancelled or none subscribes.
  const mode = snapshot.recoverable ? ("manage" as const) : copy.mode

  return (
    <KitPage
      title="Billing"
      summary={`${copy.badge}. One plan, $${PLAN_PRICE_USD} a month, cancel any time.`}
    >
      <Stage lead={copy.title}>
        <Card>
          <div className="flex flex-col gap-kit-group">
            <Text tone="muted">{copy.body}</Text>
            <BillingActions
              mode={mode}
              price={PLAN_PRICE_USD}
              disabled={!isBillingConfigured}
              disabledReason={
                isBillingConfigured
                  ? undefined
                  : "Billing is not set up here: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are missing."
              }
            />
          </div>
        </Card>
      </Stage>
    </KitPage>
  )
}
