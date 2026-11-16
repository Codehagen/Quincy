import { describe, expect, it } from "vitest"

import { RULE_CAP } from "./brain"
import {
  classifyEdit,
  clearClass,
  countInWindow,
  EDIT_THRESHOLD,
  EDIT_WINDOW_MS,
  normaliseRule,
  recordEdits,
  ruleOfferFor,
  RULE_FOR_CLASS,
  type EditLedger,
} from "./edit-classes"

/**
 * The whole of item 3e that can be tested without a database: what counts as an
 * edit, and when three of them become a question. The wiring — reading the
 * ledger page, writing a rule — is exercised the way the repo exercises every
 * other database path, through a verify script against real rows.
 */

describe("classifyEdit", () => {
  it("finds nothing in identical text", () => {
    expect(classifyEdit("Shipped it today.", "Shipped it today.")).toEqual([])
  })

  it("finds nothing when only the surrounding whitespace moved", () => {
    expect(classifyEdit("Shipped it.\n", "  Shipped it.  ")).toEqual([])
  })

  it("sees an emoji go", () => {
    expect(classifyEdit("Shipped it 🚀", "Shipped it")).toContain(
      "emoji-removed"
    )
  })

  it("sees an emoji arrive", () => {
    expect(classifyEdit("Shipped it", "Shipped it 🚀")).toContain("emoji-added")
  })

  it("sees a link go", () => {
    expect(
      classifyEdit("Read it https://example.com/post", "Read it")
    ).toContain("link-removed")
  })

  it("sees a link arrive", () => {
    expect(
      classifyEdit("Read it", "Read it https://example.com/post")
    ).toContain("link-added")
  })

  it("sees hashtags go", () => {
    expect(classifyEdit("Shipped #buildinpublic", "Shipped")).toContain(
      "hashtag-removed"
    )
  })

  it("sees a line cut", () => {
    const before = "So here is the thing.\n\nI shipped it.\n\nIt worked."
    const after = "I shipped it.\n\nIt worked."
    expect(classifyEdit(before, after)).toContain("line-cut")
  })

  it("does not call a rewritten line a cut", () => {
    const before = "I shipped it.\n\nIt worked."
    const after = "I shipped it today.\n\nIt worked."
    expect(classifyEdit(before, after)).not.toContain("line-cut")
  })

  it("sees a post cut by more than a quarter", () => {
    expect(classifyEdit("a".repeat(100), "a".repeat(70))).toContain("shortened")
  })

  it("does not call a trim a shortening", () => {
    expect(classifyEdit("a".repeat(100), "a".repeat(90))).not.toContain(
      "shortened"
    )
  })

  it("sees a post grown by more than a quarter", () => {
    expect(classifyEdit("a".repeat(100), "a".repeat(140))).toContain(
      "lengthened"
    )
  })

  it("sees an exclamation mark go", () => {
    expect(classifyEdit("It shipped!", "It shipped.")).toContain(
      "exclamation-removed"
    )
  })

  it("sees a number moved onto its own line", () => {
    const before = "I cut the build to 41 seconds."
    const after = "I cut the build.\n\n41\n\nseconds, from four minutes."
    expect(classifyEdit(before, after)).toContain("numbers-on-own-line")
  })

  it("does not call a new number a move", () => {
    const before = "I cut the build."
    const after = "I cut the build.\n\n41\n\nseconds."
    expect(classifyEdit(before, after)).not.toContain("numbers-on-own-line")
  })

  it("sees they become I", () => {
    const before = "They shipped it and they told nobody."
    const after = "I shipped it and I told nobody."
    expect(classifyEdit(before, after)).toContain("first-person")
  })

  it("returns every class that applies, not the first", () => {
    const classes = classifyEdit(
      "So, here is a thought.\n\nThey shipped it 🚀 #buildinpublic!",
      "I shipped it."
    )
    expect(classes).toEqual(
      expect.arrayContaining([
        "emoji-removed",
        "hashtag-removed",
        "line-cut",
        "shortened",
        "exclamation-removed",
        "first-person",
      ])
    )
  })
})

describe("normaliseRule", () => {
  it("ignores case and punctuation", () => {
    expect(normaliseRule("No emoji.")).toBe(normaliseRule("no emoji"))
  })
})

