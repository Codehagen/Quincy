import { describe, expect, it, vi } from "vitest"

import type { BrainPage } from "./brain"
import {
  analyseWhatWorked,
  KIND_COVERAGE,
  MIN_READABLE,
  MIN_WINNERS,
  refreshWhatWorked,
  renderFinding,
  TRAIT_LIFT,
  updateWhatWorked,
  WORKED_GATE,
  WORKED_TRAITS,
  workedSlug,
  type MeasuredPost,
  type WhatWorkedDeps,
} from "./what-worked"

/**
 * The tests that matter here are the ones about **not writing**.
 *
 * A brain page is injected into every prompt in the product, so the failure
 * mode is not a wrong number on a page nobody reads — it is a confident
 * sentence drawn from four posts steering every angle and every draft,
 * silently, until somebody notices the drafts have got worse. There is no
 * screen that would show it. So the refusals, the lift bar and the retraction
 * carry most of the assertions below, and the happy path is checked mainly to
 * prove the refusals are not vacuous.
 *
 * A realistic account is pinned as a fixture rather than described, because
 * the whole design was argued from one with this shape: 43 posts measured, a
 * median of 600 impressions, and three posts above 3× it. The numbers are
 * synthetic; the shape is what matters.
 */

const NOW = new Date("2026-09-09T06:00:00.000Z")

function post(overrides: Partial<MeasuredPost> = {}): MeasuredPost {
  return {
    channel: "x",
    externalId: `x-${Math.random().toString(36).slice(2)}`,
    impressions: 100,
    body: "I shipped it.\n\nIt went out at nine.\n\nThat was the whole week.",
    url: "",
    kind: "",
    ...overrides,
  }
}

/* ── A typical account ────────────────────────────────────────────────────
   One impression count per post in `post_metric`'s thirty-day window, newest
   reading per post, and which of them the corpus can supply text for.
   Synthetic numbers with the shape of a real small account: a long middle,
   three clear outliers, and a third of the posts not yet imported.
   ────────────────────────────────────────────────────────────────────────── */

/** The 28 posts with a `source_item` row behind them. */
const TYPICAL_READABLE = [
  3900, 2800, 2000, 1700, 1500, 1300, 1200, 1100, 1000, 900, 850, 800, 760, 720,
  700, 680, 640, 620, 600, 580, 560, 500, 480, 450, 400, 300, 200, 150,
]

/**
 * The 15 with numbers and no text: published since the last corpus import, so
 * `refreshPostMetrics` had nothing to stamp `source_item_id` with. They are
 * real posts that did real numbers and they count toward the median.
 */
const TYPICAL_UNREADABLE = [
  1250, 880, 660, 540, 510, 470, 430, 420, 410, 390, 380, 370, 350, 270, 90,
]

function typicalAccount(): MeasuredPost[] {
  return [
    ...TYPICAL_READABLE.map((impressions, i) =>
      post({ externalId: `typical-r-${i}`, impressions })
    ),
    ...TYPICAL_UNREADABLE.map((impressions, i) =>
      post({ externalId: `typical-u-${i}`, impressions, body: "" })
    ),
  ]
}

