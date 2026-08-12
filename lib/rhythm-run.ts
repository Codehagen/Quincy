import { createIdGenerator } from "ai"
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm"

import { db } from "./db"
import { isEntitled, resolveEntitlement } from "./entitlement"
import {
  isMissed,
  isValidCadence,
  nextRunAfter,
  STALE_CLAIM_MS,
  type Cadence,
} from "./rhythm-schedule"
import { RHYTHM_HANDLERS, type RhythmHandlerDeps } from "./rhythm-handlers"
import {
  rhythmRun,
  rhythmSubscription,
  type RhythmRunState,
} from "./schema-app"
import { user } from "./schema"
import { resolveTimeZone } from "./timezone"

/**
 * The sweep that runs rhythms. Scheduled in vercel.json. See plans/016.
 *
 * The judgment lives here and the authorisation lives in
 * app/api/cron/rhythms/route.ts, matching lib/publish-run.ts and
 * lib/channels-maintenance.ts beside it.
 *
 * **Recovery fires once, not once per missed period.** `next_run_at` is always
 * recomputed *forward from now*, so a dispatcher that has been down for a week
 * wakes up and runs each subscription exactly once. That is structural rather
 * than a rule anybody has to remember, and it is the single most important
 * property in this file: the equivalent bug in lib/publish-run.ts would fire a
 * week of stale posts into one minute, and only the catch-up window stops it.
 *
 * **A skipped run still advances the cursor.** lib/heartbeat.ts deliberately
 * leaves its watermark unmoved for an unentitled user, so their backlog
 * survives until they pay. A rhythm is the opposite: there is no backlog to
 * preserve, and a row that stays due is re-read on every tick forever. So an
 * unentitled subscription advances and records *why*.
 */

const newRunId = createIdGenerator({ prefix: "rr", size: 16 })

/**
 * The most subscriptions one run will take.
 *
 * Same reasoning as `MAX_ROWS_PER_RUN` in lib/publish-run.ts with a smaller
 * number: a row here is an X read plus one or more model calls, not a single
 * HTTP round trip. Work skipped by this sweep is not lost — the rows stay due
 * and the next tick is fifteen minutes away.
 */
const MAX_ROWS_PER_RUN = 50

/**
 * Stop before Vercel does.
 *
 * `maxDuration` on the route is 300 seconds. Leaving 45 seconds of headroom
 * means the sweep reports truncation and releases its claims rather than being
 * killed mid-handler, which would leave a claim held for the full
 * `STALE_CLAIM_MS`. This is advisor-plans/020's argument applied before the bug
 * rather than after it.
 */
const TIME_BUDGET_MS = 255_000

/**
 * How long "Run now" refuses to run again.
 *
 * Ten minutes, matching `IMPORT_COOLDOWN_MS` in lib/corpus-x.ts — long enough
 * that button-mashing cannot run up a bill, short enough that a genuine retry
 * after a failure is not locked out for the afternoon. The scheduled sweep is
 * deliberately NOT subject to it: a rhythm set to run hourly is a decision the
 * user made once, not a button they are holding down.
 */
export const MANUAL_RUN_COOLDOWN_MS = 10 * 60 * 1000

export type RhythmOutcome = RhythmRunState | "claimed-elsewhere"

export type RhythmSweep = {
  /** Subscriptions whose time had come when the sweep looked. */
  due: number
  /** True when more were due than `MAX_ROWS_PER_RUN`, or time ran out. */
  truncated: boolean
  outcomes: Record<RhythmOutcome, number>
  /** Handlers that threw. The number that makes a run degraded. */
  failed: number
}

export type RhythmRunDeps = RhythmHandlerDeps & {
  /** Overrides the registry. Only tests and verify scripts pass this. */
  handlers?: typeof RHYTHM_HANDLERS
}

function emptyOutcomes(): Record<RhythmOutcome, number> {
  return { ok: 0, failed: 0, skipped: 0, missed: 0, "claimed-elsewhere": 0 }
}

/**
 * Every subscription that is due and not held by a live claim.
 *
 * The staleness test is in SQL rather than in code because it has to be part
 * of the same predicate the claim uses — reading rows in one place and
 * claiming them under a different rule is how two dispatchers end up agreeing
 * a row is free.
 */
