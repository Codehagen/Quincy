import { describe, expect, it } from "vitest"

import {
  coveredThemes,
  gapQuestion,
  MIN_MENTIONS,
  rankGaps,
  STORY_GAP_CAP,
  themePattern,
  THEMES,
} from "./story-gaps"

/**
 * Only `storyGaps` touches the database. Everything that decides what the list
 * says is pure and is tested here, matching how the rest of the repo tests
 * internals (see lib/heartbeat.test.ts).
 */

const theme = (id: string) => {
  const found = THEMES.find((t) => t.id === id)
  if (!found) throw new Error(`no theme '${id}' in the table`)
  return found
}

describe("gapQuestion", () => {
  it("is the sentence plan 027 asked for, verbatim", () => {
    expect(gapQuestion(theme("pricing"), 7)).toBe(
      "You mention pricing in 7 posts and have no story about it. What happened the last time you changed a price?"
    )
  })

  it("says post rather than posts for one", () => {
    // A count is evidence, and evidence that says "1 posts" reads as generated
    // rather than as read — the same tell `renderPolicy` pluralises for.
    expect(gapQuestion(theme("churn"), 1)).toContain("in 1 post and")
  })
})

describe("themePattern", () => {
  it("matches on word boundaries, so price does not match priceless", () => {
    const pattern = new RegExp(themePattern(theme("pricing"), "\\b"), "i")

    expect(pattern.test("we changed the Price last week")).toBe(true)
    expect(pattern.test("a priceless afternoon")).toBe(false)
  })

  it("spells the boundary Postgres's way by default", () => {
    // `\y` is Postgres's word boundary and JavaScript has no such escape. One
    // function builds both so the two cannot drift apart.
    expect(themePattern(theme("churn"))).toContain("\\y")
  })
})

describe("coveredThemes", () => {
  it("excludes a theme a story page already carries", () => {
    const covered = coveredThemes([
      { title: "How I priced Quincy", data: { theme: "Pricing" } },
    ])

    expect(covered.has("pricing")).toBe(true)
  })

  it("reads the useFor tags too", () => {
    const covered = coveredThemes([
      {
        title: "The week it all fell over",
        data: { useFor: ["outage", "honesty"] },
      },
    ])

    expect(covered.has("outages")).toBe(true)
  })

  it("does not read the point, because a point mentions everything", () => {
    // The point is a sentence about the story, and a sentence about anything a
    // founder did mentions half this table. Reading it would mark every theme
    // covered by the first story ever written.
    const covered = coveredThemes([
      {
        title: "Two exits",
        data: {
          theme: "Startup exits",
          point: "We shipped, we raised, we hired.",
        },
      },
    ])

    expect(covered.has("shipping")).toBe(false)
    expect(covered.has("hiring")).toBe(false)
  })

  it("survives a story page with no data at all", () => {
    expect(coveredThemes([{ title: "Untitled", data: null }]).size).toBe(0)
  })
})

describe("rankGaps", () => {
  it("ranks by how often the corpus mentions the theme", () => {
    const gaps = rankGaps({ pricing: 4, hiring: 9, churn: 6 }, new Set())

    expect(gaps.map((g) => g.theme)).toEqual(["hiring", "churn", "pricing"])
    expect(gaps[0].posts).toBe(9)
  })

  it("drops a theme a story already covers, however often it is mentioned", () => {
    const gaps = rankGaps({ pricing: 40, hiring: 4 }, new Set(["pricing"]))

    expect(gaps.map((g) => g.theme)).toEqual(["hiring"])
  })

  it("ignores anything under the mention floor", () => {
    const gaps = rankGaps(
      { pricing: MIN_MENTIONS - 1, hiring: MIN_MENTIONS },
      new Set()
    )

    expect(gaps.map((g) => g.theme)).toEqual(["hiring"])
  })

  it("caps the list, whatever the corpus says", () => {
    const counts = Object.fromEntries(THEMES.map((t, i) => [t.id, 100 - i]))

    expect(rankGaps(counts, new Set())).toHaveLength(STORY_GAP_CAP)
  })

  it("breaks ties on the table's own order, so the list does not reshuffle", () => {
    const counts = Object.fromEntries(THEMES.map((t) => [t.id, 5]))
    const first = rankGaps(counts, new Set()).map((g) => g.theme)
    const second = rankGaps(counts, new Set()).map((g) => g.theme)

    expect(first).toEqual(second)
    expect(first).toEqual(THEMES.slice(0, STORY_GAP_CAP).map((t) => t.id))
  })

  it("carries the question, not just the label", () => {
    const [gap] = rankGaps({ pricing: 7 }, new Set())

    expect(gap.question).toBe(gapQuestion(theme("pricing"), 7))
  })

  it("answers nothing for an account with no corpus", () => {
    expect(rankGaps({}, new Set())).toEqual([])
  })
})