const NOW = new Date("2026-08-27T10:00:00Z")
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

/** A ledger where one class has fired `times` times, all of them today. */
function ledgerWith(times: number): EditLedger {
  let ledger: EditLedger = {}
  for (let i = 0; i < times; i++) {
    ledger = recordEdits(ledger, ["emoji-removed"], NOW)
  }
  return ledger
}

describe("recordEdits", () => {
  it("counts inside the window", () => {
    expect(countInWindow(ledgerWith(2), "emoji-removed", NOW)).toBe(2)
  })

  it("forgets a stamp older than the window", () => {
    const stale: EditLedger = {
      "emoji-removed": {
        count: 2,
        lastAt: daysAgo(40),
        at: [daysAgo(45), daysAgo(40)],
      },
    }
    expect(countInWindow(stale, "emoji-removed", NOW)).toBe(0)

    const next = recordEdits(stale, ["emoji-removed"], NOW)
    expect(next["emoji-removed"]?.count).toBe(1)
  })

  it("keeps at most the threshold's worth of stamps", () => {
    const ledger = ledgerWith(6)
    expect(ledger["emoji-removed"]?.at).toHaveLength(EDIT_THRESHOLD)
  })

  it("leaves the ledger alone when nothing changed", () => {
    const ledger = ledgerWith(1)
    expect(recordEdits(ledger, [], NOW)).toBe(ledger)
  })

  it("counts a stamp on the edge of the window", () => {
    const edge: EditLedger = {
      "emoji-removed": {
        count: 1,
        lastAt: new Date(NOW.getTime() - EDIT_WINDOW_MS).toISOString(),
        at: [new Date(NOW.getTime() - EDIT_WINDOW_MS).toISOString()],
      },
    }
    expect(countInWindow(edge, "emoji-removed", NOW)).toBe(1)
  })
})

describe("ruleOfferFor", () => {
  const base = {
    targetRules: [] as string[],
    allRules: [] as string[],
    cap: RULE_CAP,
    now: NOW,
  }

  it("says nothing below three in thirty days", () => {
    expect(ruleOfferFor({ ...base, ledger: ledgerWith(2) })).toBeNull()
  })

  it("offers at three", () => {
    expect(ruleOfferFor({ ...base, ledger: ledgerWith(3) })).toEqual({
      class: "emoji-removed",
      text: RULE_FOR_CLASS["emoji-removed"],
    })
  })

  it("says nothing when the three are spread beyond the window", () => {
    const spread: EditLedger = {
      "emoji-removed": {
        count: 3,
        lastAt: NOW.toISOString(),
        at: [daysAgo(60), daysAgo(45), NOW.toISOString()],
      },
    }
    expect(ruleOfferFor({ ...base, ledger: spread })).toBeNull()
  })

  it("refuses at the rule cap rather than proposing a swap", () => {
    expect(
      ruleOfferFor({
        ...base,
        ledger: ledgerWith(3),
        targetRules: Array.from({ length: RULE_CAP }, (_, i) => `rule ${i}`),
      })
    ).toBeNull()
  })

  it("never offers a rule the voice already states, whatever the wording", () => {
    expect(
      ruleOfferFor({
        ...base,
        ledger: ledgerWith(3),
        allRules: ["no emoji"],
      })
    ).toBeNull()
  })

  it("checks every voice page, not only the one it would write to", () => {
    expect(
      ruleOfferFor({
        ...base,
        ledger: ledgerWith(3),
        targetRules: [],
        // The compiled page already says it.
        allRules: ["Never uses emoji", "No emoji."],
      })
    ).toBeNull()
  })

  it("prefers the class this approval produced", () => {
    let ledger: EditLedger = {}
    for (let i = 0; i < EDIT_THRESHOLD; i++) {
      ledger = recordEdits(ledger, ["emoji-removed", "first-person"], NOW)
    }

    expect(
      ruleOfferFor({ ...base, ledger, prefer: ["first-person"] })?.class
    ).toBe("first-person")
  })

  it("stops offering once the class is cleared", () => {
    const cleared = clearClass(ledgerWith(3), "emoji-removed")
    expect(ruleOfferFor({ ...base, ledger: cleared })).toBeNull()
  })
})