async function dueSubscriptions(now: Date, limit: number) {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS)

  return db
    .select({
      id: rhythmSubscription.id,
      userId: rhythmSubscription.userId,
      rhythmId: rhythmSubscription.rhythmId,
      hour: rhythmSubscription.hour,
      minute: rhythmSubscription.minute,
      weekday: rhythmSubscription.weekday,
      nextRunAt: rhythmSubscription.nextRunAt,
      timezone: user.timezone,
      trialEndsAt: user.trialEndsAt,
    })
    .from(rhythmSubscription)
    // Joined to `user` for two things the subscription cannot answer:
    // entitlement, and which zone the wall clock above belongs to.
    .innerJoin(user, eq(user.id, rhythmSubscription.userId))
    .where(
      and(
        eq(rhythmSubscription.enabled, true),
        lte(rhythmSubscription.nextRunAt, now),
        or(
          isNull(rhythmSubscription.runningSince),
          lte(rhythmSubscription.runningSince, staleBefore)
        )
      )
    )
    // Oldest first, so a truncated sweep serves the rhythms closest to missing
    // their window rather than whichever the planner happened to return.
    .orderBy(asc(rhythmSubscription.nextRunAt))
    .limit(limit)
}

/**
 * Take the claim, atomically.
 *
 * One conditional UPDATE, which is what makes "one run per subscription" hold
 * with no advisory locks and no interactive transactions on the HTTP driver.
 * A read-then-write would leave a gap two overlapping cron ticks could both
 * pass through. Same shape as `importXCorpus`'s cooldown claim.
 */
async function claim(subscriptionId: string, now: Date): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS)

  const claimed = await db
    .update(rhythmSubscription)
    .set({ runningSince: now, updatedAt: now })
    .where(
      and(
        eq(rhythmSubscription.id, subscriptionId),
        or(
          isNull(rhythmSubscription.runningSince),
          lte(rhythmSubscription.runningSince, staleBefore)
        )
      )
    )
    .returning({ id: rhythmSubscription.id })

  return claimed.length > 0
}

/**
 * Move the cursor on and let the claim go.
 *
 * **Always both, always in a `finally`.** A claim that outlives its run blocks
 * the subscription for the full `STALE_CLAIM_MS`, and a cursor left where it
 * was makes the row permanently due — the two failure modes this function
 * exists to make impossible.
 *
 * A cadence the arithmetic cannot answer (an hour of 25, say, written before
 * `isValidCadence` guarded the write path) disables the subscription rather
 * than looping on it forever. That is visible on /rhythm as a switch that is
 * off, which is a state a person can fix.
 */
async function release(
  row: { id: string; hour: number; minute: number; weekday: number | null },
  zone: string,
  from: Date,
  ranAt: Date | null
) {
  const cadence: Cadence = {
    hour: row.hour,
    minute: row.minute,
    weekday: row.weekday,
  }

  const next = nextRunAfter(cadence, zone, from)

  await db
    .update(rhythmSubscription)
    .set({
      runningSince: null,
      updatedAt: new Date(),
      ...(ranAt ? { lastRunAt: ranAt } : {}),
      ...(next ? { nextRunAt: next } : { enabled: false }),
    })
    .where(eq(rhythmSubscription.id, row.id))
}

async function recordRun(input: {
  subscriptionId: string
  userId: string
  rhythmId: string
  state: RhythmRunState
  summary: string
  startedAt: Date
  manual?: boolean
}) {
  await db.insert(rhythmRun).values({
    id: newRunId(),
    subscriptionId: input.subscriptionId,
    userId: input.userId,
    rhythmId: input.rhythmId,
    state: input.state,
    // Bounded so a handler that returns something enormous cannot make a card
    // unreadable or a row unreasonable.
    summary: input.summary.slice(0, 500),
    manual: input.manual ?? false,
    startedAt: input.startedAt,
    finishedAt: new Date(),
  })
}

