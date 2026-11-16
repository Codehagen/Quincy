import { describe, expect, it } from "vitest"

import { budgetItems, capStories, storySlug } from "./voice"

/**
 * compileVoice itself is exercised by scripts/verify-corpus-x.ts against a
 * real database with an injected extractor, following the repo's split: unit
 * tests cover the pure parts, verify scripts cover the wiring.
 *
 * That split is why STORY_CAP is pinned through `capStories` rather than
 * through compileVoice: it is the pure part, exported the same way
 * `budgetItems` is, and it is the actual function the loop in compileVoice
 * calls — not a duplicate of its logic.
 */

describe("storySlug", () => {
  it("lowercases and hyphenates", () => {
    expect(storySlug("Shipping Beats Planning")).toBe(
      "story/x-shipping-beats-planning"
    )
  })

  it("strips punctuation rather than encoding it", () => {
    expect(storySlug("Don't ship broken things!")).toBe(
      "story/x-don-t-ship-broken-things"
    )
  })

  it("never produces a trailing hyphen", () => {
    expect(storySlug("Trailing! ")).toBe("story/x-trailing")
  })

  it("caps length so a paragraph-as-title cannot become a slug", () => {
    const slug = storySlug("a".repeat(200))
    expect(slug.length).toBeLessThanOrEqual("story/x-".length + 60)
  })

  it("falls back rather than emitting an empty leaf", () => {
    expect(storySlug("!!!")).toBe("story/x-untitled")
  })
})

describe("budgetItems", () => {
  it("slices a long body to maxPost", () => {
    const [item] = budgetItems(
      [{ url: "https://x.com/1", postedAt: null, body: "a".repeat(100) }],
      10,
      1_000
    )
    expect(item.body).toHaveLength(10)
  })

  it("stops accumulating before exceeding maxTotal", () => {
    const items = [
      { url: "https://x.com/1", postedAt: null, body: "a".repeat(10) },
      { url: "https://x.com/2", postedAt: null, body: "b".repeat(10) },
      { url: "https://x.com/3", postedAt: null, body: "c".repeat(10) },
    ]
    const kept = budgetItems(items, 100, 15)
    expect(kept).toHaveLength(1)
    expect(kept[0].url).toBe("https://x.com/1")
  })

  it("preserves order", () => {
    const items = [
      { url: "https://x.com/1", postedAt: null, body: "one" },
      { url: "https://x.com/2", postedAt: null, body: "two" },
      { url: "https://x.com/3", postedAt: null, body: "three" },
    ]
    const kept = budgetItems(items, 100, 1_000)
    expect(kept.map((i) => i.url)).toEqual([
      "https://x.com/1",
      "https://x.com/2",
      "https://x.com/3",
    ])
  })

  it("returns empty for empty input", () => {
    expect(budgetItems([], 100, 1_000)).toEqual([])
  })
})

describe("capStories", () => {
  const STORY_CAP = 12

  it("keeps at most STORY_CAP stories, preserving order", () => {
    const stories = Array.from({ length: STORY_CAP + 5 }, (_, i) => ({
      title: `story-${i}`,
    }))
    const kept = capStories(stories)
    expect(kept).toHaveLength(STORY_CAP)
    expect(kept.map((s) => s.title)).toEqual(
      stories.slice(0, STORY_CAP).map((s) => s.title)
    )
  })

  it("passes through a list under the cap unchanged", () => {
    const stories = Array.from({ length: 3 }, (_, i) => ({
      title: `story-${i}`,
    }))
    expect(capStories(stories)).toEqual(stories)
  })
})
