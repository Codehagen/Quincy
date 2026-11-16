/**
 * The one place a wall clock becomes an instant, and back.
 *
 * Everything scheduling touches has two representations and they are not
 * interchangeable. "Monday 08:00" is a wall clock: a shape with no moment
 * attached until you say where. `scheduled_for` is an instant: a moment with no
 * opinion about what the clock on anybody's wall said. A slot is the first, a
 * scheduled post is the second, and publishing turns one into the other.
 *
 * The reason this file exists rather than a handful of `getHours()` calls is
 * that `Date`'s local methods read the *server's* zone. Locally that is
 * Europe/Oslo, on Vercel it is UTC (`vercel.json` pins `iad1`, and the runtime
 * is UTC regardless of region). So an 08:00 slot created in production was
 * stored as 08:00 UTC, which is 10:00 in Oslo, and then rendered back through
 * the same wrong zone — right on screen, two hours wrong in the world. Nothing
 * caught it because dev and prod disagreed silently and nothing published yet.
 *
 * No dependency. `Intl` already ships the IANA database in Node and in every
 * browser, and the arithmetic below is thirty lines. It is also the code that
 * must be right, so it has tests: lib/timezone.test.ts.
 *
 * Storage is unaffected and was never the bug. Drizzle writes a `Date` as
 * `toISOString()` and reads it back with `+0000`
 * (drizzle-orm/pg-core/columns/timestamp.js), so the instant survives a round
 * trip intact. What was wrong was every decision on either side of it.
 */

/**
 * What we assume when we do not know.
 *
 * UTC rather than the server's zone, deliberately: a wrong answer that is the
 * same everywhere is debuggable, and one that follows whichever machine ran the
 * code is the bug this file exists to remove.
 */
export const DEFAULT_TIME_ZONE = "UTC"

/** A day on a calendar. No time, no zone — those come from somewhere else. */
export type CalendarDate = { year: number; month: number; day: number }

/** A reading on a clock. Still no zone. */
export type WallClock = CalendarDate & { hour: number; minute: number }

/**
 * One formatter per zone, not one per row.
 *
 * `Intl.DateTimeFormat` construction is the expensive part — it resolves the
 * locale and loads the zone's transition table. /lineup formats every entry and
 * every slot in a seven-day window, so this is the difference between one
 * construction and forty.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function formatterFor(zone: string) {
  let formatter = FORMATTERS.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      // Not `hour12: false`, which yields hour "24" for midnight on some
      // engines and silently pushes a day forward when parsed as a number.
      hourCycle: "h23",
    })
    FORMATTERS.set(zone, formatter)
  }
  return formatter
}

/**
 * Is this a zone `Intl` knows?
 *
 * The check is a constructor call because there is no list to consult — the
 * database is the runtime's, and `Intl.supportedValuesOf("timeZone")` reports
 * canonical names only, so it would reject live aliases like `Asia/Calcutta`
 * that browsers still report.
 */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * A user's zone, or the default.
 *
 * Every read of `user.timezone` goes through this. The column is nullable (a
 * Google sign-up sends no zone, and every account created before this existed
 * has none) and it is client-supplied, so it is a string that might be
 * anything. An unchecked value reaches `Intl` and throws a `RangeError` deep
 * inside a page render, which is a 500 on /lineup for a bad profile field.
 */
export function resolveTimeZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_TIME_ZONE
  return isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE
}

/**
 * The zone this browser is in, or undefined if it will not say.
 *
 * The only thing that knows. A server sees an IP, and geolocating one is both a
 * worse guess — VPNs, mobile carriers routing through another country — and a
 * tracking decision nobody asked for. `resolvedOptions().timeZone` is the
 * browser reporting a setting its owner chose.
 *
 * Returns undefined rather than a fallback so callers can tell "the browser
 * said UTC" from "the browser said nothing", which are different facts.
 */
export function browserTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && isValidTimeZone(zone) ? zone : undefined
  } catch {
    return undefined
  }
}

/** What the clock in `zone` said at this instant. */
export function wallClockIn(instant: Date, zone: string): WallClock {
  const parts = formatterFor(zone).formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value)

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  }
}

/** The date in `zone` at this instant, with the time dropped. */
export function calendarDayIn(instant: Date, zone: string): CalendarDate {
  const { year, month, day } = wallClockIn(instant, zone)
  return { year, month, day }
}

/**
 * Milliseconds to add to UTC to get `zone`'s wall clock at this instant.
 *
 * Positive east of Greenwich. Read out of the formatter rather than from a
 * table: the formatter is what knows that Oslo was +01:00 in January and +02:00
 * in July, and that Lord Howe Island moves by thirty minutes.
 */
