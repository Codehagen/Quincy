import { describe, expect, it } from "vitest"

import {
  addCalendarDays,
  dayKeyIn,
  dayKeyOf,
  hhmmIn,
  instantOf,
  isoWeekdayOf,
  isValidTimeZone,
  parseDayKey,
  parseTimeOfDay,
  resolveTimeZone,
  startOfDayIn,
  wallClockIn,
} from "./timezone"

/**
 * These run under whatever zone the machine is in, and that is the point. Every
 * assertion below is written against an explicit zone or a UTC instant, so a
 * green run in Oslo and a green run on Vercel mean the same thing. If any test
 * here starts depending on the host's zone, it is testing the bug.
 */

const OSLO = "Europe/Oslo"

describe("isValidTimeZone", () => {
  it("accepts a canonical IANA name", () => {
    expect(isValidTimeZone(OSLO)).toBe(true)
  })

  it("accepts a live alias the runtime still reports", () => {
    // Browsers in India report Asia/Calcutta. supportedValuesOf lists only
    // Asia/Kolkata, which is why this is a constructor call and not a lookup.
    expect(isValidTimeZone("Asia/Calcutta")).toBe(true)
  })

  it("rejects a string that is not a zone", () => {
    expect(isValidTimeZone("Middle/Earth")).toBe(false)
  })
})

describe("resolveTimeZone", () => {
  it("falls back to UTC for a user who has no zone yet", () => {
    expect(resolveTimeZone(null)).toBe("UTC")
    expect(resolveTimeZone(undefined)).toBe("UTC")
    expect(resolveTimeZone("")).toBe("UTC")
  })

  it("falls back to UTC rather than throwing on a junk value", () => {
    // The column is client-supplied. Reaching Intl with this would be a
    // RangeError inside a page render, which is a 500 on /lineup.
    expect(resolveTimeZone("'; drop table user; --")).toBe("UTC")
  })

  it("keeps a zone it recognises", () => {
    expect(resolveTimeZone(OSLO)).toBe(OSLO)
  })
})

describe("wallClockIn", () => {
  it("reads an instant in the zone asked for, not the host's", () => {
    const instant = new Date("2026-08-04T06:00:00Z")

    expect(wallClockIn(instant, "UTC")).toEqual({
      year: 2026,
      month: 8,
      day: 4,
      hour: 6,
      minute: 0,
    })
    expect(wallClockIn(instant, OSLO)).toEqual({
      year: 2026,
      month: 8,
      day: 4,
      hour: 8,
      minute: 0,
    })
  })

  it("crosses a date boundary rather than clamping", () => {
    // 23:30 UTC is already tomorrow in Oslo, and yesterday in Los Angeles.
    const instant = new Date("2026-08-04T23:30:00Z")

    expect(dayKeyIn(instant, OSLO)).toBe("2026-08-05")
    expect(dayKeyIn(instant, "America/Los_Angeles")).toBe("2026-08-04")
  })

  it("reads midnight as hour 0, never hour 24", () => {
    // hour12: false yields "24" on some engines, which parses to a day forward.
    expect(wallClockIn(new Date("2026-08-04T00:00:00Z"), "UTC").hour).toBe(0)
  })
})

