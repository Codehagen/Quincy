import { describe, expect, it } from "vitest"

import {
  humanAddition,
  isThinMaterial,
  type CorpusReceipt,
} from "./onboarding"

/**
 * The floor under question four. The real answer that broke first run is the
 * first case, verbatim — it produced a single angle that restated it.
 */
describe("isThinMaterial", () => {
  it("refuses the four-word answer that caused this guard", () => {
    expect(isThinMaterial("Shipped about Quincy")).toBe(true)
  })

  it("refuses whitespace padding", () => {
    expect(isThinMaterial(`Shipped about Quincy${" ".repeat(200)}`)).toBe(true)
  })

  it("accepts a real sentence about what changed", () => {
    expect(
      isThinMaterial(
        "Wiped my own production account to test first run, and found two tables the backup script never dumped."
      )
    ).toBe(false)
  })
})

/**
 * `humanAddition` writes a sentence about a person and offers to put it on
 * their identity page. That is the highest-stakes string first run produces —
 * everything else is Quincy describing itself — so its refusals matter more
 * than its output.
 */
function receipt(titles: string[]): CorpusReceipt {
  return {
    portrait: "A portrait.",
    rules: [],
    stories: titles.map((title, i) => ({
      slug: `story/${i}`,
      title,
      point: "A point.",
    })),
  }
}

describe("humanAddition", () => {
  it("says nothing without a receipt", () => {
    expect(humanAddition(null)).toBeNull()
  })

  it("refuses a single theme, which is a topic rather than a portrait", () => {
    expect(humanAddition(receipt(["Building in public"]))).toBeNull()
  })

  it("refuses stories whose titles are blank", () => {
    expect(humanAddition(receipt(["Building in public", "   "]))).toBeNull()
  })

  it("joins two themes without a comma", () => {
    expect(humanAddition(receipt(["Building in public", "Weekend MVPs"]))).toBe(
      "Your posts keep coming back to Building in public and Weekend MVPs."
    )
  })

  /**
   * The reason the first letter is left alone. A rule that lowercased it would
   * read better here and would rename somebody in the sentence that claims to
   * describe them.
   */
  it("never rewrites a title, so a name in one survives", () => {
    expect(humanAddition(receipt(["Quincy", "Weekend MVPs"]))).toContain(
      "Quincy"
    )
  })

  it("caps at four themes, because five is a list and not a sentence", () => {
    const out = humanAddition(
      receipt(["One", "Two", "Three", "Four", "Five"])
    )
    expect(out).not.toContain("Five")
    expect(out).toBe("Your posts keep coming back to One, Two, Three and Four.")
  })
})
