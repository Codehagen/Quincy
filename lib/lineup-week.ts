import {
  addCalendarDays,
  dayKeyOf,
  instantOf,
  isoWeekdayOf,
  parseDayKey,
  parseTimeOfDay,
  type CalendarDate,
} from "./timezone"

/**
 * The arithmetic behind /lineup's week, with no database in it, so the
 * server read (lib/lineup.ts) and the calendar in the browser
 * (components/lineup) reason about a slot the same way.
 *
 * **A slot is filled at its own instant.** A standing slot ("Tuesday 08:00,
 * X") has one occurrence a week, and an occurrence is filled when a post
 * points at the slot *and* goes out at that instant. `nextFreeSlot`
 * (lib/scheduling.ts) has always asked it that way. /lineup used to ask "does
 * any post this week point at the slot", which disagreed the moment a post
 * left its slot's time without leaving the slot (Post now did exactly that,
 * see `requeuedForNow` in lib/publish-run.ts): the page drew Tuesday as
 * taken while the next approval was placed into it.
 */

/** The key of one occurrence of a slot: the slot and the day it falls on. */
export function occurrenceKey(slotId: string, dayId: string) {
  return `${slotId}@${dayId}`
}

/**
 * Which slot occurrences in these days are filled, and by which post.
 *
 * A post fills the occurrence of its slot whose instant equals its own
 * `scheduledFor`. A post that points at a slot but goes out at another time
 * (sent early, or a row left from before `requeuedForNow`) fills nothing: it
 * is a one-off at its own time, and the slot's occurrence is still open.
 */
export function filledOccurrences(
  posts: readonly { id: string; slotId: string | null; scheduledFor: Date }[],
  slots: readonly { id: string; weekday: number; timeOfDay: string }[],
  days: readonly CalendarDate[],
  zone: string
): Map<string, string> {
  const byInstant = new Map<string, string>()
  for (const p of posts) {
    if (p.slotId) byInstant.set(`${p.slotId}#${p.scheduledFor.getTime()}`, p.id)
  }

  const filled = new Map<string, string>()
  for (const s of slots) {
    const time = parseTimeOfDay(s.timeOfDay)
    if (!time) continue
    for (const day of days) {
      if (isoWeekdayOf(day) !== s.weekday) continue
      const at = instantOf({ ...day, ...time }, zone)
      const post = byInstant.get(`${s.id}#${at.getTime()}`)
      if (post) filled.set(occurrenceKey(s.id, dayKeyOf(day)), post)
    }
  }
  return filled
}

/** The Monday of the week a day falls in, `YYYY-MM-DD`. Null when it is not a day. */
export function mondayOf(dayId: string): string | null {
  const day = parseDayKey(dayId)
  if (!day) return null
  return dayKeyOf(addCalendarDays(day, 1 - isoWeekdayOf(day)))
}

/** The seven days of the week that starts on `monday`, as keys. */
export function weekDays(monday: string): string[] {
  const start = parseDayKey(monday)
  if (!start) return []
  return Array.from({ length: 7 }, (_, i) => dayKeyOf(addCalendarDays(start, i)))
}

/** `YYYY-MM-DD` plus `n` days. */
export function addDayKeys(dayId: string, n: number): string {
  const day = parseDayKey(dayId)
  return day ? dayKeyOf(addCalendarDays(day, n)) : dayId
}

/** ISO weekday of a day key: 1 Monday … 7 Sunday. */
export function weekdayOfKey(dayId: string): number {
  const day = parseDayKey(dayId)
  return day ? isoWeekdayOf(day) : 1
}

/** Where `movePost` and `reorderLineup` can put a post. Mirrors `MoveTarget` in app/(app)/lineup/actions.ts. */
export type MoveTarget = { kind: "slot"; slotId: string } | { kind: "day"; dayId: string; time: string }

/**
 * The target that puts a post at this slot's occurrence on `dayId`.
 *
 * `movePost` resolves a slot target to the slot's *next* occurrence, today
 * included (`nextOccurrence` in the actions file). That is the occurrence on
 * `dayId` only while `dayId` is within the seven days from today; further
 * out, a slot target would land the post this week instead of on the day it
 * was dropped on. So past that, the post goes to the day and time as a
 * one-off (`slotted: false`), and the caller says so. Filling a later
 * week's occurrence as a slot needs the server to take a day with the slot.
 */
export function slotTargetOn(
  slot: { id: string; time: string },
  dayId: string,
  today: string
): { target: MoveTarget; slotted: boolean } {
  if (dayId >= today && dayId < addDayKeys(today, 7)) {
    return { target: { kind: "slot", slotId: slot.id }, slotted: true }
  }
  return { target: { kind: "day", dayId, time: slot.time }, slotted: false }
}
