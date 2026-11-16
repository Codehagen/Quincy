import { describe, expect, it } from "vitest"

import {
  isClaimStale,
  isMissed,
  isValidCadence,
  MAX_LATENESS_MS,
  nextRunAfter,
  STALE_CLAIM_MS,
} from "./rhythm-schedule"
import { hhmmIn, wallClockIn } from "./timezone"

/**
 * The timing model is the whole safety argument for the dispatcher, so this
 * file pins the boundaries rather than the happy path.
 *
 * Every assertion about "what time is it there" goes through lib/timezone.ts's
 * own readers rather than `getHours()`, which reads the *test runner's* zone
 * and would pass on a laptop in Oslo and fail in CI.
 */

const OSLO = "Europe/Oslo"
const AUCKLAND = "Pacific/Auckland"

/**
 * Oslo's 2026 transitions, verified against `Intl` rather than assumed:
 * spring forward on **2026-03-29**, fall back on **2026-10-25**. The two DST
 * tests below straddle exactly those days, and they are the tests that fail if
 * anyone replaces the wall-clock arithmetic with `now + 86_400_000`.
 */

describe("isValidCadence", () => {
  it("accepts a daily cadence with a null weekday", () => {
    expect(isValidCadence({ hour: 9, minute: 0, weekday: null })).toBe(true)
  })

  it("accepts both ends of the weekday range", () => {
    expect(isValidCadence({ hour: 0, minute: 0, weekday: 1 })).toBe(true)
    expect(isValidCadence({ hour: 23, minute: 59, weekday: 7 })).toBe(true)
  })

  it("refuses hour 24, which would otherwise never match", () => {
    expect(isValidCadence({ hour: 24, minute: 0, weekday: null })).toBe(false)
  })

  it("refuses weekday 0, the off-by-one every ISO/JS conversion makes", () => {
    expect(isValidCadence({ hour: 9, minute: 0, weekday: 0 })).toBe(false)
  })

  it("refuses a fractional hour", () => {
    expect(isValidCadence({ hour: 9.5, minute: 0, weekday: null })).toBe(false)
  })
})

describe("nextRunAfter — daily", () => {
  const daily = { hour: 9, minute: 0, weekday: null }

  it("fires today when asked a minute before", () => {
    // 08:59 in Oslo on 2026-03-10 is 07:59Z (CET, +01:00).
    const next = nextRunAfter(daily, OSLO, new Date("2026-03-10T07:59:00Z"))
    expect(next?.toISOString()).toBe("2026-03-10T08:00:00.000Z")
  })

  it("fires tomorrow when asked a minute after, not in a minute", () => {
    const next = nextRunAfter(daily, OSLO, new Date("2026-03-10T08:01:00Z"))
    expect(next?.toISOString()).toBe("2026-03-11T08:00:00.000Z")
  })

  it("is strictly after, so recomputing at the moment of a run moves it on", () => {
    // The dispatcher recomputes from the instant the run started. A non-strict
    // comparison would return the same instant and leave the row due forever.
    const fired = new Date("2026-03-10T08:00:00Z")
    const next = nextRunAfter(daily, OSLO, fired)
    expect(next!.getTime()).toBeGreaterThan(fired.getTime())
  })

  it("stays 09:00 local across a spring-forward transition", () => {
    // 07:00Z on the 28th is 08:00 in Oslo (+01:00), so `before` is that day's
    // 09:00 and `after` is the 29th's — the day the clocks go forward. The gap
    // is 23 hours, not 24, which is the entire point of doing this in wall
    // clocks.
    const before = nextRunAfter(daily, OSLO, new Date("2026-03-28T07:00:00Z"))
    const after = nextRunAfter(daily, OSLO, before!)

    expect(before!.toISOString()).toBe("2026-03-28T08:00:00.000Z")

    expect(hhmmIn(before!, OSLO)).toBe("09:00")
    expect(hhmmIn(after!, OSLO)).toBe("09:00")
    expect(after!.getTime() - before!.getTime()).toBe(23 * 60 * 60 * 1000)
  })

  it("stays 09:00 local across an autumn fall-back transition", () => {
    // 06:00Z on the 24th is 08:00 in Oslo (+02:00), so `after` lands on the
    // 25th — a 25-hour day.
    const before = nextRunAfter(daily, OSLO, new Date("2026-10-24T06:00:00Z"))
    const after = nextRunAfter(daily, OSLO, before!)

    expect(before!.toISOString()).toBe("2026-10-24T07:00:00.000Z")

    expect(hhmmIn(before!, OSLO)).toBe("09:00")
    expect(hhmmIn(after!, OSLO)).toBe("09:00")
    expect(after!.getTime() - before!.getTime()).toBe(25 * 60 * 60 * 1000)
  })

  it("gives the same wall clock a different instant in a different zone", () => {
    const now = new Date("2026-03-10T00:00:00Z")
    const oslo = nextRunAfter(daily, OSLO, now)
    const auckland = nextRunAfter(daily, AUCKLAND, now)

    expect(hhmmIn(oslo!, OSLO)).toBe("09:00")
    expect(hhmmIn(auckland!, AUCKLAND)).toBe("09:00")
    expect(oslo!.getTime()).not.toBe(auckland!.getTime())
  })

  it("handles midnight without rolling the day backwards", () => {
    const next = nextRunAfter(
      { hour: 0, minute: 0, weekday: null },
      OSLO,
      new Date("2026-03-10T12:00:00Z")
    )
    expect(hhmmIn(next!, OSLO)).toBe("00:00")
    expect(wallClockIn(next!, OSLO).day).toBe(11)
  })
})

