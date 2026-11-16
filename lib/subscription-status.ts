import { eq } from "drizzle-orm"

import { db } from "./db"
import { subscription } from "./schema"

/** Stripe statuses that mean the money is currently good. */
export const GOOD_STATUSES = new Set(["active", "trialing"])

/**
 * Statuses that mean money once worked and has stopped.
 *
 * Deliberately a list rather than "anything that is not good". The plugin
 * writes a row with status `incomplete` the moment checkout is *requested* —
 * before the payment form is even shown — so an abandoned checkout leaves a
 * row behind permanently, and it must not read as a past subscription.
 */
export const LAPSED_STATUSES = new Set(["past_due", "canceled", "unpaid"])

/**
 * Lapsed, but the subscription itself is still open in Stripe: a card failed
 * and Stripe is retrying (`past_due`) or has stopped retrying without
 * cancelling (`unpaid`). The way back is the billing portal — fix the card and
 * the same subscription resumes. A new Checkout here would open a second
 * subscription beside the first, and when the card is fixed both would bill.
 * Only `canceled` (or nothing at all) is a reason to subscribe again.
 */
export const RECOVERABLE_STATUSES = new Set(["past_due", "unpaid"])

/**
 * Whether this reference already has a subscription Stripe considers live.
 *
 * Lives here, and not in lib/billing.ts, because lib/auth.ts needs it too and
 * lib/billing.ts imports lib/session.ts which imports lib/auth.ts. Closing that
 * loop breaks module initialisation in ways that show up at build time rather
 * than here.
 */
export async function hasLiveSubscription(referenceId: string): Promise<boolean> {
  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, referenceId))

  return rows.some((row) => row.status && GOOD_STATUSES.has(row.status))
}

/**
 * Whether a new Checkout for this reference would duplicate a subscription
 * that already exists: one that is live, or one that is past due or unpaid and
 * waiting for a card in the portal (see RECOVERABLE_STATUSES).
 */
export async function hasOpenSubscription(referenceId: string): Promise<boolean> {
  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, referenceId))

  return rows.some(
    (row) =>
      row.status &&
      (GOOD_STATUSES.has(row.status) || RECOVERABLE_STATUSES.has(row.status))
  )
}
