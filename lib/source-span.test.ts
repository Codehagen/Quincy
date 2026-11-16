import { describe, expect, it } from "vitest"

import { MAX_LINE_CHARS, markFor, resolveQuote, settleLine } from "./source-span"

/**
 * The quote → span resolver behind the Marked-up view.
 *
 * Every case here is about the same promise: a mark lands on the words the
 * idea came from, or there is no mark. A wrong span underlines a sentence the
 * idea did not come from, in the person's own words, so "not found" is always
 * the answer when the quote does not match as written.
 */

const slice = (material: string, quote: string, near?: number) => {
  const span = resolveQuote(material, quote, { near })
  return span ? material.slice(span.start, span.end) : undefined
}

describe("resolveQuote", () => {
  it("finds an exact quote", () => {
    const material = "So, the deploy thing. We cut the build from nine minutes to two. Nobody noticed."
    const span = resolveQuote(material, "We cut the build from nine minutes to two.")
    expect(span).toEqual({ start: 22, end: 64 })
    expect(material.slice(span!.start, span!.end)).toBe("We cut the build from nine minutes to two.")
  })

  it("forgives whitespace: runs, tabs and a dropped line break", () => {
    const material = "We cut the build\nfrom nine   minutes to two.\n\nNobody noticed."
    expect(slice(material, "We cut the build from nine minutes to two.")).toBe(
      "We cut the build\nfrom nine   minutes to two."
    )
    expect(slice(material, "  two. Nobody noticed.  ")).toBe("two.\n\nNobody noticed.")
  })

  it("forgives curly against straight quotes, both ways", () => {
    const curly = "I said “ship it” and it’s been fine since."
    expect(slice(curly, `I said "ship it" and it's been fine`)).toBe(
      "I said “ship it” and it’s been fine"
    )

    const straight = `I said "ship it" and it's been fine since.`
    expect(slice(straight, "I said “ship it” and it’s been fine")).toBe(
      `I said "ship it" and it's been fine`
    )
  })

  it("forgives dashes, the ellipsis character and case", () => {
    const material = "It broke twice — once at 3am… then never again."
    expect(slice(material, "it broke twice - once at 3am... then never")).toBe(
      "It broke twice — once at 3am… then never"
    )
  })

  it("strips quote marks and a cut-short ellipsis around the whole quote", () => {
    const material = "The point is that the queue was never the bottleneck. It was the lock."
    expect(slice(material, "“the queue was never the bottleneck…”")).toBe(
      "the queue was never the bottleneck"
    )
    expect(slice(material, "...the queue was never the bottleneck.")).toBe(
      "the queue was never the bottleneck."
    )
  })

  it("returns undefined when the quote is not in the material", () => {
    const material = "We cut the build from nine minutes to two."
    expect(resolveQuote(material, "We cut the build from ten minutes to two.")).toBeUndefined()
    // A paraphrase is not a quote.
    expect(resolveQuote(material, "The build got four times faster.")).toBeUndefined()
    // An ellipsis in the middle means words were dropped; not forgiven.
    expect(resolveQuote(material, "We cut the build ... to two.")).toBeUndefined()
  })

  it("returns undefined for an empty or too-short quote rather than matching by accident", () => {
    const material = "We did the thing. We did it again."
    expect(resolveQuote(material, "")).toBeUndefined()
    expect(resolveQuote(material, null)).toBeUndefined()
    expect(resolveQuote(material, undefined)).toBeUndefined()
    expect(resolveQuote(material, "   ")).toBeUndefined()
    expect(resolveQuote(material, "We did")).toBeUndefined()
    expect(resolveQuote("", "We did the thing.")).toBeUndefined()
  })

  it("takes the first of several occurrences", () => {
    const material = "Ship small. Then wait. Ship small. Then measure."
    expect(resolveQuote(material, "Ship small.")).toEqual({ start: 0, end: 11 })
  })

  it("takes the occurrence closest to `near` when one is given", () => {
    const material = "Ship small. Then wait. Ship small. Then measure."
    expect(resolveQuote(material, "Ship small.", { near: 30 })).toEqual({ start: 23, end: 34 })
    expect(resolveQuote(material, "Ship small.", { near: 5 })).toEqual({ start: 0, end: 11 })
    // A tie goes to the earlier one.
    expect(resolveQuote(material, "Ship small.", { near: 11.5 })).toEqual({ start: 0, end: 11 })
  })

  it("reports offsets in the original string past astral characters", () => {
    const material = "Launch day \u{1F680} went fine. Then the bill came."
    expect(slice(material, "went fine. Then the bill came.")).toBe("went fine. Then the bill came.")
    expect(slice(material, "Launch day \u{1F680}")).toBe("Launch day \u{1F680}")
  })
})

describe("settleLine", () => {
  it("trims, and empties what is absent or too long to be a quote", () => {
    expect(settleLine("  We cut the build.  ")).toBe("We cut the build.")
    expect(settleLine(undefined)).toBe("")
    expect(settleLine(null)).toBe("")
    expect(settleLine("x".repeat(MAX_LINE_CHARS))).toBe("x".repeat(MAX_LINE_CHARS))
    expect(settleLine("x".repeat(MAX_LINE_CHARS + 1))).toBe("")
  })
})

describe("markFor (old rows and missing lines)", () => {
  const scrap = "So, the deploy thing. We cut the build from nine minutes to two."

  it("gives no mark for an angle written before the line existed", () => {
    // A row from before the column: the field is absent, null, or the default "".
    expect(markFor(scrap, undefined)).toBeUndefined()
    expect(markFor(scrap, null)).toBeUndefined()
    expect(markFor(scrap, "")).toBeUndefined()
  })

  it("gives no mark when the stored line no longer matches the scrap", () => {
    expect(markFor(scrap, "We cut the deploy from nine minutes to two.")).toBeUndefined()
  })

  it("gives the line and its span when it matches", () => {
    expect(markFor(scrap, " We cut the build from nine minutes to two. ")).toEqual({
      line: "We cut the build from nine minutes to two.",
      span: { start: 22, end: 64 },
    })
  })
})