describe("the traits", () => {
  function fires(id: string, body: string, medianLength = 100): boolean {
    const trait = WORKED_TRAITS.find((t) => t.id === id)
    if (!trait) throw new Error(`no trait ${id}`)
    return trait.test(body, { medianLength })
  }

  /**
   * Posts shaped like real ones, because a real corpus is lowercase, Norwegian-inflected and full
   * of emoji, and a detector tuned on invented English finds nothing in it.
   */
  it("sees the writer in the opening line, lowercase i included", () => {
    expect(fires("first-person-hook", "I made $4,100 in August 2026.")).toBe(
      true
    )
    // "for me" — the subject is not the first word and the writer is still in
    // the line. Posts shaped like this one do win.
    expect(
      fires(
        "first-person-hook",
        "Been tracking what actually works on X for me."
      )
    ).toBe(true)
    expect(fires("first-person-hook", "My new workflow\n\nthen this")).toBe(
      true
    )
    expect(
      fires("first-person-hook", "Introducing Quincy, now in early beta ✨")
    ).toBe(false)
    // Word boundaries, or every post with "in" or "it" in it reads as personal.
    expect(fires("first-person-hook", "Introducing it in a minute")).toBe(false)
  })

  it("tells a number in the hook from a number on its own line", () => {
    const standing = "Followers\n\n4120\n\nThat is the number."
    expect(fires("number-alone", standing)).toBe(true)
    expect(fires("number-in-hook", standing)).toBe(false)

    // A line with letters on it is a sentence containing a number, which is
    // the thing the house style says not to do.
    expect(fires("number-alone", "69x cheaper for the same job.")).toBe(false)
    expect(fires("number-in-hook", "1800 contributions in 2025")).toBe(true)
  })

  it("counts blocks, not lines", () => {
    // Three lines, one block. The three-beat shape is about the blank lines.
    expect(
      fires("three-blocks", "Posted yesterday.\nMust be an achievement\nBtw")
    ).toBe(false)
    expect(
      fires(
        "three-blocks",
        "I shipped it.\n\nIt went out.\n\nThat was the week."
      )
    ).toBe(true)
  })

  it("mirrors length and links, so neither direction is baked in", () => {
    expect(fires("longer-than-usual", "x".repeat(200), 100)).toBe(true)
    expect(fires("shorter-than-usual", "x".repeat(200), 100)).toBe(false)
    expect(fires("carries-a-link", "Repo 🔗\nhttps://t.co/aaa")).toBe(
      true
    )
    expect(fires("no-link", "Repo 🔗\nhttps://t.co/aaa")).toBe(false)
  })

  it("reads the emoji and the question off the opening line only", () => {
    // The ✨ is on line two. A hook is the first line; that is the whole bet.
    expect(
      fires("emoji-in-hook", "Posted yesterday.\nMust be an achievement ✨")
    ).toBe(false)
    expect(fires("emoji-in-hook", "You better start sharing on X ✅")).toBe(
      true
    )
    expect(
      fires("question-hook", "How does Quincy work?\n\nIt reads what you ship.")
    ).toBe(true)
    // A question mid-line is grammar, not a hook. The line has to land on it.
    expect(fires("question-hook", "Does it work? It does.\nEvery time.")).toBe(
      false
    )
  })
})

describe("what a typical account supports", () => {
  const finding = analyseWhatWorked("x", typicalAccount())

  it("computes the account's own baseline over every measured post", () => {
    expect(finding.measured).toBe(43)
    expect(finding.readable).toBe(28)
    // The median is over all 43, not the 28 with text: a post whose text the
    // corpus has not caught up with is still a post that did that number, and
    // dropping it would state a median over a biased half.
    expect(finding.median).toBe(600)
    expect(finding.gate).toBe(600 * WORKED_GATE)
  })

  /**
   * The answer this feature ships with, and it is "nothing".
   *
   * Three posts clear 3× the median. They agree on everything — all three open
   * with the writer in the line, all three run three blocks or more, all three
   * run longer than the median post — and every one of those agreements is
   * what three posts always do. `MIN_WINNERS` is what stops that page being
   * written, and this test is the reason the constant is 6.
   */
  it("refuses, because three posts is not evidence", () => {
    expect(finding.winners).toHaveLength(3)
    expect(finding.refusal).toBe("thin-winners")
    expect(finding.traits).toEqual([])
  })

  it("says nothing was published through Quincy, because nothing was", () => {
    // `scheduled_post` has zero rows, so no post carries an angle kind and the
    // kind family is not computed at all.
    expect(finding.kindsRead).toBe(false)
  })
})