describe("nextRunAfter — weekly", () => {
  // ISO weekday 1 = Monday. 2026-03-09 is a Monday.
  const monday2217 = { hour: 22, minute: 17, weekday: 1 }

  it("fires today when the hour has not passed", () => {
    const next = nextRunAfter(monday2217, OSLO, new Date("2026-03-09T12:00:00Z"))
    expect(wallClockIn(next!, OSLO).day).toBe(9)
    expect(hhmmIn(next!, OSLO)).toBe("22:17")
  })

  it("rolls a whole week when the hour has passed", () => {
    // 22:18 Oslo on the Monday is 21:18Z.
    const next = nextRunAfter(monday2217, OSLO, new Date("2026-03-09T21:18:00Z"))
    expect(wallClockIn(next!, OSLO).day).toBe(16)
  })

  it("finds the right weekday from any day of the week", () => {
    // Asked on the Friday, the next Monday is the 16th.
    const next = nextRunAfter(monday2217, OSLO, new Date("2026-03-13T12:00:00Z"))
    expect(wallClockIn(next!, OSLO).day).toBe(16)
    expect(isoWeekdayOfDate(next!, OSLO)).toBe(1)
  })

  it("treats Sunday as 7, not 0", () => {
    const sunday = { hour: 17, minute: 0, weekday: 7 }
    const next = nextRunAfter(sunday, OSLO, new Date("2026-03-09T12:00:00Z"))
    expect(isoWeekdayOfDate(next!, OSLO)).toBe(7)
  })

  it("is seven days apart, in wall clock terms, run to run", () => {
    const first = nextRunAfter(monday2217, OSLO, new Date("2026-06-01T00:00:00Z"))
    const second = nextRunAfter(monday2217, OSLO, first!)
    expect(hhmmIn(second!, OSLO)).toBe("22:17")
    expect(isoWeekdayOfDate(second!, OSLO)).toBe(1)
  })
})

describe("nextRunAfter — refusal", () => {
  it("returns null rather than an invalid instant for a bad cadence", () => {
    expect(
      nextRunAfter({ hour: 99, minute: 0, weekday: null }, OSLO, new Date())
    ).toBeNull()
  })
})

describe("isMissed", () => {
  const due = new Date("2026-03-10T08:00:00Z")

  it("is not missed the moment it comes due", () => {
    expect(isMissed(due, due)).toBe(false)
  })

  it("is not missed at exactly the boundary", () => {
    // Inclusive, matching isMissed in lib/publish-run.ts. A boundary that is
    // itself unrunnable is a rule nobody can predict from "six hours".
    expect(isMissed(due, new Date(due.getTime() + MAX_LATENESS_MS))).toBe(false)
  })

  it("is missed one millisecond past it", () => {
    expect(isMissed(due, new Date(due.getTime() + MAX_LATENESS_MS + 1))).toBe(
      true
    )
  })

  it("is not missed when it is not yet due", () => {
    expect(isMissed(due, new Date(due.getTime() - 60_000))).toBe(false)
  })
})

describe("isClaimStale", () => {
  const now = new Date("2026-03-10T08:00:00Z")

  it("treats an unclaimed row as takeable", () => {
    expect(isClaimStale(null, now)).toBe(true)
  })

  it("refuses to steal a claim inside the window", () => {
    expect(isClaimStale(new Date(now.getTime() - 60_000), now)).toBe(false)
  })

  it("releases a claim past the window", () => {
    expect(
      isClaimStale(new Date(now.getTime() - STALE_CLAIM_MS - 1), now)
    ).toBe(true)
  })

  it("outlasts the route's own maxDuration, so a live run is never robbed", () => {
    // app/api/cron/rhythms/route.ts caps at 300s. A claim younger than that
    // belongs to a run that may still be working.
    expect(STALE_CLAIM_MS).toBeGreaterThan(300_000)
  })
})

/** ISO weekday of an instant as read in `zone`. Local to the test. */
function isoWeekdayOfDate(instant: Date, zone: string): number {
  const wall = wallClockIn(instant, zone)
  const utc = Date.UTC(wall.year, wall.month - 1, wall.day)
  const day = new Date(utc).getUTCDay()
  return day === 0 ? 7 : day
}
