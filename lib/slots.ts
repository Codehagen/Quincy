import {
  addCalendarDays,
  calendarDayIn,
  hhmmIn,
  instantOf,
  isoWeekdayOf,
  parseTimeOfDay,
  startOfDayIn,
} from "./timezone"

/**
 * When a standing slot actually falls, as arithmetic with no database in it.
 *
 * Split out of lib/scheduling.ts so the Add-a-slot dialog can use it. That file
 * imports `db`, and importing it from a client component would pull the
 * Postgres driver into the browser bundle.
 *
 * The split has a second point, which is the one that matters: the dialog
 * previews where a slot will land and lib/scheduling.ts decides where an
 * approval lands, and those two must never disagree. A preview computed by a
 * copy of this logic would drift the first time either side was edited, and the
 * symptom would be a dialog that promised Monday and a post that went out
 * Tuesday.
 */

/** ISO weekday order: 1 = Monday through 7 = Sunday. */
export const WEEKDAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
] as const

export function weekdayLabel(weekday: number): string {
  return WEEKDAYS.find((d) => d.value === weekday)?.label ?? "—"
}

/**
 * The next occurrence of this weekday and time, today included, and the ones
 * after it.
 *
 * "Which day is it" is answered in the reader's zone: at 23:30 on a Monday in
 * Oslo the server is still on Monday in UTC by half an hour, and the same
 * reading gives two different weekdays.
 *
 * Today is included deliberately, and callers are expected to discard it when
 * it has passed — see the candidate filter in `nextFreeSlot`. Doing that here
 * would break the preview in the Add-a-slot dialog, which has to be able to say
 * "this slot is today, and today's has gone" rather than silently skipping a
 * week.
 */
export function occurrencesOf(
  weekday: number,
  time: string,
  zone: string,
  from: Date,
  weeks: number
): Date[] {
  const parsed = parseTimeOfDay(time)
  if (!parsed) return []

  const today = calendarDayIn(from, zone)
  const ahead = (weekday - isoWeekdayOf(today) + 7) % 7

  return Array.from({ length: weeks }, (_, week) =>
    instantOf({ ...addCalendarDays(today, ahead + week * 7), ...parsed }, zone)
  )
}

/**
 * The next occurrence that has not already gone by.
 *
 * What the dialog shows and what an approval would get, asked the same way. Two
 * weeks of candidates because discarding a passed occurrence has to leave one
 * standing — a slot whose day is today and whose hour is over falls through to
 * next week.
 */
export function nextOccurrenceAfter(
  weekday: number,
  time: string,
  zone: string,
  now: Date
): Date | null {
  return (
    occurrencesOf(weekday, time, zone, now, 2).find(
      (at) => at.getTime() > now.getTime()
    ) ?? null
  )
}

/**
 * Is this instant past the last day /lineup will draw?
 *
 * The placement horizon is two weeks and the Lineup shows a rolling seven days,
 * so a placement can be real, correct, and absent from the one page that
 * answers "what is going out". That is not a bug to fix by narrowing the
 * horizon — a weekly slot has exactly one occurrence inside a seven-day window,
 * so refusing everything past it would turn "approved on Monday afternoon" into
 * "every slot is taken" while next Monday sits free. It is a bug to fix by
 * saying so.
 *
 * The boundary is computed exactly as `getLineup` computes its window in
 * lib/lineup.ts — `startOfDayIn(today + 7)` in the reader's zone, not
 * `now + 7 days`. Those differ by the time of day, and hedging against the
 * wrong one would be a second lie rather than a fix.
 */
export function isBeyondVisibleWeek(
  at: Date,
  now: Date,
  zone: string
): boolean {
  const today = calendarDayIn(now, zone)
  const lastDrawn = startOfDayIn(addCalendarDays(today, 7), zone)

  return at.getTime() >= lastDrawn.getTime()
}

/** Fixed English, matching lib/lineup.ts. See its note on `MONTH`. */
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * A future instant, said the way a person would say it.
 *
 * Not `formatConversationDate`. That one buckets the **past** — its first
 * branch is `days <= 0 → "Today"`, which is correct for a conversation and
 * silently wrong for a schedule: a post two days out rendered as "going out
 * Today". That shipped, and the only reason it was caught is that the page was
 * read rather than reasoned about.
 *
 * Relative while relative is useful, absolute once it stops being. A weekday
 * alone is ambiguous past a week — there is more than one Friday — so anything
 * that far out carries the date.
 */
export function formatSlotTime(at: Date, zone: string, now: Date): string {
  const then = calendarDayIn(at, zone)
  const today = calendarDayIn(now, zone)

  const days = Math.round(
    (Date.UTC(then.year, then.month - 1, then.day) -
      Date.UTC(today.year, today.month - 1, today.day)) /
      86_400_000
  )

  const clock = hhmmIn(at, zone)

  if (days === 0) return `today at ${clock}`
  if (days === 1) return `tomorrow at ${clock}`

  const weekday = WEEKDAYS[isoWeekdayOf(then) - 1].short

  // Inside the week the Lineup draws, the weekday is unambiguous and shorter.
  if (days > 0 && days < 7) return `${weekday} at ${clock}`

  return `${weekday} ${then.day} ${MONTH[then.month - 1]} at ${clock}`
}
