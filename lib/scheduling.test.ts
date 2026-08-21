import { describe, expect, it } from "vitest"

import { isBeyondVisibleWeek, occurrencesOf } from "./scheduling"
import { formatSlotTime } from "./slots"
import { hhmmIn, isoWeekdayOf, calendarDayIn } from "./timezone"

/**
 * Where an approved version lands.
 *
 * Every wrong answer this file can produce is a post that goes out on the wrong
 * day or at the wrong hour, and the way it goes wrong is always the same: the
 * question "which day is it" gets answered against the server's clock instead
 * of the reader's. Vercel runs in UTC, so on a machine in Oslo those agree for
 * twenty-two hours a day and the bug only appears late at night.
 *
 * `nextFreeSlot` itself reads the database — scripts/verify-publish-run.ts
 * covers that half, including a taken slot being skipped.
 */

/** Wednesday 2026-08-05, 12:00 UTC. Fixed, so nothing depends on the run date. */
const NOW = new Date("2026-08-05T12:00:00.000Z")

const WEDNESDAY = 3
const MONDAY = 1

describe("occurrencesOf", () => {
  it("returns today when the weekday matches, even once the time has passed", () => {
    /**
     * NOW is Wednesday noon and this asks for Wednesday 08:00, so the answer is
     * four hours in the past. That is correct *for this function* — it
     * enumerates a weekday's occurrences and does not know what they are for.
     *
     * Rejecting the passed one is `nextFreeSlot`'s job, and pinning it here
     * would hide the layer that actually decides. See the
     * "nextFreeSlot candidate window" block below, which is where approving in
     * the afternoon is stopped from scheduling into the past.
     */
    const [first] = occurrencesOf(WEDNESDAY, "08:00", "UTC", NOW, 1)

    expect(first.toISOString()).toBe("2026-08-05T08:00:00.000Z")
  })

  it("walks forward to the next matching weekday", () => {
    const [first] = occurrencesOf(MONDAY, "08:00", "UTC", NOW, 1)

    expect(first.toISOString()).toBe("2026-08-10T08:00:00.000Z")
  })

  it("returns one occurrence per week, seven days apart", () => {
    const found = occurrencesOf(MONDAY, "08:00", "UTC", NOW, 3)

    expect(found).toHaveLength(3)
    expect(found.map((d) => d.toISOString())).toEqual([
      "2026-08-10T08:00:00.000Z",
      "2026-08-17T08:00:00.000Z",
      "2026-08-24T08:00:00.000Z",
    ])
  })

  it("reads the weekday in the user's zone, not the server's", () => {
    /**
     * The bug this test exists for. At 23:30 on a Monday in Oslo the server is
     * still on Monday in UTC — but by 22:30 UTC on a Sunday, Oslo has already
     * turned over to Monday. Asked for "the next Monday 08:00", a server-zone
     * answer walks a whole week forward because UTC still thinks it is Sunday.
     */
    const sundayLateUtc = new Date("2026-08-09T22:30:00.000Z")

    expect(isoWeekdayOf(calendarDayIn(sundayLateUtc, "UTC"))).toBe(7)
    expect(isoWeekdayOf(calendarDayIn(sundayLateUtc, "Europe/Oslo"))).toBe(1)

    const [oslo] = occurrencesOf(
      MONDAY,
      "08:00",
      "Europe/Oslo",
      sundayLateUtc,
      1
    )

    // Monday the 10th, eight in the morning in Oslo — which is 06:00 UTC.
    expect(oslo.toISOString()).toBe("2026-08-10T06:00:00.000Z")
  })

  it("keeps the wall clock the user chose across a zone", () => {
    // The slot says 08:00. Whatever instant comes back has to read as 08:00 on
    // their clock, because that is the only number they ever saw.
    const [oslo] = occurrencesOf(MONDAY, "08:00", "Europe/Oslo", NOW, 1)

    expect(hhmmIn(oslo, "Europe/Oslo")).toBe("08:00")
  })

  it("survives a daylight-saving boundary without drifting an hour", () => {
    /**
     * Oslo leaves summer time on Sunday 2026-10-25. A Monday 08:00 slot is
     * 06:00 UTC before it and 07:00 UTC after — the instants differ, and that
     * is correct. Storing an offset instead of deriving from the zone is what
     * makes a rhythm silently slip an hour twice a year.
     */
    const beforeChange = new Date("2026-10-19T12:00:00.000Z")
    const found = occurrencesOf(MONDAY, "08:00", "Europe/Oslo", beforeChange, 2)

    expect(found[0].toISOString()).toBe("2026-10-19T06:00:00.000Z")
    expect(found[1].toISOString()).toBe("2026-10-26T07:00:00.000Z")

    // Both still read as 08:00 to the person who set the slot.
    expect(hhmmIn(found[0], "Europe/Oslo")).toBe("08:00")
    expect(hhmmIn(found[1], "Europe/Oslo")).toBe("08:00")
  })

  it("returns nothing for a time that will not parse", () => {
    // A slot row with junk in `time_of_day` must produce no candidates rather
    // than a NaN instant that Postgres would reject at insert time.
    expect(occurrencesOf(MONDAY, "not a time", "UTC", NOW, 2)).toEqual([])
  })
})