describe("the refusals", () => {
  it("refuses an account with no readings at all", () => {
    const finding = analyseWhatWorked("x", [])
    expect(finding.refusal).toBe("no-metrics")
    expect(finding.median).toBe(0)
  })

  it("refuses when too few posts have text, however many were measured", () => {
    const posts = [
      ...Array.from({ length: MIN_READABLE - 1 }, (_, i) =>
        post({ externalId: `r-${i}`, impressions: 100 })
      ),
      ...Array.from({ length: 40 }, (_, i) =>
        post({ externalId: `u-${i}`, impressions: 5000, body: "" })
      ),
    ]

    const finding = analyseWhatWorked("x", posts)
    expect(finding.measured).toBe(51)
    expect(finding.readable).toBe(MIN_READABLE - 1)
    expect(finding.refusal).toBe("no-text")
  })

  /**
   * The refusal a naive version never reaches, and the one this file exists
   * for: plenty of winners, and nothing they share that the rest does not.
   */
  it("refuses when the winners agree only about things everyone does", () => {
    const shape = "I shipped it.\n\nIt went out at nine.\n\nThat was the week."
    const posts = [
      ...Array.from({ length: MIN_WINNERS }, (_, i) =>
        post({ externalId: `w-${i}`, impressions: 4000, body: shape })
      ),
      ...Array.from({ length: 14 }, (_, i) =>
        post({ externalId: `l-${i}`, impressions: 100, body: shape })
      ),
    ]

    const finding = analyseWhatWorked("x", posts)
    expect(finding.winners).toHaveLength(MIN_WINNERS)
    expect(finding.refusal).toBe("no-agreement")
  })

  /**
   * The lift bar on its own. Every winner opens with the writer — a perfect
   * share — and so does most of the rest, so it is a fact about the account
   * and not about what worked. A share-only implementation writes this page.
   */
  it("throws out a trait every winner has when the rest has it too", () => {
    const mine = "I shipped it.\n\nIt went out at nine.\n\nThat was the week."
    const posts = [
      ...Array.from({ length: MIN_WINNERS }, (_, i) =>
        post({ externalId: `w-${i}`, impressions: 4000, body: mine })
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        post({ externalId: `l-${i}`, impressions: 100, body: mine })
      ),
      // Two that do not, so the rest's share is 12/14 = 86% — still 14 points
      // under the winners' 100%, and under the 25-point bar.
      post({
        externalId: "l-x",
        impressions: 100,
        body: "Quincy shipped.\n\nIt went out at nine.\n\nThat was the week.",
      }),
      post({
        externalId: "l-y",
        impressions: 100,
        body: "Quincy shipped.\n\nIt went out at nine.\n\nThat was the week.",
      }),
    ]

    const finding = analyseWhatWorked("x", posts)
    expect(finding.winners).toHaveLength(MIN_WINNERS)
    expect(finding.traits.some((t) => t.id === "first-person-hook")).toBe(false)
    expect(finding.refusal).toBe("no-agreement")
  })

  it("counts a post above the gate with no text toward the median and nowhere else", () => {
    const posts = [
      ...Array.from({ length: 20 }, (_, i) =>
        post({ externalId: `r-${i}`, impressions: 100 })
      ),
      post({ externalId: "huge", impressions: 100_000, body: "" }),
    ]

    const finding = analyseWhatWorked("x", posts)
    expect(finding.measured).toBe(21)
    expect(finding.readable).toBe(20)
    expect(finding.winners).toEqual([])
  })
})

/* ── The finding ──────────────────────────────────────────────────────────── */

/**
 * Six winners that genuinely separate: they put a number on its own line and
 * the rest do not. Everything else about the two groups is identical, so
 * exactly one trait can clear the bars.
 */
function separated(): MeasuredPost[] {
  const won = "I shipped the thing.\n\n42\n\nThat was the week."
  const lost = "I shipped the thing.\n\nforty two\n\nThat was the week."
  return [
    ...Array.from({ length: MIN_WINNERS }, (_, i) =>
      post({ externalId: `w-${i}`, impressions: 4000, body: won })
    ),
    ...Array.from({ length: 14 }, (_, i) =>
      post({ externalId: `l-${i}`, impressions: 100, body: lost })
    ),
  ]
}

