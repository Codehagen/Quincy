import { eq, sql } from "drizzle-orm"

import { db } from "./db"
import { user } from "./schema"

/** One day free. The number is here so the copy and the clock cannot drift. */
export const TRIAL_DAYS = 1

/**
 * Start the free day, once, for an account that has never had one.
 *
 * Called from both signup paths in lib/auth.ts, at the moment the account
 * becomes usable rather than at the moment the row is created. With
 * `requireEmailVerification: true` an account is inert until the link is
 * clicked, and people click that link two days later — dating the trial from
 * `createdAt` would hand those people an account that expired before they ever
 * logged into it.
 *
 * Always returns the account's deadline — the one it just set, or the one that
 * was already there. Three properties of this statement are load-bearing:
 *
 * 1. **One statement.** lib/db.ts runs neon-http, which has no transactions.
 *    Anything shaped as read-then-write has a race with no way to close it, so
 *    the guard has to be inside the statement rather than in an `if` above it.
 *
 * 2. **`COALESCE` is the whole abuse rule.** One trial per account, forever —
 *    including for someone who subscribes, cancels, and comes back. A column
 *    that is already set keeps its value.
 *
 *    It is COALESCE rather than a `WHERE trial_ends_at IS NULL` guard, and that
 *    difference was a real bug: with the guard in the WHERE clause, calling
 *    this for an account that already had a trial matched no rows, so RETURNING
 *    came back empty and the caller could not tell "already has one" from "has
 *    none". lib/billing.ts read that empty result as no trial and served the
 *    paywall to somebody in the middle of their free day. Moving the condition
 *    into the value means the row always comes back.
 *
 * 3. **`now()` is Postgres's clock, not the lambda's.** One source of time for
 *    a deadline that is read back by the same database. A serverless instance
 *    with a skewed clock cannot mint itself a longer trial.
 */
export async function startTrial(userId: string): Promise<Date | null> {
  const rows = await db
    .update(user)
    .set({
      trialEndsAt: sql`coalesce(${user.trialEndsAt}, now() + ${`${TRIAL_DAYS} days`}::interval)`,
    })
    .where(eq(user.id, userId))
    .returning({ trialEndsAt: user.trialEndsAt })

  return rows[0]?.trialEndsAt ?? null
}