/**
 * The rule that stops an approval landing in the past.
 *
 * `nextFreeSlot` reads the database, so these exercise the selection rule
 * rather than the function: the same candidate generation, the same lower
 * bound. What is pinned is the boundary, because getting it wrong is silent —
 * a past instant reaches lib/publish-run.ts and either publishes within five
 * minutes or is marked failed for being late, and both look like the product
 * working until somebody checks the account.
 */
describe("nextFreeSlot candidate window", () => {
  /** The lower bound as `nextFreeSlot` applies it. Kept in step with it. */
  const future = (at: Date, now: Date) => at.getTime() > now.getTime()

  it("rejects this morning's slot when the morning has gone", () => {
    // NOW is Wednesday noon; the slot is Wednesday 08:00. This is the case that
    // made an afternoon approval schedule four hours into the past.
    const [today] = occurrencesOf(WEDNESDAY, "08:00", "UTC", NOW, 2)

    expect(future(today, NOW)).toBe(false)
  })

  it("falls through to the same slot next week", () => {
    const surviving = occurrencesOf(WEDNESDAY, "08:00", "UTC", NOW, 2).filter(
      (at) => future(at, NOW)
    )

    // Not empty, and not the passed one. Two weeks of candidates is what makes
    // this hold — with one week generated there would be nothing left to fall
    // through to. See HORIZON_DAYS in lib/scheduling.ts.
    expect(surviving).toHaveLength(1)
    expect(surviving[0].toISOString()).toBe("2026-08-12T08:00:00.000Z")
  })

  it("keeps a slot later the same day", () => {
    // The other half of the boundary. 18:00 has not passed at noon, so it is
    // the right answer and must not be discarded with the morning's.
    const [today] = occurrencesOf(WEDNESDAY, "18:00", "UTC", NOW, 2)

    expect(future(today, NOW)).toBe(true)
    expect(today.toISOString()).toBe("2026-08-05T18:00:00.000Z")
  })

  it("leaves a slot on another weekday alone", () => {
    // The filter must only ever remove instants that have passed. A Monday slot
    // read on a Wednesday is five days out and none of its business.
    const surviving = occurrencesOf(MONDAY, "08:00", "UTC", NOW, 2).filter(
      (at) => future(at, NOW)
    )

    expect(surviving).toHaveLength(2)
    expect(surviving[0].toISOString()).toBe("2026-08-10T08:00:00.000Z")
  })
})

/**
 * Which placements the Lineup will not draw.
 *
 * The horizon is two weeks and the page shows seven days, deliberately — a
 * weekly slot has exactly one occurrence inside a seven-day window, so
 * narrowing the horizon to match would refuse an approval whenever this week's
 * occurrence had passed, while next week's sat free. The mismatch stays and the
 * receipt names it, which makes this predicate the thing standing between a
 * user and a post they were told about but cannot find.
 */