describe("the finding", () => {
  const finding = analyseWhatWorked("x", separated())

  it("keeps the one trait that separates and drops the rest", () => {
    expect(finding.refusal).toBeNull()
    expect(finding.traits.map((t) => t.id)).toEqual(["number-alone"])
    const [trait] = finding.traits
    expect(trait.winners).toBe(MIN_WINNERS)
    expect(trait.rest).toBe(0)
    expect(trait.lift).toBeGreaterThanOrEqual(TRAIT_LIFT)
  })

  it("counts kinds only once the lineage covers enough of the corpus", () => {
    const posts = separated().map((p, i) => ({
      ...p,
      // Every winner is a Story, and so is a third of the rest — but only
      // half the corpus carries a kind at all, under KIND_COVERAGE.
      kind: i < separated().length / 2 ? "Story" : "",
    }))

    const partial = analyseWhatWorked("x", posts)
    expect(partial.kindsRead).toBe(false)
    expect(partial.traits.some((t) => t.id.startsWith("kind:"))).toBe(false)

    const full = analyseWhatWorked(
      "x",
      separated().map((p, i) => ({
        ...p,
        kind: i < MIN_WINNERS ? "Story" : "Announcement",
      }))
    )
    expect(full.kindsRead).toBe(true)
    expect(full.traits.some((t) => t.id === "kind:Story")).toBe(true)
    expect(KIND_COVERAGE).toBeLessThanOrEqual(1)
  })

  describe("the page it writes", () => {
    const body = renderFinding(finding, NOW)

    it("states its sample before it states a claim", () => {
      const sample = body.indexOf("Measured on 2026-09-09")
      const claim = body.indexOf("a number stands on its own line")
      expect(sample).toBeGreaterThan(-1)
      expect(claim).toBeGreaterThan(sample)
    })

    it("carries the counts on both sides of every claim", () => {
      // "6 of 6, against 0 of 14" survives a paraphrase in a way that
      // "your best posts put the number on its own line" does not.
      expect(body).toContain(
        `${MIN_WINNERS} of ${MIN_WINNERS}, against 0 of 14`
      )
    })

    it("names what it is drawn from, and how thin", () => {
      expect(body).toContain(`Drawn from ${MIN_WINNERS} posts`)
      expect(body).toContain("a reading, not a rule")
    })

    it("says outright that no post carries a kind when none does", () => {
      expect(body).toContain("published through Quincy")
    })

    /**
     * The last line, and the one that keeps this page in its place. Brain
     * pages are injected everywhere with no ordering guarantee, so a note
     * about last month must say in as many words that it loses to the voice
     * pages and to the material in front of the model.
     */
    it("ranks itself below the voice, the strategy and the material", () => {
      expect(body.trimEnd().endsWith("they win.")).toBe(true)
    })

    it("never renders a claim as an instruction", () => {
      for (const line of body.split("\n")) {
        expect(line).not.toMatch(/^- (Open|Write|Use|Always|Never|Put|Keep) /)
      }
    })
  })
})

/* ── The write ────────────────────────────────────────────────────────────── */

