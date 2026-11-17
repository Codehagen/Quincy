import { stackSpans } from "@ui-sdk/core"

/**
 * The arithmetic of WeekCalendar (week-calendar.tsx), with no React and no
 * DOM in it: how a time is said, where a pointer lands, how far a held block
 * may step, and which blocks sit side by side. week-calendar-math.test.ts
 * pins each one.
 */

export const DAY_MINUTES = 24 * 60

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Minutes from midnight as "08:15". */
export function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

/** "08:15" as minutes from midnight; NaN when it is not a time. */
export function minutesOf(time: string) {
  const m = /^(\d{2}):(\d{2})/.exec(time)
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN
}

/** A `YYYY-MM-DD` key at noon UTC: a date with no zone to shift it. */
export function dateOfKey(day: string) {
  return new Date(`${day}T12:00:00Z`)
}

/** ISO weekday of a day key: 1 Monday … 7 Sunday. */
export function isoWeekdayOfKey(day: string) {
  return dateOfKey(day).getUTCDay() || 7
}

/** "Mon". */
export function weekdayShort(day: string) {
  return WEEKDAY_SHORT[isoWeekdayOfKey(day) - 1]!
}

/** "Tue 08:15": how a place in the week is said, by default. */
export function describePlace(day: string, minute: number) {
  return `${weekdayShort(day)} ${hhmm(minute)}`
}

/** "Tuesday 17 Nov, 08:15": a quarter hour's accessible name. */
export function describeCell(day: string, minute: number) {
  const date = dateOfKey(day)
  return `${WEEKDAY_LONG[isoWeekdayOfKey(day) - 1]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}, ${hhmm(minute)}`
}

/** "16–22 Nov", or "30 Nov – 6 Dec" across a month's end. */
export function weekRangeLabel(days: readonly string[]) {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return ""
  const a = dateOfKey(first)
  const b = dateOfKey(last)
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
}

/**
 * The snapped minute a pointer at `y` points to, on a track whose box starts
 * at `top` and is `height` tall: the quarter hour under the pointer (floor,
 * not round, so the drop lands on the cell the pointer is over), kept inside
 * the day.
 */
export function minuteAtY(y: number, top: number, height: number, snap: number) {
  const rows = DAY_MINUTES / snap
  if (height <= 0) return 0
  const row = Math.min(rows - 1, Math.max(0, Math.floor(((y - top) / height) * rows)))
  return row * snap
}

/** A block held by the keyboard: where it is now, and where it was picked up. */
export type HeldPlace = { id: string; day: number; start: number; fromDay: number; fromStart: number }

/**
 * One step of a held block: `dDay` columns and `dMinutes` minutes, kept on
 * the days shown and inside the day (a block `length` long never runs past
 * 24:00).
 */
export function stepHeld(held: HeldPlace, dDay: number, dMinutes: number, { days, length }: { days: number; length: number }): HeldPlace {
  return {
    ...held,
    day: Math.min(days - 1, Math.max(0, held.day + dDay)),
    start: Math.min(DAY_MINUTES - length, Math.max(0, held.start + dMinutes)),
  }
}

/** A block's lane among the blocks that overlap it on its day. */
export type Lane = { lane: number; lanes: number }

/**
 * Which blocks sit side by side: ui-sdk's `stackSpans`. The block held by the
 * keyboard floats over the others at full width while it moves; it still
 * counts at the place it was picked up from, so its neighbours keep their
 * lanes until it is put down, and only then make room.
 */
export function lanesOf(spans: readonly { id: string; track: string; start: number; end: number }[], heldId?: string | null): Map<string, Lane> {
  const lanes = stackSpans(spans)
  if (heldId) lanes.set(heldId, { lane: 0, lanes: 1 })
  return lanes
}

/**
 * A box's place on the layer: its day column, its lane in that day, its
 * minute. In container units of the layer (a size container), so a move is
 * a `translate` and every move animates.
 */
export function placeOnLayer(day: number, start: number, length: number, days: number, lane: Lane = { lane: 0, lanes: 1 }) {
  const col = `100cqw / ${days}`
  return {
    width: `calc(${col} / ${lane.lanes} - 4px)`,
    height: `calc(${length / DAY_MINUTES} * 100cqh - 2px)`,
    translate: `calc(${col} * ${day} + ${col} / ${lane.lanes} * ${lane.lane} + 2px) calc(${start / DAY_MINUTES} * 100cqh + 1px)`,
  }
}