describe("isBeyondVisibleWeek", () => {
  // NOW is Wednesday 2026-08-05 12:00 UTC. getLineup draws Aug 5 through
  // Aug 11 inclusive, so the first instant it will not draw is Aug 12 00:00.
  const day = (iso: string) => new Date(iso)

  it("keeps something later today", () => {
    expect(isBeyondVisibleWeek(day("2026-08-05T18:00:00Z"), NOW, "UTC")).toBe(
      false
    )
  })

  it("keeps the last day the page draws", () => {
    // Aug 11 is the seventh day of the window and is rendered in full.
    expect(isBeyondVisibleWeek(day("2026-08-11T23:00:00Z"), NOW, "UTC")).toBe(
      false
    )
  })

  it("flags the first instant past the window", () => {
    // Midnight on Aug 12 is the boundary itself, and the window is
    // half-open — startOfDay(today + 7) is the first moment NOT drawn.
    expect(isBeyondVisibleWeek(day("2026-08-12T00:00:00Z"), NOW, "UTC")).toBe(
      true
    )
  })

  it("flags a placement a fortnight out", () => {
    expect(isBeyondVisibleWeek(day("2026-08-17T08:00:00Z"), NOW, "UTC")).toBe(
      true
    )
  })

  it("draws the boundary in the reader's zone, not the server's", () => {
    /**
     * The reason this takes a zone at all. At 23:00 UTC on Aug 11 it is already
     * Aug 12 in Oslo, so Oslo's window has rolled and this instant is the start
     * of a day the page no longer draws — while UTC still has it in range. Read
     * against the wrong clock, a post vanishes from Lineup with the receipt
     * still claiming it is inside the week.
     */
    const lateOnTheLastDay = day("2026-08-11T23:00:00Z")

    expect(isBeyondVisibleWeek(lateOnTheLastDay, NOW, "UTC")).toBe(false)
    expect(isBeyondVisibleWeek(lateOnTheLastDay, NOW, "Europe/Oslo")).toBe(true)
  })
})

/**
 * How a future time is said.
 *
 * This exists because the first version reused `formatConversationDate`, whose
 * first branch is `days <= 0 → "Today"`. That is right for a conversation and
 * silently wrong for a schedule: a post two days out rendered as "going out
 * Today", and it took reading the actual page to notice.
 */
describe("formatSlotTime", () => {
  // NOW is Wednesday 2026-08-05 12:00 UTC.
  const at = (iso: string) => new Date(iso)

  it("says today for later today", () => {
    expect(formatSlotTime(at("2026-08-05T18:00:00Z"), "UTC", NOW)).toBe(
      "today at 18:00"
    )
  })

  it("says tomorrow for tomorrow", () => {
    expect(formatSlotTime(at("2026-08-06T08:00:00Z"), "UTC", NOW)).toBe(
      "tomorrow at 08:00"
    )
  })

  it("never says today for a future date", () => {
    // The regression. Two days out is not today, whatever a past-oriented
    // formatter would answer.
    const two = formatSlotTime(at("2026-08-07T08:00:00Z"), "UTC", NOW)

    expect(two).not.toContain("today")
    expect(two).toBe("Fri at 08:00")
  })

  it("carries the date once a weekday stops being unique", () => {
    // Past seven days there is more than one Monday, so the weekday alone
    // would be ambiguous exactly where being wrong matters most.
    expect(formatSlotTime(at("2026-08-17T08:00:00Z"), "UTC", NOW)).toBe(
      "Mon 17 Aug at 08:00"
    )
  })

  it("reads the day in the reader's zone", () => {
    // 23:00 UTC on the 6th is already the 7th in Oslo, so the same instant is
    // "tomorrow" to one reader and two days out to the other.
    const instant = at("2026-08-06T23:00:00Z")

    expect(formatSlotTime(instant, "UTC", NOW)).toBe("tomorrow at 23:00")
    expect(formatSlotTime(instant, "Europe/Oslo", NOW)).toBe("Fri at 01:00")
  })
})