function page(overrides: Partial<BrainPage> = {}): BrainPage {
  return {
    id: "bp_1",
    userId: "u_1",
    slug: workedSlug("x"),
    kind: "memory",
    title: "What worked — X",
    body: "an older finding",
    data: {},
    provenance: "inferred",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as BrainPage
}

function harness({
  posts = separated(),
  pages = [] as BrainPage[],
  users = ["u_1"],
}: {
  posts?: MeasuredPost[]
  pages?: BrainPage[]
  users?: string[]
} = {}) {
  const written: {
    slug: string
    title: string
    body: string
    data: Record<string, unknown>
  }[] = []

  const deps: WhatWorkedDeps = {
    listUsers: async (limit) => users.slice(0, limit),
    readPosts: async () => posts,
    listPages: async () => pages,
    writePage: async ({ slug, title, body, data }) => {
      written.push({ slug, title, body, data })
    },
  }

  return { deps, written }
}

describe("writing the page", () => {
  it("writes a finding as an inferred memory page, one per channel", async () => {
    const { deps, written } = harness()
    const outcomes = await updateWhatWorked({ userId: "u_1", deps, now: NOW })

    expect(outcomes).toEqual([{ channel: "x", action: "wrote", refusal: null }])
    expect(written).toHaveLength(1)
    expect(written[0].slug).toBe("memory/what-worked-x")
    expect(written[0].title).toBe("What worked — X")
    expect(written[0].data).toMatchObject({ channel: "x", median: 100 })
  })

  it("does not rewrite a page whose body has not changed", async () => {
    const finding = analyseWhatWorked("x", separated())
    const { deps, written } = harness({
      pages: [page({ body: renderFinding(finding, NOW) })],
    })

    const outcomes = await updateWhatWorked({ userId: "u_1", deps, now: NOW })

    // `putPage` snapshots the previous state on every write. A page rewritten
    // identically every morning is a version row a day, forever.
    expect(outcomes[0].action).toBe("unchanged")
    expect(written).toEqual([])
  })

  it("writes nothing at all when a refusing account has never had the page", async () => {
    const { deps, written } = harness({ posts: typicalAccount() })
    const outcomes = await updateWhatWorked({ userId: "u_1", deps, now: NOW })

    // An empty row on /brain to record that Quincy has nothing to say is
    // worse than no row.
    expect(outcomes).toEqual([
      { channel: "x", action: "refused-quietly", refusal: "thin-winners" },
    ])
    expect(written).toEqual([])
  })

  /**
   * Evidence expires. The window is thirty days, so a page written from six
   * winners in September is written from four in October with nothing having
   * happened. A page left standing on evidence that is gone is the worst
   * state this feature has, because nothing on any screen says so.
   */
  it("empties a standing page when the evidence behind it is gone", async () => {
    const { deps, written } = harness({
      posts: typicalAccount(),
      pages: [page()],
    })

    const outcomes = await updateWhatWorked({ userId: "u_1", deps, now: NOW })

    expect(outcomes).toEqual([
      { channel: "x", action: "retracted", refusal: "thin-winners" },
    ])
    // An empty memory body renders nothing — `renderBrain` filters them
    // through `.filter(Boolean)` — so the retraction reaches every prompt
    // immediately while the row and its numbers stay readable on /brain.
    expect(written[0].body).toBe("")
    expect(written[0].data).toMatchObject({ refusal: "thin-winners" })
  })

  it("retracts a page for a channel whose numbers stopped arriving entirely", async () => {
    const { deps, written } = harness({
      posts: [],
      pages: [
        page({ slug: workedSlug("linkedin"), title: "What worked — LinkedIn" }),
      ],
    })

    const outcomes = await updateWhatWorked({ userId: "u_1", deps, now: NOW })

    // A revoked grant is the one case where the channel disappears from the
    // readings, and it is exactly the case that must not leave the page up.
    expect(outcomes).toEqual([
      { channel: "linkedin", action: "retracted", refusal: "no-metrics" },
    ])
    expect(written[0].slug).toBe("memory/what-worked-linkedin")
  })

  it("does not blank a page it has already blanked", async () => {
    const { deps, written } = harness({
      posts: typicalAccount(),
      pages: [page({ body: "" })],
    })

    const outcomes = await updateWhatWorked({ userId: "u_1", deps, now: NOW })
    expect(outcomes[0].action).toBe("unchanged")
    expect(written).toEqual([])
  })

  /**
   * Heartbeat's standing rule, applied to a job that runs at 06:00 with
   * nobody watching: never overwrite something a human has touched.
   */
  it("leaves a page alone once a human has confirmed or corrected it", async () => {
    for (const provenance of ["user", "confirmed", "published"] as const) {
      const { deps, written } = harness({ pages: [page({ provenance })] })
      const outcomes = await updateWhatWorked({ userId: "u_1", deps, now: NOW })

      expect(outcomes).toEqual([
        { channel: "x", action: "held", refusal: null },
      ])
      expect(written).toEqual([])
    }
  })

  it("separates the channels rather than pooling their numbers", async () => {
    const posts = [
      ...separated(),
      ...separated().map((p) => ({
        ...p,
        channel: "linkedin" as const,
        externalId: `li-${p.externalId}`,
        // A LinkedIn impression is not an X impression. Pooled, this account's
        // median would be nine times what either platform actually does.
        impressions: p.impressions * 9,
      })),
    ]

    const { deps, written } = harness({ posts })
    await updateWhatWorked({ userId: "u_1", deps, now: NOW })

    expect(written.map((w) => w.slug).sort()).toEqual([
      "memory/what-worked-linkedin",
      "memory/what-worked-x",
    ])
    expect(written.map((w) => w.data.median)).toEqual([100, 900])
  })
})

describe("the nightly pass", () => {
  it("caps the batch and says so loudly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const users = Array.from({ length: 5 }, (_, i) => `u_${i}`)
    const { deps } = harness({ users, posts: typicalAccount() })

    const run = await refreshWhatWorked({ deps, now: NOW, maxUsers: 3 })

    expect(run.users).toBe(3)
    expect(run.truncated).toBe(true)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it("fails soft per user", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { deps, written } = harness({ users: ["bad", "good"] })
    const readPosts = deps.readPosts
    deps.readPosts = async (userId, now) => {
      if (userId === "bad") throw new Error("neon said no")
      return readPosts(userId, now)
    }

    const run = await refreshWhatWorked({ deps, now: NOW })

    expect(run.failed).toBe(1)
    expect(run.wrote).toBe(1)
    expect(written).toHaveLength(1)
    error.mockRestore()
  })

  it("counts refusals without treating them as failures", async () => {
    const { deps } = harness({ users: ["u_1"], posts: typicalAccount() })
    const run = await refreshWhatWorked({ deps, now: NOW })

    expect(run).toMatchObject({ users: 1, wrote: 0, refused: 1, failed: 0 })
  })
})
