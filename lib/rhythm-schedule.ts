import {
  addCalendarDays,
  calendarDayIn,
  instantOf,
  isoWeekdayOf,
} from "./timezone"

/**
 * When a rhythm actually falls, as arithmetic with no database in it.
 *
 * Split out of lib/rhythm-run.ts for the reason lib/slots.ts is split out of
 * lib/scheduling.ts, and it is the same reason twice: the settings UI has to
 * preview the next run using the code the dispatcher decides with, or the two
 * drift and the symptom is a card promising 09:00 and a run at 10:00.
 *
 * **A wall clock, never a cron string.** lib/timezone.ts's header records what
 * a stored UTC hour cost once already. Storing cron and pinning every tenant to
 * UTC makes a 2:00 PM rhythm fire at 16:00 for a user in Oslo. That is the bug
 * this file exists not to have.
 */

/**
 * How late is too late.
 *
 * The argument is `CATCH_UP_MS` in lib/publish-run.ts at lower stakes. Nothing
 * a rhythm does reaches the outside world, so the window is wider — but a
 * "morning brief" delivered at 23:00 is still not the thing anybody switched
 * on, and a dispatcher that has been down since breakfast should say so rather
 * than pretend the run was on time.
 *
 * Note that this is *not* what stops a week of downtime firing a week of runs.
 * That is structural: `nextRunAfter` is always computed forward from now, so
 * recovery produces exactly one run per subscription whatever happened before.
 */
export const MAX_LATENESS_MS = 6 * 60 * 60 * 1000

/**
 * How long a claim is honoured before another run may take it.
 *
 * A dispatcher killed mid-handler leaves `running_since` set with nothing
 * coming back to clear it. Unlike `scheduled_post`'s `sending` — which needs a
 * human precisely because a retry double-posts — an abandoned rhythm is safe to
 * pick up again, because no handler in this product publishes.
 *
 * **A handler that publishes has to change this rule with it.** Fifteen minutes
 * is longer than `maxDuration` (300s) by a wide margin, so a run that is still
 * inside its own budget can never have its claim stolen.
 */
export const STALE_CLAIM_MS = 15 * 60 * 1000

/** A standing instruction: "09:00", or "Monday 09:00". */
export type Cadence = {
  hour: number
  minute: number
  /** ISO weekday 1–7, matching WEEKDAYS in lib/slots.ts. Null means daily. */
  weekday: number | null
}

/**
 * Is this a cadence the arithmetic below can answer for?
 *
 * Exported and used at the write boundary rather than only trusted, because
 * `hour` and `minute` arrive from a client and a subscription with hour 25
 * would produce an instant that never matches and a rhythm that silently never
 * runs. Refusing at the edge is the difference between a validation error and
 * a support ticket six weeks later.
 */
export function isValidCadence(cadence: Cadence): boolean {
  const { hour, minute, weekday } = cadence

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return false
  if (weekday === null) return true

  return Number.isInteger(weekday) && weekday >= 1 && weekday <= 7
}

/**
 * The next time this cadence falls, strictly after `after`, in `zone`.
 *
 * Candidates are built as wall clocks on real calendar days and then converted
 * to instants, which is what makes the DST cases right: 09:00 is 09:00 on both
 * sides of a transition, and the number of hours between two of them is
 * whatever the zone says it is rather than a multiple of 86,400,000.
 *
 * "Strictly after" is what stops a rhythm firing twice: the dispatcher recomputes
 * the cursor from the moment the run started, and a non-strict comparison would
 * hand back the same instant and leave the row due forever.
 *
 * Two weeks of candidates for the weekly case and two days for the daily one,
 * for the reason `nextOccurrenceAfter` in lib/slots.ts takes two: discarding a
 * candidate that has already passed has to leave one standing.
 */
export function nextRunAfter(
  cadence: Cadence,
  zone: string,
  after: Date
): Date | null {
  if (!isValidCadence(cadence)) return null

  const today = calendarDayIn(after, zone)
  const time = { hour: cadence.hour, minute: cadence.minute }

  if (cadence.weekday === null) {
    // Today first, then tomorrow. A daily 09:00 edited at 14:00 lands
    // tomorrow rather than in five minutes, which is the behaviour anybody
    // editing the time expects and the one a naive `now + 24h` gets wrong.
    return (
      [0, 1]
        .map((offset) => instantOf({ ...addCalendarDays(today, offset), ...time }, zone))
        .find((at) => at.getTime() > after.getTime()) ?? null
    )
  }

  const ahead = (cadence.weekday - isoWeekdayOf(today) + 7) % 7

  return (
    [0, 1]
      .map((week) =>
        instantOf({ ...addCalendarDays(today, ahead + week * 7), ...time }, zone)
      )
      .find((at) => at.getTime() > after.getTime()) ?? null
  )
}

/**
 * Has this run's window closed?
 *
 * Strictly later than the boundary, so a run exactly `MAX_LATENESS_MS` late is
 * still made. The alternative makes the boundary itself unrunnable, which is a
 * rule nobody can predict from "six hours" — the same call `isMissed` in
 * lib/publish-run.ts makes, deliberately, so the two sweeps do not disagree
 * about what a stated window means.
 */
export function isMissed(nextRunAt: Date, now: Date): boolean {
  return now.getTime() - nextRunAt.getTime() > MAX_LATENESS_MS
}

/**
 * Is this claim old enough to take?
 *
 * Null means unclaimed, which is takeable. Exported so the dispatcher's query
 * and its tests agree on one definition rather than two copies of an
 * inequality.
 */
export function isClaimStale(
  runningSince: Date | null,
  now: Date
): boolean {
  if (runningSince === null) return true
  return now.getTime() - runningSince.getTime() > STALE_CLAIM_MS
}
