import { describe, expect, it } from "vitest"

import {
  boundLedger,
  classifyCapture,
  dedupeLines,
  formatLedgerLine,
  isDuplicateLine,
  isLedgerSlug,
  jaccard,
  ledgerDayOf,
  ledgerDays,
  LEDGER_RENDER_CAP,
  mergeLedgerPages,
  normaliseLine,
  parseLedger,
  renderLedgerSection,
  type LedgerEntry,
  type LedgerLine,
} from "./memory-ledger"
import { renderBrain, type BrainPage } from "./brain"

/**
 * The ledger's arithmetic, with no database in it.
 *
 * `appendLedger` is a read of a window, a comparison and a write, and only the
 * comparison decides anything. Everything below is that comparison: the rule
 * that refuses a line, the rule that types one, and the two bounds that stop a
 * talkative week from deciding what a compile costs. The end-to-end loop is
 * scripts/verify-heartbeat.ts, which has a real user and real pages.
 */

function page(day: string, lines: LedgerLine[]): BrainPage {
  return {
    id: `bp-${day}`,
    userId: "u1",
    slug: `memory/${day}`,
    kind: "memory",
    title: `Ledger — ${day}`,
    body: lines.map(formatLedgerLine).join("\n"),
    data: {},
    provenance: "inferred",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/** What `appendLedger` asks of the window it just read. */
function accepted(existing: LedgerLine[], line: LedgerLine): boolean {
  return !existing.some((seen) => isDuplicateLine(seen, line))
}

describe("the line grammar", () => {
  it("round-trips a typed line", () => {
    expect(formatLedgerLine({ type: "preference", text: "No emojis." })).toBe(
      "- preference: No emojis."
    )
    expect(parseLedger("- preference: No emojis.")).toEqual([
      { type: "preference", text: "No emojis." },
    ])
  })

  it("reads every type, and ignores prose on the same page", () => {
    const body = [
      "Some note the user typed by hand.",
      "- fact: PR 282 merged at 14:24.",
      "- preference: Always write in English.",
      "- correction: Never open with an emoji.",
      "- question: What made you merge 282?",
      "- notatype: not a ledger line",
      "",
    ].join("\n")

    expect(parseLedger(body).map((l) => l.type)).toEqual([
      "fact",
      "preference",
      "correction",
      "question",
    ])
  })

  it("knows a ledger slug from any other memory page", () => {
    expect(isLedgerSlug("memory/2026-08-27")).toBe(true)
    expect(isLedgerSlug("memory/inbox")).toBe(false)
    expect(isLedgerSlug("memory/working-style")).toBe(false)
    // Passes the pattern, is not a date. February has 28 days in 2026.
    expect(ledgerDayOf("memory/2026-02-31")).toBeNull()
  })
})

describe("the dedupe rule", () => {
  const onPage: LedgerLine[] = [
    { type: "preference", text: "I never want emojis in a LinkedIn post." },
  ]

  it("refuses an exact repeat", () => {
    expect(
      accepted(onPage, {
        type: "preference",
        text: "I never want emojis in a LinkedIn post.",
      })
    ).toBe(false)
  })

  it("refuses a repeat that differs only in case and punctuation", () => {
    expect(
      accepted(onPage, {
        type: "preference",
        text: "i never want emojis in a linkedin post",
      })
    ).toBe(false)
  })

  it("refuses a near-duplicate by word overlap", () => {
    // Neither string contains the other: "want" is gone and "any" is new, so
    // this is refused by Jaccard alone. 7 shared words of 9 = 0.78... — close,
    // and the two dropped articles are what carry it over.
    expect(
      accepted(onPage, {
        type: "preference",
        text: "I never want any emojis in a LinkedIn post!",
      })
    ).toBe(false)
  })

  it("refuses a line that contains one already written", () => {
    expect(
      accepted(onPage, {
        type: "preference",
        text: "Reminder: I never want emojis in a LinkedIn post, please.",
      })
    ).toBe(false)
  })

  it("accepts the same words under a different type", () => {
    // The safety valve. A correction may repeat a preference word for word —
    // that is what overruling one looks like — and merging the two would drop
    // the line that is supposed to win.
    expect(
      accepted(onPage, {
        type: "correction",
        text: "I never want emojis in a LinkedIn post.",
      })
    ).toBe(true)
  })

  it("accepts a second thought that flips the meaning", () => {
    expect(
      accepted(onPage, {
        type: "preference",
        text: "I want one emoji at the end of an X post.",
      })
    ).toBe(true)
  })

  it("scores an empty side as nothing rather than everything", () => {
    expect(jaccard([], ["a"])).toBe(0)
    expect(normaliseLine("!!! ???")).toBe("")
    expect(
      accepted([{ type: "fact", text: "..." }], { type: "fact", text: "!!" })
    ).toBe(true)
  })

  it("keeps the newest of a run and counts what it dropped", () => {
    const { lines, dropped } = dedupeLines<LedgerEntry>([
      {
        day: "2026-08-27",
        type: "preference",
        text: "Always write in English",
      },
      {
        day: "2026-08-26",
        type: "preference",
        text: "always write in english.",
      },
      { day: "2026-08-25", type: "fact", text: "PR 282 merged at 14:24" },
    ])

    expect(dropped).toBe(1)
    expect(lines.map((l) => l.day)).toEqual(["2026-08-27", "2026-08-25"])
  })
})

describe("the dedupe window", () => {
  const line: LedgerLine = {
    type: "preference",
    text: "I never want emojis in a LinkedIn post.",
  }
  const now = new Date("2026-08-27T09:00:00Z")

  it("reads today and the seven days before it", () => {
    const days = ledgerDays(now, "UTC", 7)

    expect(days).toHaveLength(8)
    expect(days[0]).toBe("2026-08-27")
    expect(days[7]).toBe("2026-08-20")
  })

  it("refuses a duplicate written seven days ago", () => {
    const days = ledgerDays(now, "UTC", 7)
    const pages = [page("2026-08-20", [line])]
    const seen = pages
      .filter((p) => days.includes(ledgerDayOf(p.slug)!))
      .flatMap((p) => parseLedger(p.body))

    expect(accepted(seen, line)).toBe(false)
  })

  it("accepts a duplicate written eight days ago", () => {
    // The window is what makes the ledger forget. A preference stated a week
    // ago and again today is one line; stated in July and again today it is
    // the user saying it still holds, and that is worth a row.
    const days = ledgerDays(now, "UTC", 7)
    const pages = [page("2026-08-19", [line])]
    const seen = pages
      .filter((p) => days.includes(ledgerDayOf(p.slug)!))
      .flatMap((p) => parseLedger(p.body))

    expect(seen).toEqual([])
    expect(accepted(seen, line)).toBe(true)
  })

  it("reads the day boundary in the user's zone, not the server's", () => {
    // 23:30 UTC on the 27th is 01:30 on the 28th in Oslo. A ledger keyed on
    // the server's day would file a late-evening turn under yesterday.
    const late = new Date("2026-08-27T23:30:00Z")

    expect(ledgerDays(late, "Europe/Oslo", 0)).toEqual(["2026-08-28"])
    expect(ledgerDays(late, "UTC", 0)).toEqual(["2026-08-27"])
  })
})

describe("classifyCapture", () => {
  const samples: [string, "preference" | "fact"][] = [
    ["Always write my posts in English.", "preference"],
    ["I never want emojis in a LinkedIn post.", "preference"],
    ["Don't use em dashes in a draft.", "preference"],
    ["Keep the posts under 200 characters.", "preference"],
    ["I prefer the number on its own line.", "preference"],
    ["Ikke bruk emojis i innleggene mine.", "preference"],
    ["We sold Docdir to Broker AS in 2026.", "fact"],
    ["The migration took four hours and broke nothing.", "fact"],
    ["PR 282 merged at 14:24 today.", "fact"],
    ["Quincy had ten merges in five days.", "fact"],
  ]

  for (const [text, expected] of samples) {
    it(`reads "${text}" as a ${expected}`, () => {
      expect(classifyCapture(text)).toBe(expected)
    })
  }

  it("falls back to fact rather than guessing", () => {
    // What captureTurn did before the ledger existed. An unrecognised turn
    // keeps that behaviour instead of being labelled on a hunch.
    expect(classifyCapture("Can you make the riffs better?")).toBe("fact")
    expect(classifyCapture("")).toBe("fact")
  })
})

describe("merging the week", () => {
  const days = ledgerDays(new Date("2026-08-27T09:00:00Z"), "UTC", 6)

  it("reads newest day first, and newest line first within a day", () => {
    const merged = mergeLedgerPages(
      [
        page("2026-08-25", [
          { type: "fact", text: "Monday first" },
          { type: "fact", text: "Monday second" },
        ]),
        page("2026-08-27", [{ type: "fact", text: "Thursday only" }]),
      ],
      days
    )

    expect(merged.lines.map((l) => l.text)).toEqual([
      "Thursday only",
      "Monday second",
      "Monday first",
    ])
  })

  it("merges a preference repeated on three days into one line", () => {
    const said = {
      type: "preference" as const,
      text: "Always write in English",
    }
    const merged = mergeLedgerPages(
      [
        page("2026-08-25", [said]),
        page("2026-08-26", [{ ...said, text: "always write in english." }]),
        page("2026-08-27", [said]),
      ],
      days
    )

    expect(merged.lines).toHaveLength(1)
    expect(merged.dropped).toBe(2)
    // The newest occurrence survives, so the day stamp says when it was last
    // said rather than when it was first said.
    expect(merged.lines[0].day).toBe("2026-08-27")
  })

  it("ignores a page outside the window and any page that is not a ledger", () => {
    const notes: BrainPage = {
      ...page("2026-08-27", [{ type: "fact", text: "on a ledger page" }]),
      slug: "memory/working-style",
    }

    const merged = mergeLedgerPages(
      [notes, page("2026-08-01", [{ type: "fact", text: "last month" }])],
      days
    )

    expect(merged.lines).toEqual([])
  })
})

describe("the bounds", () => {
  function manyLines(count: number, prefix: string): LedgerEntry[] {
    return Array.from({ length: count }, (_, i) => ({
      day: "2026-08-27",
      type: "fact" as const,
      // Distinct enough that the dedupe rule never merges two of them.
      text: `${prefix} ${i} ${"x".repeat(60)}`,
    }))
  }

  it("cuts the compile input at the byte ceiling, newest first", () => {
    const lines = manyLines(400, "line")
    const bounded = boundLedger(lines)

    expect(bounded.lines.length).toBeLessThan(lines.length)
    expect(bounded.cut).toBe(lines.length - bounded.lines.length)
    // Newest first: what survives is the head of the list, in order.
    expect(bounded.lines[0]).toBe(lines[0])

    const bytes = bounded.lines.reduce(
      (sum, line) => sum + Buffer.byteLength(`${formatLedgerLine(line)}\n`),
      0
    )
    expect(bytes).toBeLessThanOrEqual(12 * 1024)
  })

  it("keeps everything when the week fits", () => {
    const lines = manyLines(5, "line")

    expect(boundLedger(lines)).toEqual({ lines, cut: 0 })
  })

  it("caps the rendered section and says how much it held back", () => {
    const now = new Date("2026-08-27T09:00:00Z")
    const pages = [page("2026-08-27", manyLines(LEDGER_RENDER_CAP + 5, "seen"))]

    const rendered = renderLedgerSection(pages, { now, timezone: "UTC" })
    const shown = rendered.split("\n").filter((l) => l.startsWith("- fact:"))

    expect(shown).toHaveLength(LEDGER_RENDER_CAP)
    expect(rendered).toContain("5 older line(s) not shown.")
  })
})

describe("renderLedgerSection", () => {
  const now = new Date("2026-08-27T09:00:00Z")

  it("renders nothing when there is no ledger", () => {
    expect(renderLedgerSection([], { now })).toBe("")
    expect(
      renderLedgerSection([{ ...page("2026-08-27", []), body: "" }], { now })
    ).toBe("")
  })

  it("renders the last seven days, typed and newest first", () => {
    const rendered = renderLedgerSection(
      [
        page("2026-08-20", [{ type: "fact", text: "outside the window" }]),
        page("2026-08-21", [{ type: "fact", text: "the oldest day kept" }]),
        page("2026-08-27", [
          { type: "correction", text: "Never open with an emoji." },
        ]),
      ],
      { now, timezone: "UTC" }
    )

    expect(rendered).toContain("## Lately")
    expect(rendered).toContain("- correction: Never open with an emoji.")
    expect(rendered).toContain("- fact: the oldest day kept")
    expect(rendered).not.toContain("outside the window")
    expect(rendered.indexOf("Never open")).toBeLessThan(
      rendered.indexOf("the oldest day kept")
    )
  })

  it("keeps a page dated ahead of the caller's clock", () => {
    // A caller with no zone reads the window in UTC. A user in Oslo is already
    // on the 28th at 23:30 UTC on the 27th, and today's page is the one line
    // this section exists to show.
    const rendered = renderLedgerSection(
      [page("2026-08-28", [{ type: "fact", text: "written after midnight" }])],
      { now }
    )

    expect(rendered).toContain("written after midnight")
  })
})

/**
 * The section as `renderBrain` places it, which is the whole reason the ledger
 * is worth writing: the chat sees this morning's line without waiting for
 * Sunday's compile.
 *
 * This also exercises the cycle between the two modules — lib/brain.ts calls
 * into the ledger to render, and the ledger calls back into lib/brain.ts to
 * write — in the direction a prompt actually takes.
 */
describe("renderBrain", () => {
  const now = new Date("2026-08-27T09:00:00Z")

  const compiled: BrainPage = {
    ...page("2026-08-27", []),
    id: "bp-working-style",
    slug: "memory/working-style",
    title: "Working style",
    body: "- Ships on Fridays.",
  }

  const today = page("2026-08-27", [
    { type: "correction", text: "Never open with an emoji." },
  ])

  it("renders the ledger after the compiled memory, not inside it", () => {
    const rendered = renderBrain([compiled, today], {
      ledger: { now, timezone: "UTC" },
    })

    expect(rendered).toContain("## Notes")
    expect(rendered).toContain("- Ships on Fridays.")
    expect(rendered.indexOf("## Notes")).toBeLessThan(
      rendered.indexOf("## Lately")
    )
    expect(rendered).toContain("- correction: Never open with an emoji.")
  })

  it("keeps ledger pages out of the notes section", () => {
    // Without the filter every day of the year lands in "## Notes" as an
    // undated blob, which is both the wrong order and the wrong framing.
    const notes = renderBrain([today], {
      ledger: { now, timezone: "UTC" },
    }).split("## Lately")[0]

    expect(notes).not.toContain("correction:")
    expect(notes.trim()).toBe("")
  })
})
