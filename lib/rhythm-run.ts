import { createIdGenerator } from "ai"
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm"

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
  usageEvent,
  type RhythmRunState,
} from "./schema-app"
import { user } from "./schema"
import { calendarDayIn, resolveTimeZone, startOfDayIn } from "./timezone"

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

/**
 * The most one account may spend in a day on runs nobody asked for, in micros.
 * $0.50.
 *
 * AGENTS.md names this as the one missing guard: the rhythm dispatcher "is the
 * first thing in the product that spends on a schedule with nobody present.
 * Per-run costs are capped; a per-user daily total is not." Every handler
 * bounds what a single run buys — `DRAFTS_PER_RUN`, `MAX_MERGES`, `MAX_DRAFTS`
 * — and nothing bounded the sum, so an account with six rhythms switched on had
 * a daily bill decided by arithmetic nobody had done.
 *
 * The number comes from the measured turn cost in plans/README's 008 note: p95
 * is 4.1c a turn, so $0.50 is about twelve of the most expensive calls this
 * product makes, in one day, without anybody asking for any of them. The live
 * account's entire spend since 2026-08-04 is about $5.35, so this bounds the
 * accident rather than the normal case, which is what a ceiling is for.
 */
export const RHYTHM_DAILY_CEILING_MICROS = 500_000

/**
 * What this account has spent today, in its own day.
 *
 * **Every `usage_event`, not only the ones a rhythm caused**, and that is a
 * decision rather than a shortcut. Nothing on the row says which spender wrote
 * it: `conversation_id` is a chat id for a chat turn, a spend tag for a
 * cooldown, and null for everything a server action or a cron bought. A
 * ceiling that could see only part of the spend would be a ceiling that
 * undercounts, and AGENTS.md is explicit that a persuasive argument for a
 * weaker guard is the smell that section exists for.
 *
 * The consequence is the right way round: it only ever stops a *rhythm*. A
 * person mid-conversation is never cut off by it, and an unattended cron is
 * exactly the thing that should yield when an account has already spent its
 * day.
 *
 * The user's own calendar day, not UTC. A ceiling that resets at 01:00 or
 * 16:00 local is a ceiling nobody can predict, and lib/timezone.ts exists so
 * this file never has to guess.
 */
export async function dailyRhythmSpend(
  userId: string,
  zone: string,
  now = new Date()
): Promise<number> {
  const [row] = await db
    .select({
      micros: sql<number>`coalesce(sum(${usageEvent.costMicros}), 0)::int`,
    })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.userId, userId),
        gte(usageEvent.createdAt, startOfDayIn(calendarDayIn(now, zone), zone))
      )
    )

  return row?.micros ?? 0
}

