"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { and, eq, inArray, lt } from "drizzle-orm"

import { db } from "@/lib/db"
import { rateLimit, subscription } from "@/lib/schema"
import { getSession } from "@/lib/session"
import { stripeClient } from "@/lib/stripe"
import { GOOD_STATUSES } from "@/lib/subscription-status"

/**
 * Cancel at period end, and undo it, from the billing page.
 *
 * Not the Stripe plugin's `/subscription/cancel`: that one sends the person
 * through the billing portal to press cancel a second time, and the hold on
 * the page already is the confirmation. `/subscription/restore` would do the
 * undo, but these two are one pair: the same row lookup, the same cooldown,
 * the same write-back, and the same error shape, so the undo is written here
 * beside the cancel rather than through a second path. Its Stripe update
 * mirrors the plugin's restore (clear `cancel_at` when Stripe set one,
 * otherwise turn `cancel_at_period_end` off), so the two cannot disagree.
 *
 * Managed Payments: Stripe documents updating a subscription through the API
 * as supported. Neither action has been run against a live Managed Payments
 * subscription yet.
 *
 * The subscription id never comes from the client. It is read from our own
 * row for the signed-in user, so a caller can only change their own plan.
 */

export type PlanActionResult = { ok: true } | { ok: false; message: string }

/**
 * One change per user per five seconds, over both actions together, so a
 * cancel and a keep cannot be alternated as fast as a script can call them.
 *
 * Stamped in the `rate_limit` table (Better Auth's, keyed by a string) rather
 * than in memory: a Map lives in one lambda and the next press can land in
 * another. The stamp is an atomic upsert that only moves a stamp older than
 * the window, so two presses in the same moment cannot both pass. It is a
 * cooldown, not a claim: it is not released when the call ends. Our keys
 * start with `billing:`, which no Better Auth key (`ip|path`) does.
 */
const PLAN_CHANGE_COOLDOWN_MS = 5_000

async function takeCooldown(userId: string): Promise<boolean> {
  const now = Date.now()
  const rows = await db
    .insert(rateLimit)
    .values({ id: randomUUID(), key: `billing:plan-change|${userId}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: { count: 1, lastRequest: now },
      setWhere: lt(rateLimit.lastRequest, now - PLAN_CHANGE_COOLDOWN_MS),
    })
    .returning({ id: rateLimit.id })
  return rows.length > 0
}

const WAIT = "That was a moment ago. Wait a few seconds and try again."

/** The signed-in user's live subscription row, or a sentence saying why not. */
async function liveSubscription(): Promise<
  | { ok: true; userId: string; rowId: string; stripeId: string }
  | { ok: false; message: string }
> {
  const session = await getSession()
  if (!session) return { ok: false, message: "You are signed out. Sign in and try again." }

  const [row] = await db
    .select({ id: subscription.id, stripeId: subscription.stripeSubscriptionId })
    .from(subscription)
    .where(
      and(
        eq(subscription.referenceId, session.user.id),
        inArray(subscription.status, [...GOOD_STATUSES]),
      ),
    )
    .limit(1)

  if (!row?.stripeId) {
    return { ok: false, message: "There is no active plan on this account to change." }
  }
  return { ok: true, userId: session.user.id, rowId: row.id, stripeId: row.stripeId }
}

function fromUnix(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null
}

/**
 * Stop the renewal. The plan runs to the end of the period already paid for;
 * nothing is refunded and nothing is deleted.
 */
export async function cancelPlan(): Promise<PlanActionResult> {
  const live = await liveSubscription()
  if (!live.ok) return live
  if (!(await takeCooldown(live.userId))) return { ok: false, message: WAIT }

  try {
    const updated = await stripeClient.subscriptions.update(live.stripeId, {
      cancel_at_period_end: true,
    })

    // Written now rather than left to the webhook, so the page that renders
    // after this action already says "Ends …". The webhook writes the same
    // values from the same subscription when it lands.
    await db
      .update(subscription)
      .set({
        cancelAtPeriodEnd: true,
        cancelAt: fromUnix(updated.cancel_at),
        canceledAt: fromUnix(updated.canceled_at),
      })
      .where(eq(subscription.id, live.rowId))
  } catch (error) {
    console.error("[billing] cancel failed:", error)
    return {
      ok: false,
      message: "Stripe did not take the cancellation. Your plan is unchanged. Try again in a few seconds.",
    }
  }

  revalidatePath("/settings/billing")
  return { ok: true }
}

/** Undo a cancel before the period ends. The same plan carries on renewing. */
export async function keepPlan(): Promise<PlanActionResult> {
  const live = await liveSubscription()
  if (!live.ok) return live
  if (!(await takeCooldown(live.userId))) return { ok: false, message: WAIT }

  try {
    const current = await stripeClient.subscriptions.retrieve(live.stripeId)

    // The plugin's restore, step for step: a cancel set as a date (the
    // portal can do that) is cleared as a date; otherwise the flag goes off.
    if (current.cancel_at) {
      await stripeClient.subscriptions.update(live.stripeId, { cancel_at: "" })
    } else if (current.cancel_at_period_end) {
      await stripeClient.subscriptions.update(live.stripeId, { cancel_at_period_end: false })
    }

    await db
      .update(subscription)
      .set({ cancelAtPeriodEnd: false, cancelAt: null, canceledAt: null })
      .where(eq(subscription.id, live.rowId))
  } catch (error) {
    console.error("[billing] keep failed:", error)
    return {
      ok: false,
      message: "Stripe did not take the change. Your plan still ends on the date above. Try again in a few seconds.",
    }
  }

  revalidatePath("/settings/billing")
  return { ok: true }
}
