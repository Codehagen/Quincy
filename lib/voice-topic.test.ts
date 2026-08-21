import { describe, expect, it } from "vitest"

import { topicQuery } from "./voice"

/**
 * The query half of `voiceExamples`. Worth its own file because the failure it
 * guards against is silent: a malformed or over-strict query matches nothing,
 * the recency half still returns eight posts, and topical selection quietly
 * stops happening without a single error anywhere.
 */
describe("topicQuery", () => {
  it("asks for any of the terms, never all of them", () => {
    // An angle is a sentence. All-of over a sentence matches nothing, which is
    // exactly the failure that would never announce itself.
    const query = topicQuery("shipped the billing rewrite")
    expect(query).toContain(" or ")
    expect(query.split(" or ")).toEqual(["shipped", "billing", "rewrite"])
  })

  it("has nothing to ask when there is no topic", () => {
    expect(topicQuery("")).toBe("")
    expect(topicQuery("   ")).toBe("")
  })

  it("spends the term budget on words that carry a subject", () => {
    expect(topicQuery("this is what they had for you")).toBe("")
  })

  it("keeps each term once, so one repeated word cannot eat the budget", () => {
    expect(topicQuery("deploy deploy deploy neon")).toBe("deploy or neon")
  })

  it("bounds the number of terms", () => {
    const long = Array.from({ length: 40 }, (_, i) => `term${i}`).join(" ")
    expect(topicQuery(long).split(" or ")).toHaveLength(12)
    expect(topicQuery(long, 3).split(" or ")).toHaveLength(3)
  })

  /**
   * Every term starts with a letter or digit by construction. That is what
   * stops a hook from arriving as a `-` negation or an unbalanced quote —
   * `websearch_to_tsquery` reads both as operators.
   */
  it("cannot emit an operator or a quote from arbitrary text", () => {
    const query = topicQuery(`-drop "the" table; <script> 'quoted' --flag`)
    expect(query).not.toMatch(/["';<>]/)
    for (const term of query.split(" or ")) {
      expect(term).toMatch(/^[a-z0-9]/)
    }
  })

  it("keeps hyphens and apostrophes inside a word", () => {
    expect(topicQuery("open-source doesn't ship")).toBe(
      "open-source or doesn't or ship"
    )
  })

  it("drops fragments too short to discriminate", () => {
    expect(topicQuery("ai is up 10x")).toBe("10x")
  })
})