/** "$0.50". The ceiling and the spend read the same way in a summary. */
function dollars(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`
}

/**
 * The sentence a ceilinged run is recorded with, or null when it may run.
 *
 * Pure and exported so the rule and the words are testable without a database
 * — the same split lib/heartbeat.ts draws between `factsFrom` and
 * `runHeartbeat`. Both numbers are in the sentence because neither is enough
 * alone: "you hit the ceiling" is unactionable, and a ceiling with no spend
 * beside it cannot be checked against /credits.
 */
export function ceilingSkip(spentMicros: number): string | null {
  if (spentMicros < RHYTHM_DAILY_CEILING_MICROS) return null

  return `Skipped — this account has spent ${dollars(spentMicros)} today, and the daily ceiling for unattended runs is ${dollars(RHYTHM_DAILY_CEILING_MICROS)}.`
}

/**
 * When this user's last successful run of one rhythm was.
 *
 * Read off `rhythm_run` rather than a new column, the same call the manual
 * cooldown below makes — the receipt table already records "when did this last
 * go". Keyed on the user rather than the subscription, which is what a weekly
 * rhythm's cooldown needs: deleting a subscription and switching it on again
 * must not buy a second week's drafts on the same Monday.
 *
 * `state = 'ok'` only. A run that failed or skipped bought nothing, and a
 * cooldown armed by a no-op would lock the next four weeks out of work they
 * could have done. See `RhythmHandlerResult.state`.
 *
 * Exported for lib/ship-log.ts and lib/week-plan.ts, which each hold a cooldown
 * of their own for what one run buys. That makes this file and those two an
 * import cycle, and it is safe by the same construction lib/brain.ts and
 * lib/memory-ledger.ts rely on: nothing crossing the boundary is called at
 * module-evaluation time, and `RHYTHM_HANDLERS` is read inside functions
 * rather than at the top level.
 */
export async function lastOkRunAt(
  userId: string,
  rhythmId: string
): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: rhythmRun.startedAt })
    .from(rhythmRun)
    .where(
      and(
        eq(rhythmRun.userId, userId),
        eq(rhythmRun.rhythmId, rhythmId),
        eq(rhythmRun.state, "ok")
      )
    )
    .orderBy(desc(rhythmRun.startedAt))
    .limit(1)

  return row?.startedAt ?? null
}

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
  /**
   * What this account has spent today. Injectable so a test of the ceiling is
   * a test of the ceiling rather than of `usage_event`.
   */
  spend?: (userId: string, zone: string, now: Date) => Promise<number>
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

  return (
    db
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
  )
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

/**
 * The most one run's record may weigh, serialised.
 *
 * Sixteen kilobytes, where `MAX_SCRAP_BYTES` in lib/ship-log.ts is six. The
 * two bound different things: that one bounds a prompt, and this bounds a row
 * nobody is charged for. Week Plan's record carries a critique line and a
 * placement for every draft of the week and is the largest of the three by a
 * long way, and it is still nowhere near this — which is what a ceiling should
 * look like. It bounds the accident, not the normal case.
 *
 * The accident it bounds is a handler that one day returns the drafts rather
 * than their ids. `rhythm_run` has a row per subscription per fire, forever,
 * and jsonb has no width to stop it.
 */
export const MAX_RESULT_BYTES = 16 * 1024

/**
 * The record as it goes into `rhythm_run.result`, or null.
 *
 * Pure and exported for the reason `ceilingSkip` above is: the rule is worth
 * testing without a database.
 *
 * Over the cap it degrades to `{ truncated: true, summary }` rather than being
 * dropped. A row with nothing in it says "this run produced no record", which
 * is a different and wrong fact — the truncation flag is what tells a reader
 * that something was produced and this is not it. The summary rides along
 * because it is the part a person would have read anyway.
 *
 * Anything that will not serialise gets the same treatment. A `BigInt` or a
 * cycle in a handler's return is a bug in the handler, and it must not be a
 * throw inside the receipt — see `recordRun`'s caller, which already treats
 * losing a receipt as the lesser harm.
 */
export function boundResult(result: unknown, summary: string): unknown {
  if (result === undefined || result === null) return null

  let serialised: string | undefined

  try {
    serialised = JSON.stringify(result)
  } catch {
    return { truncated: true, summary: summary.slice(0, 500) }
  }

  // `undefined` back from JSON.stringify is a function or a bare undefined —
  // nothing a column can hold, and the same nothing as no result at all.
  if (serialised === undefined) return null

  if (Buffer.byteLength(serialised, "utf8") <= MAX_RESULT_BYTES) return result

  return { truncated: true, summary: summary.slice(0, 500) }
}

async function recordRun(input: {
  subscriptionId: string
  userId: string
  rhythmId: string
  state: RhythmRunState
  summary: string
  startedAt: Date
  manual?: boolean
  result?: unknown
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
    // Bounded for the same reason, on bytes rather than characters because
    // this one is not read by a person. See `boundResult`.
    result: boundResult(input.result, input.summary),
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
  const spend = deps.spend ?? dailyRhythmSpend
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
      console.warn(
        "[rhythm] sweep hit its time budget — remaining rows stay due."
      )
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
    /**
     * What the handler produced. Only a handler that ran sets it, so every
     * skip, every miss and every throw below leaves it null — which is exactly
     * what the column means by null. See `boundResult`.
     */
    let result: unknown = null

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
          const ceilinged = ceilingSkip(await spend(row.userId, zone, now))

          if (ceilinged) {
            /**
             * The daily ceiling, checked after entitlement and immediately
             * before the handler. See `RHYTHM_DAILY_CEILING_MICROS`.
             *
             * A skip rather than a failure, and a *recorded* one: an account
             * whose rhythms quietly stopped one morning is indistinguishable
             * from a broken dispatcher, and the number in the summary is the
             * only thing that tells the two apart. The cursor still advances,
             * so tomorrow's run happens on time rather than the row staying
             * due and being re-read on every tick for the rest of the day.
             */
            state = "skipped"
            summary = ceilinged
          } else {
            const outcome = await handler({ userId: row.userId, deps })
            summary = outcome.summary
            // A handler that ran and found nothing to do says so. See
            // `RhythmHandlerResult.state`: `lastOkRunAt` above is what the
            // weekly cooldowns read, and a no-op recorded as `ok` would arm
            // one for a week.
            state = outcome.state ?? "ok"
            result = outcome.result ?? null
            ranAt = new Date()
          }
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
        result,
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
 * "Try now", and the reason a rhythm surface is testable at all: a switch you
 * cannot exercise is a switch nobody trusts.
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
  let result: unknown = null

  try {
    const outcome = await handler({ userId, deps })
    summary = outcome.summary
    state = outcome.state ?? "ok"
    // Recorded here too. A run by hand is the one people actually watch, so it
    // is the last place a receipt should be thinner than the scheduled one's.
    result = outcome.result ?? null
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
      result,
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
