import { describe, expect, it } from "vitest"

import { againstMedian, formatMultiple } from "./against-median"

describe("formatMultiple", () => {
  it("matches lib/numbers.ts rounding", () => {
    expect(formatMultiple(74.4)).toBe("74×")
    expect(formatMultiple(1.84)).toBe("1.8×")
    expect(formatMultiple(0.314)).toBe("0.31×")
    expect(formatMultiple(Number.NaN)).toBe("—")
  })
})

describe("againstMedian", () => {
  it("says the multiple against the person's own median", () => {
    expect(againstMedian({ value: 3940, median: 1210, at: "at 48 hours", person: "me" })).toEqual({
      multiple: 3940 / 1210,
      direction: "above",
      text: "3.3× my median at 48 hours.",
    })
  })

  it("says below when it is below", () => {
    expect(againstMedian({ value: 710, median: 1210 }).direction).toBe("below")
    expect(againstMedian({ value: 710, median: 1210 }).text).toBe("0.59× your median.")
  })

  it("does not call 1.0× a direction", () => {
    expect(againstMedian({ value: 1240, median: 1210 })).toMatchObject({
      direction: "at",
      text: "About your median.",
    })
  })

  it("can say the median itself, for the line under a figure", () => {
    expect(againstMedian({ value: 31, median: 6, say: "median" }).text).toBe("Your median is 6.")
  })

  it("says so when nothing has been measured, instead of a ratio of zero", () => {
    expect(againstMedian({ value: 31, median: 0 })).toEqual({
      multiple: null,
      direction: "none",
      text: "No median yet. Nothing has been measured.",
    })
  })
})