export async function runDueRhythms(
  now = new Date(),
  deps: RhythmRunDeps = {}
): Promise<RhythmSweep> {
  const handlers = deps.handlers ?? RHYTHM_HANDLERS
  const startedSweep = Date.now()

  // One more than the cap, so truncation is a fact rather than a guess.
  const rows = await dueSubscriptions(now, MAX_ROWS_PER_RUN + 1)
  let truncated = rows.length > MAX_ROWS_PER_RUN
  const batch = truncated ? rows.slice(0, MAX_ROWS_PER_RUN) : rows

  if (truncated) {
    console.warn(
      `[rhythm] sweep truncated at ${MAX_ROWS_PER_RUN} rows — more were due. ` +
        `They stay due and the next tick takes them.`
    )
  }

  const outcomes = emptyOutcomes()
  let failed = 0

  for (const row of batch) {
    if (Date.now() - startedSweep > TIME_BUDGET_MS) {
      // Out of budget with rows still to go. Reported rather than silently
      // dropped: a sweep that quietly served half its queue every run looks
      // identical to one that served all of it.
      truncated = true
      console.warn("[rhythm] sweep hit its time budget — remaining rows stay due.")
      break
    }

    const zone = resolveTimeZone(row.timezone)
    const startedAt = new Date()

    if (!(await claim(row.id, new Date()))) {
      // Another sweep took it between the query and the claim. Not an error
      // and not a state change — whoever holds the claim records the outcome.
      // Counted so a run reporting `due: 8, ok: 0` is legible.
      outcomes["claimed-elsewhere"] += 1
      continue
    }

    let state: RhythmRunState = "ok"
    let summary = ""
    let ranAt: Date | null = null

    try {
      const handler = handlers[row.rhythmId]

      if (!handler) {
        // The catalogue moved on and this row did not. Skipped rather than
        // failed: nothing is broken, the rhythm simply no longer exists.
        state = "skipped"
        summary = "This rhythm is no longer available."
      } else if (!isValidCadence(row)) {
        state = "skipped"
        summary = "This rhythm's time was invalid and it has been switched off."
      } else if (isMissed(row.nextRunAt, now)) {
        // Its window closed. The handler is never called — running a morning
        // brief at eleven at night is not the thing anybody switched on.
        state = "missed"
        summary = "Quincy was not running when this was due."
      } else {
        const entitlement = await resolveEntitlement({
          id: row.userId,
          trialEndsAt: row.trialEndsAt,
        })

        if (!isEntitled(entitlement)) {
          // The gate the request path cannot reach — lib/heartbeat.ts's
          // argument, verbatim. `resolveEntitlement` is the *pure* resolver, so
          // this cron can never start anybody's trial while they are asleep.
          state = "skipped"
          summary =
            entitlement.state === "lapsed"
              ? "Skipped — your subscription is no longer active."
              : "Skipped — your free day is over."
        } else {
          const result = await handler({ userId: row.userId, deps })
          summary = result.summary
          ranAt = new Date()
        }
      }
    } catch (cause) {
      // One user's failure must not stop the rest. lib/heartbeat.ts:290 is the
      // pattern; the difference is that here the failure is also written down
      // where the user can read it.
      console.error(`[rhythm] ${row.rhythmId} for ${row.userId} failed:`, cause)
      state = "failed"
      failed += 1
      summary =
        cause instanceof Error && cause.message
          ? cause.message
          : "Something went wrong."
      ranAt = new Date()
    } finally {
      // Both writes, whatever happened above. See `release`.
      try {
        await release(row, zone, new Date(), ranAt)
      } catch (cause) {
        console.error(`[rhythm] could not release ${row.id}:`, cause)
      }
    }

    outcomes[state] += 1

    try {
      await recordRun({
        subscriptionId: row.id,
        userId: row.userId,
        rhythmId: row.rhythmId,
        state,
        summary,
        startedAt,
      })
    } catch (cause) {
      // The work already happened. Losing the receipt is bad; undoing the work
      // to keep the books tidy would be worse.
      console.error(`[rhythm] could not record run for ${row.id}:`, cause)
    }
  }

  return { due: batch.length, truncated, outcomes, failed }
}

/**
 * Run one subscription now, by hand.
 *
 * Stanley's "Try now", and the reason a rhythm surface is testable at all: a
 * switch you cannot exercise is a switch nobody trusts.
 *
 * Two things it deliberately does **not** do. It does not advance
 * `next_run_at` — a manual run is not the scheduled one, and consuming the
 * next slot would mean pressing the button quietly cancelled tomorrow. And it
 * does not gate on entitlement: the caller does, because it is the caller that
 * knows whether this is a request (`resolveEntitlementForRequest`) or a cron.
 *
 * It does take the same claim, so pressing the button while the clock is
 * firing cannot run the handler twice.
 */
