import { cache } from "react"
import { eq } from "drizzle-orm"

import { db } from "./db"
import { subscription } from "./schema"
import { getSession } from "./session"
import { GOOD_STATUSES, LAPSED_STATUSES } from "./subscription-status"
import {
  resolveEntitlementForRequest,
  type Entitlement,
} from "./entitlement"

export type { Entitlement }

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null
  }
  return value instanceof Date ? value : new Date(value)
}

/**
 * Entitlement for the current request, resolved once.
 *
 * Server Components and server actions only, exactly like `getSession` — and
 * cached for the same reason. The app layout, a page, and a banner all asking
 * is one lookup, not three.
 */
export const getEntitlement = cache(
  async (): Promise<Entitlement | null> => {
    const session = await getSession()

    if (!session) {
      return null
    }

    return resolveEntitlementForRequest(session.user)
  }
)

/**
 * Everything the billing page needs, including the part the gate deliberately
 * does not look at.
 *
 * `resolveEntitlement` answers one question — may this account spend? — and it
 * short-circuits on the trial because that keeps the free day free of round
 * trips. That shortcut is right for a gate and wrong for a page, and the
 * difference is a money bug: somebody who subscribes *during* their free day
 * is still "trialing" until the deadline passes, so the billing page kept
 * offering them a Subscribe button they had already pressed. Better Auth does
 * not deduplicate that — the plugin's own docs are explicit that upgrading
 * without a `subscriptionId` can open a second subscription alongside the
 * first. Two charges a month, from one button.
 *
 * So the split is deliberate: the gate stays cheap and asks only about
 * spending, and this — one page, cold path, one extra query — always looks at
 * the subscription table before deciding what to offer.
 */
export type BillingSnapshot = {
  state: Entitlement["state"]
  /** True when Stripe has a subscription that is currently good. */
  subscribed: boolean
  trialEndsAt: Date | null
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export const getBillingSnapshot = cache(
  async (): Promise<BillingSnapshot | null> => {
    const session = await getSession()

    if (!session) {
      return null
    }

    const trialEndsAt = toDate(session.user.trialEndsAt)

    const rows = await db
      .select({
        status: subscription.status,
        periodEnd: subscription.periodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      })
      .from(subscription)
      .where(eq(subscription.referenceId, session.user.id))

    const live = rows.find((row) => row.status && GOOD_STATUSES.has(row.status))

    // Paid beats trialing. Someone who subscribed on day one is a customer,
    // and telling them their trial is still running invites a second purchase.
    if (live) {
      return {
        state: "active",
        subscribed: true,
        trialEndsAt,
        periodEnd: toDate(live.periodEnd),
        cancelAtPeriodEnd: Boolean(live.cancelAtPeriodEnd),
      }
    }

    const trialing = Boolean(trialEndsAt && trialEndsAt.getTime() > Date.now())
    const lapsed = rows.some(
      (row) => row.status && LAPSED_STATUSES.has(row.status)
    )

    return {
      state: trialing ? "trialing" : lapsed ? "lapsed" : "expired",
      subscribed: false,
      trialEndsAt,
      periodEnd: null,
      cancelAtPeriodEnd: false,
    }
  }
)
