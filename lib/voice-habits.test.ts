import { describe, expect, it } from "vitest"

import { describeHabits, measureHabits, renderHabits } from "./voice-habits"

/**
 * The arithmetic that replaced a model's estimate. These assert the counting,
 * because the counting is the whole product here — a wrong number stated as
 * fact is worse than the guess it replaced.
 */
describe("measureHabits", () => {
  it("counts a token by posts, not by occurrences", () => {
    // Three ✨ in one post is one post with a ✨ habit, not three.
    const h = measureHabits(["✨ a ✨ b ✨", "one ✨", "plain"])
    // Both end on it, so both count as a close and neither as an open.
    expect(h.emoji).toEqual([{ token: "✨", posts: 2, opens: 0, closes: 2 }])
    expect(h.posts).toBe(3)
  })

  it("separates opening from closing", () => {
    const h = measureHabits([
      "🤯 big claim\nthen the detail",
      "🤯 another one\nmore detail",
      "a normal post ✨",
      "another normal one ✨",
    ])
    const bang = h.emoji.find((e) => e.token === "🤯")!
    const sparkle = h.emoji.find((e) => e.token === "✨")!
    expect(bang).toEqual({ token: "🤯", posts: 2, opens: 2, closes: 0 })
    expect(sparkle).toEqual({ token: "✨", posts: 2, opens: 0, closes: 2 })
  })

  it("only counts a close when the token is genuinely last", () => {
    // "✨ shipped" is not a sign-off, and counting it as one is how "closes
    // most posts with ✨" gets manufactured out of nothing. The inverse matters
    // just as much: on a one-line post the sign-off must not also count as an
    // opener, which is what reported "✨ opens 32%" of the real corpus.
    const h = measureHabits(["✨ shipped the thing", "shipped the thing ✨"])
    expect(h.emoji[0]).toEqual({ token: "✨", posts: 2, opens: 1, closes: 1 })
  })

  it("ignores trailing whitespace when deciding what is last", () => {
    const h = measureHabits(["done ✨   \n\n", "also done ✨"])
    expect(h.emoji[0].closes).toBe(2)
  })

  it("counts posts with no emoji, which is the habit a mandate cannot express", () => {
    const h = measureHabits(["plain one", "plain two", "with ✨"])
    expect(h.noEmoji).toBe(2)
  })

  it("drops a token seen once, so a stray emoji cannot become a rule", () => {
    const h = measureHabits(["a 🎉", "b ✨", "c ✨"])
    expect(h.emoji.map((e) => e.token)).toEqual(["✨"])
  })

  /**
   * ✨ (U+2728) and 🔗 (U+1F517) fall outside the emoji range people write by
   * hand, and ✨ was the most-used token in the corpus this was built against.
   * A hand-rolled range would have missed the single most important habit.
   */
  it("sees emoji outside the obvious block", () => {
    const h = measureHabits(["a ✨", "b ✨", "c ✅", "d ✅"])
    expect(h.emoji.map((e) => e.token).sort()).toEqual(["✅", "✨"])
  })

  it("treats a variation-selector emoji as the same token", () => {
    const h = measureHabits(["a ✨️", "b ✨"])
    expect(h.emoji).toHaveLength(1)
    expect(h.emoji[0].posts).toBe(2)
  })

  it("counts a standalone lowercase i and not I'm or i.e.", () => {
    expect(measureHabits(["i shipped it", "so i shipped"]).lowercaseI).toBe(2)
    expect(measureHabits(["I'm shipping", "invisible things"]).lowercaseI).toBe(
      0
    )
  })

  it("counts the other checkable claims", () => {
    const h = measureHabits([
      "#launch day",
      "see https://example.com",
      "anybody else hit this?",
      "◆ one\n◆ two",
    ])
    expect(h.hashtags).toBe(1)
    expect(h.links).toBe(1)
    expect(h.questions).toBe(1)
    expect(h.bullets).toBe(1)
  })

  it("answers an empty corpus without dividing by zero", () => {
    const h = measureHabits([])
    expect(h.posts).toBe(0)
    expect(h.emoji).toEqual([])
    expect(h.medianChars).toBe(0)
    expect(describeHabits(h)).toBe("")
    expect(renderHabits(h)).toBe("")
  })
})

/**
 * The rendered blocks. Only the load-bearing sentences are asserted — the rest
 * is prose and testing it would freeze it.
 */
describe("renderHabits", () => {
  const corpus = [
    ...Array.from({ length: 5 }, (_, i) => `claim ${i} ✨`),
    ...Array.from({ length: 15 }, (_, i) => `plain post ${i}`),
  ]

  it("states the count and the share", () => {
    expect(renderHabits(measureHabits(corpus))).toContain("5 of 20 (25%)")
  })

  it("says outright that the count beats a rule that disagrees", () => {
    // The whole point. A rule is a sentence a model wrote; this is arithmetic,
    // and something has to say which wins when they conflict.
    expect(renderHabits(measureHabits(corpus))).toContain("outrank any rule")
  })

  it("reports a habit they do not have as 'never'", () => {
    // A finding, not a gap: "hashtags: never" is what stops a draft growing
    // one. Silence would read as "unknown".
    expect(renderHabits(measureHabits(corpus))).toContain("hashtags: never")
  })
})

describe("describeHabits", () => {
  it("forbids the overstatement that caused this", () => {
    // "Close most posts with a ✨ sparkle emoji" — measured at 8%.
    const out = describeHabits(measureHabits(["a ✨", "b", "c", "d"]))
    expect(out).toContain("only available above 50%")
    expect(out).toContain("may not contradict them")
  })
})
