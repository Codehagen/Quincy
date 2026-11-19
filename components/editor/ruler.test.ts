import { describe, expect, it } from "vitest"

import { rulerMarks } from "./ruler"

describe("rulerMarks", () => {
  it("never repeats a label on a short clip", () => {
    const marks = rulerMarks(1_300_000, 7)
    const labels = marks.map((m) => m.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels).toEqual(["00:00.0", "00:00.5", "00:01.0"])
  })

  it("reads whole seconds on a long take", () => {
    const labels = rulerMarks(60_000_000, 7).map((m) => m.label)
    expect(labels).toEqual(["00:00", "00:10", "00:20", "00:30", "00:40", "00:50", "01:00"])
  })

  it("falls to frames under a tenth", () => {
    const labels = rulerMarks(200_000, 7, 30).map((m) => m.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels[1]).toBe("00:00:01")
  })

  it("stays inside the span and the mark budget", () => {
    for (const span of [700_000, 1_300_000, 9_000_000, 37_000_000, 900_000_000]) {
      const marks = rulerMarks(span, 9)
      expect(marks.length).toBeLessThanOrEqual(9)
      expect(marks.at(-1)!.atUs).toBeLessThanOrEqual(span)
    }
  })
})
