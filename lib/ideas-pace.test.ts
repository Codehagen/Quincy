import { describe, expect, it } from "vitest"

import { ideasPace } from "./ideas-pace"

// Wednesday 18 Nov 2026, 12:00 UTC. Monday of this week is 16 Nov.
const NOW = new Date("2026-11-18T12:00:00Z")
const at = (iso: string) => new Date(iso)

describe("ideasPace", () => {
  it("has no baseline with no history", () => {
    expect(ideasPace([], NOW, "UTC")).toEqual({ thisWeek: 0, usual: null })
  })

  it("counts this week from Monday in the person's zone", () => {
    // Sunday 15 Nov 23:30 UTC is Monday 00:30 in Oslo, so it is this week there.
    const late = at("2026-11-15T23:30:00Z")
    expect(ideasPace([late], NOW, "UTC").thisWeek).toBe(0)
    expect(ideasPace([late], NOW, "Europe/Oslo").thisWeek).toBe(1)
  })

  it("states no usual week under three complete weeks", () => {
    const d = [at("2026-11-03T10:00:00Z"), at("2026-11-10T10:00:00Z")]
    expect(ideasPace(d, NOW, "UTC").usual).toBeNull()
  })

  it("takes the median of complete weeks since the first draft", () => {
    const d = [
      // week of 26 Oct: 2
      at("2026-10-26T10:00:00Z"),
      at("2026-10-27T10:00:00Z"),
      // week of 2 Nov: 4
      at("2026-11-02T10:00:00Z"),
      at("2026-11-03T10:00:00Z"),
      at("2026-11-04T10:00:00Z"),
      at("2026-11-05T10:00:00Z"),
      // week of 9 Nov: 5
      ...[9, 10, 11, 12, 13].map((day) => at(`2026-11-${day}T10:00:00Z`)),
      // this week: 1, not in the median
      at("2026-11-17T10:00:00Z"),
    ]
    expect(ideasPace(d, NOW, "UTC")).toEqual({ thisWeek: 1, usual: 4 })
  })

  it("counts a quiet week after the first draft as zero, not as missing", () => {
    const d = [at("2026-10-26T10:00:00Z"), at("2026-10-27T10:00:00Z"), at("2026-11-10T10:00:00Z")]
    // weeks: 2, 0, 1 → median 1
    expect(ideasPace(d, NOW, "UTC").usual).toBe(1)
  })

  it("drops a usual week of zero", () => {
    const d = [at("2026-10-26T10:00:00Z")]
    // weeks: 1, 0, 0 → median 0
    expect(ideasPace(d, NOW, "UTC").usual).toBeNull()
  })
})