describe("instantOf", () => {
  it("is the inverse of wallClockIn", () => {
    const wall = { year: 2026, month: 8, day: 4, hour: 8, minute: 0 }
    expect(instantOf(wall, OSLO).toISOString()).toBe("2026-08-04T06:00:00.000Z")
    expect(wallClockIn(instantOf(wall, OSLO), OSLO)).toEqual(wall)
  })

  it("uses the offset in force on the day, not a fixed one", () => {
    const wall = { year: 2026, month: 1, day: 15, hour: 8, minute: 0 }
    // Oslo is +01:00 in January and +02:00 in August. A fixed offset would put
    // one of these an hour out.
    expect(instantOf(wall, OSLO).toISOString()).toBe("2026-01-15T07:00:00.000Z")
  })

  it("resolves a spring-forward gap to the later reading, never earlier", () => {
    // 29 March 2026, Oslo jumps 02:00 -> 03:00. 02:30 does not exist.
    const gap = { year: 2026, month: 3, day: 29, hour: 2, minute: 30 }
    const resolved = instantOf(gap, OSLO)

    expect(hhmmIn(resolved, OSLO)).toBe("03:30")
    // The failure that would matter: going out an hour before you asked.
    expect(resolved.getTime()).toBeGreaterThan(
      instantOf({ ...gap, hour: 1, minute: 30 }, OSLO).getTime()
    )
  })

  it("resolves a fall-back repeat to the first occurrence", () => {
    // 25 October 2026, Oslo falls 03:00 -> 02:00. 02:30 happens twice: once at
    // 00:30 UTC on summer time, again at 01:30 UTC on winter time.
    const repeated = { year: 2026, month: 10, day: 25, hour: 2, minute: 30 }
    expect(instantOf(repeated, OSLO).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z"
    )
  })

  it("handles a zone with a half-hour offset", () => {
    const wall = { year: 2026, month: 8, day: 4, hour: 12, minute: 0 }
    expect(instantOf(wall, "Asia/Kolkata").toISOString()).toBe(
      "2026-08-04T06:30:00.000Z"
    )
  })
})

describe("startOfDayIn", () => {
  it("is midnight in the zone, not at UTC", () => {
    const date = { year: 2026, month: 8, day: 4 }

    expect(startOfDayIn(date, OSLO).toISOString()).toBe(
      "2026-08-03T22:00:00.000Z"
    )
    expect(startOfDayIn(date, "UTC").toISOString()).toBe(
      "2026-08-04T00:00:00.000Z"
    )
  })

  it("finds midnight on a day whose clocks moved", () => {
    // The transition is at 02:00, so midnight itself is unaffected — but the
    // day is 23 hours long, which is what the window arithmetic has to survive.
    const start = startOfDayIn({ year: 2026, month: 3, day: 29 }, OSLO)
    const next = startOfDayIn({ year: 2026, month: 3, day: 30 }, OSLO)

    expect(hhmmIn(start, OSLO)).toBe("00:00")
    expect(next.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000)
  })
})

describe("addCalendarDays", () => {
  it("rolls over a month end", () => {
    expect(addCalendarDays({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 1,
    })
  })

  it("knows February in a leap year", () => {
    expect(addCalendarDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    })
  })

  it("keeps the calendar day across a DST transition", () => {
    // Adding 86_400_000ms here would land on the 28th at 23:00.
    expect(addCalendarDays({ year: 2026, month: 3, day: 28 }, 1)).toEqual({
      year: 2026,
      month: 3,
      day: 29,
    })
  })
})

describe("isoWeekdayOf", () => {
  it("counts Monday as 1 and Sunday as 7", () => {
    // 3 August 2026 is a Monday.
    expect(isoWeekdayOf({ year: 2026, month: 8, day: 3 })).toBe(1)
    expect(isoWeekdayOf({ year: 2026, month: 8, day: 9 })).toBe(7)
  })
})

describe("dayKeyOf and parseDayKey", () => {
  it("round-trips", () => {
    const date = { year: 2026, month: 8, day: 4 }
    expect(dayKeyOf(date)).toBe("2026-08-04")
    expect(parseDayKey("2026-08-04")).toEqual(date)
  })

  it("rejects a day that does not exist rather than rolling it forward", () => {
    // The id arrives from the client. Date.UTC would turn this into 3 March.
    expect(parseDayKey("2026-02-31")).toBeNull()
    expect(parseDayKey("2026-13-01")).toBeNull()
    expect(parseDayKey("nope")).toBeNull()
  })
})

describe("parseTimeOfDay", () => {
  it("reads a slot's stored time", () => {
    expect(parseTimeOfDay("08:00")).toEqual({ hour: 8, minute: 0 })
    expect(parseTimeOfDay("23:59")).toEqual({ hour: 23, minute: 59 })
  })

  it("rejects a time that is not one", () => {
    expect(parseTimeOfDay("24:00")).toBeNull()
    expect(parseTimeOfDay("08:60")).toBeNull()
    expect(parseTimeOfDay("8:00")).toBeNull()
  })
})
