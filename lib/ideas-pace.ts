/**
 * How many ideas the person drafts in a week, against their own usual week.
 *
 * The one number the Ideas page states ("17 ideas waiting. None drafted this
 * week; you usually draft 4."). It is stated against the person's own history
 * and nothing else (docs/vision.md: every number against the user's own
 * baseline), so when there is no history there is no "usually", and the page
 * drops that clause rather than invent a figure.
 *
 * Pure and client-safe. The input is one instant per idea drafted: the first
 * draft that carried its hook (`draft.riff_hook`). An idea written for two
 * channels is two drafts and one idea, so the caller groups by hook first.
 *
 * - **A week starts on Monday, in the person's own zone.** "This week" is the
 *   calendar week they are living in, not the last 168 hours.
 * - **"Usually" is the median of the complete weeks before this one**, at most
 *   `PACE_WEEKS` of them, and only weeks on or after the week of their first
 *   drafted idea: the weeks before they started are not weeks they drafted
 *   none in.
 * - **At least `PACE_MIN_WEEKS` complete weeks, or no "usually".** One or two
 *   weeks is not a habit, and a median of them would be stated as one.
 * - **A median of 0 is no "usually" either.** "You usually draft 0" is true
 *   and says nothing a person can act on.
 */

import {
  addCalendarDays,
  calendarDayIn,
  isoWeekdayOf,
  startOfDayIn,
  type CalendarDate,
} from "./timezone"

/** How many complete weeks the median looks back over. */
export const PACE_WEEKS = 8
/** Fewer complete weeks of history than this, and there is no "usually". */
export const PACE_MIN_WEEKS = 3

export type IdeasPace = {
  /** Ideas drafted since Monday 00:00 in the person's zone. */
  thisWeek: number
  /** The median of their complete weeks, or null when there is no baseline. */
  usual: number | null
}

function mondayOf(day: CalendarDate): CalendarDate {
  return addCalendarDays(day, 1 - isoWeekdayOf(day))
}

export function ideasPace(drafted: readonly Date[], now: Date, zone: string): IdeasPace {
  const thisMonday = mondayOf(calendarDayIn(now, zone))
  const weekStart = (back: number) => startOfDayIn(addCalendarDays(thisMonday, -7 * back), zone)

  const thisWeekStart = weekStart(0)
  const thisWeek = drafted.filter((d) => d >= thisWeekStart && d <= now).length

  const first = drafted.reduce<Date | null>((min, d) => (min === null || d < min ? d : min), null)
  if (!first) return { thisWeek, usual: null }
  const firstWeekStart = startOfDayIn(mondayOf(calendarDayIn(first, zone)), zone)

  const counts: number[] = []
  for (let back = 1; back <= PACE_WEEKS; back++) {
    const start = weekStart(back)
    if (start < firstWeekStart) break
    const end = weekStart(back - 1)
    counts.push(drafted.filter((d) => d >= start && d < end).length)
  }
  if (counts.length < PACE_MIN_WEEKS) return { thisWeek, usual: null }

  const sorted = [...counts].sort((a, b) => a - b)
  const mid = sorted.length / 2
  const median = sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  const usual = Math.round(median)
  return { thisWeek, usual: usual > 0 ? usual : null }
}