function offsetAt(instant: Date, zone: string): number {
  const parts = formatterFor(zone).formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)!.value)

  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second")
  )

  // The formatter has second granularity, so compare against a second-aligned
  // instant or every offset comes back with the milliseconds baked in.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The moment at which `zone`'s clock reads this.
 *
 * Twice a year a wall clock is not a moment. The offsets a day either side of
 * the reading are what decide which case this is, so both are asked for up
 * front and each is tested by seeing whether it survives the round trip — an
 * offset that does not reproduce itself at the instant it produced is an offset
 * that was not in force there.
 *
 * - **Ordinary day.** One offset, one answer, one extra formatter call.
 * - **Fall back.** 25 October in Oslo: 03:00 becomes 02:00, so 02:30 happens
 *   twice. Both candidates survive, and this takes the earlier.
 * - **Spring forward.** 29 March in Oslo: 02:00 becomes 03:00, so 02:30 never
 *   happens. Neither candidate survives, and this shifts forward out of the
 *   gap — 02:30 resolves to 03:30, never to 01:30.
 *
 * Earlier-when-ambiguous and later-when-missing is the same pair of choices
 * `Temporal`'s `compatible` disambiguation makes, and the same thing a local
 * `new Date(y, m, d, h, i)` does. Both branches are pinned in the tests. The
 * property that matters for a scheduling product is in there too: neither
 * branch can put a post out *earlier* than the clock reading asked for.
 */
export function instantOf(wall: WallClock, zone: string): Date {
  const asIfUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    0,
    0
  )

  // A day is wider than any offset (±14h at the extremes), so these two land
  // cleanly either side of a transition falling on this date.
  const before = offsetAt(new Date(asIfUtc - DAY_MS), zone)
  const after = offsetAt(new Date(asIfUtc + DAY_MS), zone)

  if (before === after) {
    return new Date(asIfUtc - before)
  }

  const survives = [asIfUtc - before, asIfUtc - after].filter(
    (candidate) => offsetAt(new Date(candidate), zone) === asIfUtc - candidate
  )

  // Nothing survives only in the gap, and there `asIfUtc - before` is already
  // the reading shifted forward by exactly the size of the jump.
  if (survives.length === 0) {
    return new Date(asIfUtc - before)
  }

  return new Date(Math.min(...survives))
}

/** Midnight in `zone`, as an instant. */
export function startOfDayIn(date: CalendarDate, zone: string): Date {
  return instantOf({ ...date, hour: 0, minute: 0 }, zone)
}

/**
 * `n` days later on the calendar.
 *
 * Calendar arithmetic, not `+ n * 86400000`. Adding a fixed number of
 * milliseconds across a DST transition lands on 23:00 the previous day, and
 * "the day after Saturday" has to be Sunday in every zone regardless of what
 * happened to the clocks overnight. `Date.UTC` is doing month-length and
 * leap-year rollover here and nothing else; the zone never enters into it.
 */
export function addCalendarDays(date: CalendarDate, n: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + n))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/** ISO weekday: 1 = Monday through 7 = Sunday. `getDay()` is 0 = Sunday, which is the trap. */
export function isoWeekdayOf(date: CalendarDate): number {
  const weekday = new Date(
    Date.UTC(date.year, date.month - 1, date.day)
  ).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

/** `YYYY-MM-DD`. The id a day is addressed by, on the server and in the client. */
export function dayKeyOf(date: CalendarDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

/** The inverse of `dayKeyOf`, for a day id arriving from the client. */
export function parseDayKey(key: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  // Rejects 2026-02-31 and 2026-13-01, which pass the pattern and then roll
  // silently into the following month once they reach `Date.UTC`. Comparing the
  // formatted string back to the input would not catch either, because nothing
  // in that path normalises — the roll happens inside `Date.UTC` or not at all.
  const normalised = new Date(Date.UTC(year, month - 1, day))
  if (
    normalised.getUTCFullYear() !== year ||
    normalised.getUTCMonth() + 1 !== month ||
    normalised.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

/** Zero-padded 24-hour "HH:MM", as `zone`'s clock read it. */
export function hhmmIn(instant: Date, zone: string): string {
  const { hour, minute } = wallClockIn(instant, zone)
  return `${pad(hour)}:${pad(minute)}`
}

/** `YYYY-MM-DD` in `zone`. The bucket a scheduled post falls into. */
export function dayKeyIn(instant: Date, zone: string): string {
  return dayKeyOf(calendarDayIn(instant, zone))
}

/** "HH:MM" as stored on a slot, split into numbers. Null when it is not that. */
export function parseTimeOfDay(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null

  return { hour, minute }
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}