export async function runRhythmOnce({
  subscriptionId,
  userId,
  deps = {},
}: {
  subscriptionId: string
  userId: string
  deps?: RhythmRunDeps
}): Promise<{ ok: boolean; summary: string }> {
  const handlers = deps.handlers ?? RHYTHM_HANDLERS
  const now = new Date()

  const [row] = await db
    .select()
    .from(rhythmSubscription)
    .where(
      and(
        eq(rhythmSubscription.id, subscriptionId),
        // Ownership proved here rather than trusted from the caller, matching
        // `ownedVersion` in app/(app)/drafts/actions.ts.
        eq(rhythmSubscription.userId, userId)
      )
    )
    .limit(1)

  if (!row) return { ok: false, summary: "No such rhythm." }

  const handler = handlers[row.rhythmId]
  if (!handler) return { ok: false, summary: "This rhythm cannot run yet." }

  /**
   * The cooldown plan 016 step 7 asked for and the first cut did not build.
   *
   * The claim below stops two runs *overlapping*, and `lib/bookmarks-x.ts`
   * argued from that that no cooldown was needed. The argument covers the
   * cron and not the button: a claim is released the moment a run ends, so
   * pressing Run now repeatedly buys a fresh paid X read and up to four model
   * calls each time, bounded by nothing but the user's patience.
   *
   * Read off `rhythm_run` rather than a new column, which is why there is no
   * migration here: the receipt table already records exactly "when did this
   * last go". It also means the guard covers every rhythm rather than the one
   * that happened to spend money first — `importXCorpus` has its own cooldown
   * and `importXBookmarks` deliberately has none, and a guard that depends on
   * which handler you are calling is a guard that lapses on the next handler.
   */
  const [recent] = await db
    .select({ startedAt: rhythmRun.startedAt })
    .from(rhythmRun)
    .where(eq(rhythmRun.subscriptionId, subscriptionId))
    .orderBy(desc(rhythmRun.startedAt))
    .limit(1)

  if (
    recent &&
    now.getTime() - recent.startedAt.getTime() < MANUAL_RUN_COOLDOWN_MS
  ) {
    const wait = Math.ceil(
      (MANUAL_RUN_COOLDOWN_MS - (now.getTime() - recent.startedAt.getTime())) /
        60_000
    )
    return {
      ok: false,
      summary: `This ran moments ago. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`,
    }
  }

  if (!(await claim(subscriptionId, now))) {
    return { ok: false, summary: "It is already running. Give it a minute." }
  }

  let state: RhythmRunState = "ok"
  let summary = ""

  try {
    const result = await handler({ userId, deps })
    summary = result.summary
  } catch (cause) {
    console.error(`[rhythm] manual ${row.rhythmId} failed:`, cause)
    state = "failed"
    summary =
      cause instanceof Error && cause.message
        ? cause.message
        : "Something went wrong."
  } finally {
    // The claim goes; the cursor does not move. Written as a direct update
    // rather than through `release` precisely so that difference is visible.
    await db
      .update(rhythmSubscription)
      .set({ runningSince: null, lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(rhythmSubscription.id, subscriptionId))
  }

  try {
    await recordRun({
      subscriptionId,
      userId,
      rhythmId: row.rhythmId,
      state,
      summary,
      startedAt: now,
      manual: true,
    })
  } catch (cause) {
    console.error(`[rhythm] could not record manual run:`, cause)
  }

  return { ok: state === "ok", summary }
}

/**
 * Recompute every one of this user's cursors.
 *
 * Called when the timezone changes. advisor-plans/005 made a captured timezone
 * take effect immediately for *rendering*; without this it would still take
 * until the next fire for *scheduling*, so a user who flies to Tokyo keeps
 * getting their 09:00 rhythm on Oslo time — right on the card, wrong in the
 * world. Exactly the class of bug lib/timezone.ts exists to close.
 *
 * Rows currently running are left alone: their `release` is about to write a
 * cursor of its own, and racing it would produce two answers.
 */
export async function rescheduleForUser(
  userId: string,
  zone: string,
  now = new Date()
): Promise<number> {
  const rows = await db
    .select()
    .from(rhythmSubscription)
    .where(
      and(
        eq(rhythmSubscription.userId, userId),
        isNull(rhythmSubscription.runningSince)
      )
    )

  let moved = 0

  for (const row of rows) {
    const next = nextRunAfter(
      { hour: row.hour, minute: row.minute, weekday: row.weekday },
      zone,
      now
    )
    if (!next) continue

    await db
      .update(rhythmSubscription)
      .set({ nextRunAt: next, updatedAt: new Date() })
      .where(eq(rhythmSubscription.id, row.id))

    moved += 1
  }

  return moved
}

/** Rows stuck in a claim nothing will ever release. Reported, never fixed
 *  automatically — the same posture `countUnresolved` takes in
 *  lib/publish-run.ts. */
export async function countStuck(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS)

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rhythmSubscription)
    .where(lte(rhythmSubscription.runningSince, staleBefore))

  return row?.n ?? 0
}
