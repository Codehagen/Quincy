import { eq } from "drizzle-orm"

import { db } from "./db"
import { subscription } from "./schema"
import { GOOD_STATUSES, LAPSED_STATUSES } from "./subscription-status"
import { startTrial } from "./trial"

export type Entitlement =
  | { state: "trialing"; endsAt: Date }
  | { state: "active" }
  | { state: "expired" }
  | { state: "lapsed" }

/** Trialing and active may act. Expired and lapsed may look. */
export function isEntitled(entitlement: Entitlement): boolean {
  return entitlement.state === "trialing" || entitlement.state === "active"
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null
  }
  return value instanceof Date ? value : new Date(value)
}

/**
 * Read-only. Never writes, and that is the point.
 *
 * Safe to call from anywhere, including a background job where nobody is
 * present. An account with no trial recorded resolves to `expired` here rather
 * than being handed a free day it cannot use — a cron that starts somebody's
 * 24-hour trial at 22:17 on a Monday spends it while they are asleep, and they
 * meet a paywall having never opened the product.
 *
 * Request paths want the opposite behaviour. They use
 * `resolveEntitlementForRequest` below.
 */
export async function resolveEntitlement(user: {
  id: string
  trialEndsAt?: Date | string | null
}): Promise<Entitlement> {
  const endsAt = toDate(user.trialEndsAt)

  if (endsAt && endsAt.getTime() > Date.now()) {
    return { state: "trialing", endsAt }
  }

  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, user.id))

  if (rows.some((row) => row.status && GOOD_STATUSES.has(row.status))) {
    return { state: "active" }
  }

  // `lapsed` is a claim about history: money worked once and stopped. An
  // `incomplete` row is an abandoned checkout, not that.
  return rows.some((row) => row.status && LAPSED_STATUSES.has(row.status))
    ? { state: "lapsed" }
    : { state: "expired" }
}

/**
 * The same question, asked by somebody who is actually here.
 *
 * A user in front of us with no trial on record gets one started — a signup
 * that raced, a hook that threw, or an account predating the column all
 * self-heal on next page load instead of meeting a paywall they never had a
 * chance to avoid. `startTrial` coalesces, so this cannot hand out a second
 * day.
 *
 * The write is deliberate and it is bounded. The session is cookie-cached for
 * five minutes (lib/auth.ts), so for that window this reads a stale null for
 * somebody whose trial started moments ago and writes again — a single UPDATE
 * by primary key that changes nothing. Reading first to avoid it would cost a
 * round trip in the common case to save one in a rare one.
 */
export async function resolveEntitlementForRequest(user: {
  id: string
  trialEndsAt?: Date | string | null
}): Promise<Entitlement> {
  const endsAt = toDate(user.trialEndsAt) ?? (await startTrial(user.id))

  return resolveEntitlement({ id: user.id, trialEndsAt: endsAt })
}

/**
 * The refusal a route handler returns when the money is not good.
 *
 * 402 rather than 403: the client needs to tell "you may not" apart from "you
 * have not paid" to know whether to render an error or the paywall.
 */
export function paywallResponse(entitlement: Entitlement): Response {
  return Response.json(
    {
      error:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
      state: entitlement.state,
    },
    { status: 402 }
  )
}
