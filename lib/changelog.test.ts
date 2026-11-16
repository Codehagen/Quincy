import { describe, expect, it } from "vitest"

import {
  countEntries,
  daysSince,
  formatDay,
  readChangelog,
  selectWindow,
  type ChangelogDay,
} from "./changelog"

/** A day with `count` entries on it, shaped like `readChangelog` returns. */
function day(date: string, count = 1): ChangelogDay {
  return {
    date,
    label: formatDay(date),
    entries: Array.from({ length: count }, (_, i) => ({
      title: `${date} #${i + 1}`,
      body: "",
    })),
  }
}

/** Midday, so a test never depends on which side of midnight it runs. */
const NOW = new Date("2026-08-27T12:00:00Z")

describe("formatDay", () => {
  it("reads day then month, from the table rather than the locale", () => {
    expect(formatDay("2026-08-11")).toBe("11 Aug")
    expect(formatDay("2026-01-01")).toBe("1 Jan")
  })

  it("returns anything that is not a date unchanged", () => {
    expect(formatDay("notes")).toBe("notes")
    expect(formatDay("2026-13-01")).toBe("2026-13-01")
  })
})

describe("daysSince", () => {
  it("counts whole days, with today at zero", () => {
    expect(daysSince("2026-08-27", NOW)).toBe(0)
    expect(daysSince("2026-08-26", NOW)).toBe(1)
    expect(daysSince("2026-08-13", NOW)).toBe(14)
  })

  it("crosses a month boundary", () => {
    expect(daysSince("2026-07-31", NOW)).toBe(27)
  })

  it("is negative for a date that has not arrived", () => {
    expect(daysSince("2026-08-28", NOW)).toBe(-1)
  })

  it("ignores the clock inside the day", () => {
    // The count must not change between breakfast and midnight, or the same
    // log renders two different sentences on two builds an hour apart.
    expect(daysSince("2026-08-26", new Date("2026-08-27T00:00:01Z"))).toBe(1)
    expect(daysSince("2026-08-26", new Date("2026-08-27T23:59:59Z"))).toBe(1)
  })

  it("puts an undateable filename outside every window", () => {
    expect(daysSince("notes", NOW)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe("selectWindow", () => {
  it("counts by date, not by file", () => {
    // The bug this replaced: three files is not three days. All three of these
    // are a fortnight old, and `slice(0, 3)` called them "the last 3 days".
    const all = [day("2026-08-13"), day("2026-08-12"), day("2026-08-11")]

    expect(selectWindow(all, 3, NOW).recent).toBe(0)
  })

  it("includes today and the two days before it", () => {
    const all = [
      day("2026-08-27", 2),
      day("2026-08-26", 1),
      day("2026-08-25", 3),
      day("2026-08-24", 5),
    ]

    const window = selectWindow(all, 3, NOW)

    expect(window.days.map((d) => d.date)).toEqual([
      "2026-08-27",
      "2026-08-26",
      "2026-08-25",
    ])
    expect(window.recent).toBe(6)
    expect(window.since).toBe(0)
  })

  it("excludes a day dated in the future", () => {
    const all = [day("2026-08-28"), day("2026-08-27")]
    const window = selectWindow(all, 3, NOW)

    expect(window.recent).toBe(1)
  })

  it("still renders the newest days when the window is empty", () => {
    // A quiet fortnight costs the page its count, never its content.
    const all = [day("2026-08-13"), day("2026-08-12"), day("2026-08-11")]
    const window = selectWindow(all, 3, NOW)

    expect(window.recent).toBe(0)
    expect(window.since).toBe(14)
    expect(window.days).toHaveLength(3)
  })

  it("has nothing to say about an empty log", () => {
    expect(selectWindow([], 3, NOW)).toEqual({
      days: [],
      recent: 0,
      since: null,
    })
  })
})

describe("the log in content/", () => {
  // Not a snapshot of what is in it — a guard on the format. A file whose
  // headings stopped parsing would render as a day with nothing under it,
  // which reads as a bug on the front page rather than as a quiet week.
  const days = readChangelog()

  it("parses every published day into entries", () => {
    expect(days.length).toBeGreaterThan(0)
    expect(countEntries(days)).toBe(
      days.reduce((total, d) => total + d.entries.length, 0)
    )

    for (const d of days) {
      expect(d.entries.length).toBeGreaterThan(0)
      expect(daysSince(d.date, NOW)).toBeLessThan(Number.POSITIVE_INFINITY)
    }
  })

  it("is newest first", () => {
    const dates = days.map((d) => d.date)
    expect(dates).toEqual([...dates].sort().reverse())
  })
})
