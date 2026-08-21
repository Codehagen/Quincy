import { redirect } from "next/navigation"

import { getBillingSnapshot } from "@/lib/billing"
import { getSession } from "@/lib/session"
import { resolveTimeZone } from "@/lib/timezone"
import { isBillingConfigured, PLAN_PRICE_USD } from "@/lib/stripe"
import { TRIAL_DAYS } from "@/lib/trial"
import { BillingActions } from "@/components/billing/billing-actions"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { constructMetadata } from "@/lib/metadata"

/**
 * One plan, so no pricing table. A grid of tiers is a decision the reader does
 * not have; this page answers "where do I stand and what do I press" instead.
 */
export const metadata = constructMetadata({
  title: "Billing",
  noIndex: true,
})

export default async function BillingPage() {
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
      variant: "secondary" as const,
      title: snapshot.trialEndsAt
        ? `Free until ${snapshot.trialEndsAt.toLocaleString("en-GB", {
            weekday: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "Free trial",
      body: `Your ${TRIAL_DAYS === 1 ? "day" : `${TRIAL_DAYS} days`} is on us — everything is switched on, and no card is needed to finish it. Subscribe whenever you are ready and the trial rolls straight into a plan.`,
      mode: "subscribe" as const,
    },
    active: {
      badge: snapshot.cancelAtPeriodEnd ? "Ending" : "Active",
      variant: snapshot.cancelAtPeriodEnd
        ? ("outline" as const)
        : ("default" as const),
      title: snapshot.cancelAtPeriodEnd
        ? `Ends ${renews ?? "at the end of the period"}`
        : `$${PLAN_PRICE_USD} a month`,
      body: snapshot.cancelAtPeriodEnd
        ? "Your plan is cancelled but still running. Nothing changes until the date above, and restarting before then costs nothing."
        : `Everything is switched on${renews ? `, and renews ${renews}` : ""}. Cancel, change your card or pull an invoice from the Stripe portal — it is the same billing account, not a copy of it.`,
      mode: "manage" as const,
    },
    expired: {
      badge: "Read-only",
      variant: "outline" as const,
      title: "Your free day is over",
      body: "Your brain, your conversations and your drafts are all still here and always will be. What has stopped is Quincy writing — subscribe and it picks up mid-sentence.",
      mode: "subscribe" as const,
    },
    lapsed: {
      badge: "Payment needed",
      variant: "destructive" as const,
      title: "Your subscription is no longer active",
      body: "A payment did not go through, or the plan was cancelled. Nothing has been deleted — start the plan again and everything switches back on.",
      mode: "subscribe" as const,
    },
  }[snapshot.state]

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pt-6 pb-12">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Billing.</PageHeaderTitle>
          <PageHeaderDescription>
            One plan, ${PLAN_PRICE_USD} a month. Cancel any time.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <Card>
        <CardHeader>
          <Badge variant={copy.variant} className="w-fit">
            {copy.badge}
          </Badge>
          <CardTitle className="text-section">{copy.title}</CardTitle>
          <CardDescription className="text-pretty">{copy.body}</CardDescription>
        </CardHeader>
        <CardContent>
          <BillingActions
            mode={copy.mode}
            disabled={!isBillingConfigured}
            disabledReason={
              isBillingConfigured
                ? undefined
                : "Billing is not configured in this environment — STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are missing."
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
