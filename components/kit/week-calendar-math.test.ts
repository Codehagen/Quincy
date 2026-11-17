import { describe, expect, it } from "vitest"

import {
  DAY_MINUTES,
  describeCell,
  describePlace,
  hhmm,
  lanesOf,
  minuteAtY,
  minutesOf,
  placeOnLayer,
  stepHeld,
  weekRangeLabel,
} from "./week-calendar-math"

describe("times", () => {
  it("says minutes as a zero-padded clock", () => {
    expect(hhmm(0)).toBe("00:00")
    expect(hhmm(8 * 60 + 5)).toBe("08:05")
    expect(hhmm(DAY_MINUTES - 15)).toBe("23:45")
  })

  it("reads a clock back", () => {
    expect(minutesOf("08:15")).toBe(495)
    expect(Number.isNaN(minutesOf("8:15"))).toBe(true)
  })

  it("says a place and a cell", () => {
    expect(describePlace("2026-11-17", 495)).toBe("Tue 08:15")
    expect(describeCell("2026-11-17", 495)).toBe("Tuesday 17 Nov, 08:15")
  })

  it("says a week's range, across a month's end", () => {
    expect(weekRangeLabel(["2026-11-16", "2026-11-22"])).toBe("16–22 Nov")
    expect(weekRangeLabel(["2026-11-30", "2026-12-06"])).toBe("30 Nov – 6 Dec")
  })
})

describe("minuteAtY: where a pointer lands", () => {
  // A day 24 hours of 56px tall: a quarter hour is 14px.
  const height = 24 * 56

  it("snaps down to the quarter hour under the pointer", () => {
    expect(minuteAtY(100 + 8 * 56 + 13, 100, height, 15)).toBe(8 * 60)
    expect(minuteAtY(100 + 8 * 56 + 14, 100, height, 15)).toBe(8 * 60 + 15)
  })

  it("keeps a pointer above or below the day inside it", () => {
    expect(minuteAtY(0, 100, height, 15)).toBe(0)
    expect(minuteAtY(100 + height + 40, 100, height, 15)).toBe(DAY_MINUTES - 15)
  })

  it("follows another snap", () => {
    expect(minuteAtY(100 + 8 * 56 + 20, 100, height, 30)).toBe(8 * 60)
  })

  it("answers midnight for a track with no height", () => {
    expect(minuteAtY(50, 0, 0, 15)).toBe(0)
  })
})

describe("stepHeld: a block moved by the keyboard", () => {
  const held = { id: "p", day: 2, start: 8 * 60, fromDay: 2, fromStart: 8 * 60 }
  const week = { days: 7, length: 45 }

  it("moves a quarter hour, an hour, a day", () => {
    expect(stepHeld(held, 0, 15, week).start).toBe(8 * 60 + 15)
    expect(stepHeld(held, 0, -60, week).start).toBe(7 * 60)
    expect(stepHeld(held, 1, 0, week).day).toBe(3)
  })

  it("never leaves the days shown", () => {
    expect(stepHeld({ ...held, day: 0 }, -1, 0, week).day).toBe(0)
    expect(stepHeld({ ...held, day: 6 }, 1, 0, week).day).toBe(6)
    expect(stepHeld(held, 1, 0, { days: 1, length: 45 }).day).toBe(0)
  })

  it("never runs past midnight at either end", () => {
    expect(stepHeld({ ...held, start: 0 }, 0, -15, week).start).toBe(0)
    expect(stepHeld({ ...held, start: DAY_MINUTES - 45 }, 0, 15, week).start).toBe(DAY_MINUTES - 45)
  })

  it("remembers where it was picked up", () => {
    const moved = stepHeld(held, 1, 60, week)
    expect([moved.fromDay, moved.fromStart]).toEqual([2, 8 * 60])
  })
})

describe("lanesOf: blocks side by side", () => {
  const block = (id: string, track: string, start: number) => ({ id, track, start, end: start + 45 })

  it("gives a block alone the whole column", () => {
    expect(lanesOf([block("a", "mon", 480)]).get("a")).toEqual({ lane: 0, lanes: 1 })
  })

  it("puts two blocks that overlap side by side", () => {
    const lanes = lanesOf([block("a", "fri", 540), block("b", "fri", 555)])
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 })
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 })
  })

  it("keeps blocks on two days, or three hours apart, apart", () => {
    const lanes = lanesOf([block("a", "fri", 540), block("b", "sat", 540), block("c", "fri", 720)])
    for (const id of ["a", "b", "c"]) expect(lanes.get(id)?.lanes).toBe(1)
  })

  it("floats a held block at full width, and its neighbours keep their lanes", () => {
    const lanes = lanesOf([block("a", "fri", 540), block("b", "fri", 555)], "a")
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 1 })
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 })
  })
})

describe("placeOnLayer", () => {
  it("places by translate in container units, so a move animates", () => {
    const p = placeOnLayer(2, 480, 45, 7, { lane: 1, lanes: 2 })
    expect(p.translate).toBe("calc(100cqw / 7 * 2 + 100cqw / 7 / 2 * 1 + 2px) calc(0.3333333333333333 * 100cqh + 1px)")
    expect(p.width).toBe("calc(100cqw / 7 / 2 - 4px)")
    expect(p.height).toBe("calc(0.03125 * 100cqh - 2px)")
  })
})
