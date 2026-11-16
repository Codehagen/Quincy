import { describe, expect, it, vi } from "vitest"

import {
  cooldownNotice,
  formatWindow,
  normalisePillars,
  PILLAR_CAP,
  strategyMarkdown,
  strategySlug,
} from "./strategy-format"
import {
  describeContext,
  MAX_INPUT_CHARS,
  proposeStrategy,
  saveStrategy,
  strategyFrom,
  type ProposedStrategy,
  type StrategyContext,
  type StrategyUsage,
} from "./strategy"

/**
 * Only `readStrategy` and the default dependencies touch the database. The
 * orchestration is injectable for exactly this reason — see `StrategyDeps` —
 * so the money order, the provenance and the parse are all tested without a
 * model call or a Neon round trip.
 */

const sum = (pillars: { weight: number }[]) =>
  pillars.reduce((total, p) => total + p.weight, 0)

describe("normalisePillars", () => {
  /**
   * Normalised rather than rejected, and the test says so out loud: the
   * invariant in lib/brain.ts refuses anything that does not sum to 100, and a
   * proposal thrown away over three points of arithmetic costs a paid call and
   * returns nothing.
   */
  it("makes a split that does not add up add up to exactly 100", () => {
    const pillars = normalisePillars([
      { name: "Building", weight: 30 },
      { name: "Selling", weight: 30 },
      { name: "Living", weight: 30 },
    ])

    expect(sum(pillars)).toBe(100)
    // The spare point goes to the first pillar, not the last: ties break on
    // the model's own order, so the same proposal always writes the same page.
    expect(pillars.map((p) => p.weight)).toEqual([34, 33, 33])
  })

  it("leaves a split that already adds up alone", () => {
    const pillars = normalisePillars([
      { name: "Building", weight: 60 },
      { name: "Selling", weight: 40 },
    ])

    expect(pillars.map((p) => p.weight)).toEqual([60, 40])
  })

  it("splits evenly when the model had no opinion", () => {
    const pillars = normalisePillars([
      { name: "A", weight: 0 },
      { name: "B", weight: 0 },
      { name: "C", weight: 0 },
      { name: "D", weight: 0 },
    ])

    expect(pillars.map((p) => p.weight)).toEqual([25, 25, 25, 25])
    expect(sum(pillars)).toBe(100)
  })

  it("drops a pillar that rounds to nothing and re-balances the rest", () => {
    // A 0% pillar is a line in the drafting prompt saying to write nothing
    // about something.
    const pillars = normalisePillars([
      { name: "Everything", weight: 999 },
      { name: "A rounding error", weight: 1 },
    ])

    expect(pillars.map((p) => p.name)).toEqual(["Everything"])
    expect(sum(pillars)).toBe(100)
  })

  it("caps the list and still sums to 100", () => {
    const pillars = normalisePillars(
      Array.from({ length: 9 }, (_, i) => ({ name: `Pillar ${i}`, weight: 10 }))
    )

    expect(pillars).toHaveLength(PILLAR_CAP)
    expect(sum(pillars)).toBe(100)
  })

  it("drops a nameless pillar rather than storing a blank row", () => {
    expect(normalisePillars([{ name: "   ", weight: 50 }])).toEqual([])
  })
})

describe("formatWindow", () => {
  it("stores a weekday and an hour range as the one string the page holds", () => {
    expect(formatWindow({ weekday: 2, from: "8:00", to: "10:00" })).toBe(
      "Tuesday 08:00–10:00"
    )
  })

  it("drops the range when both ends are the same moment", () => {
    expect(formatWindow({ weekday: 4, from: "08:00", to: "08:00" })).toBe(
      "Thursday 08:00"
    )
  })

  it("refuses anything that is not a time of day", () => {
    expect(formatWindow({ weekday: 1, from: "morning", to: "" })).toBe("")
    expect(formatWindow({ weekday: 1, from: "25:00", to: "" })).toBe("")
  })
})

const PROPOSAL: ProposedStrategy = {
  goal: "1,000 people who ship reading every week",
  goalDate: "2027-03-31",
  audience:
    "Founders who write their own code and have nobody to hand a post to.",
  pillars: [
    {
      name: "Building Quincy",
      weight: 50,
      note: "What shipped and what it cost",
    },
    {
      name: "Working in the open",
      weight: 30,
      note: "Decisions with receipts",
    },
    { name: "Selling", weight: 20, note: "What a broker learns about copy" },
  ],
  postsPerWeek: 3,
  windows: [{ weekday: 2, from: "08:00", to: "10:00" }],
  leanInto: ["A number on its own line"],
  avoid: ["Advice that could come from anyone"],
}

describe("strategyFrom", () => {
  it("parses a proposal into a page the brain's invariants accept", () => {
    const strategy = strategyFrom(PROPOSAL, "x")

    expect(strategy).not.toBeNull()
    expect(strategy?.platform).toBe("x")
    expect(strategy?.goalDate).toBe("2027-03-31")
    expect(strategy?.audience?.primary).toContain("Founders")
    expect(sum(strategy!.pillars)).toBe(100)
    expect(strategy?.windows).toEqual(["Tuesday 08:00–10:00"])
    expect(strategy?.cadence.postsPerWeek).toBe(3)
  })

  it("refuses rather than throwing when there is no pillar to store", () => {
    // `assertValid` would throw a BrainInvariantError two frames later, with
    // the model call already paid for. A null is a sentence the caller can show.
    expect(strategyFrom({ ...PROPOSAL, pillars: [] }, "x")).toBeNull()
  })

  it("refuses when no window survived parsing", () => {
    expect(
      strategyFrom(
        { ...PROPOSAL, windows: [{ weekday: 2, from: "soon", to: "" }] },
        "x"
      )
    ).toBeNull()
  })

  it("drops a goal date that is not a date", () => {
    const strategy = strategyFrom({ ...PROPOSAL, goalDate: "next spring" }, "x")

    expect(strategy?.goalDate).toBeUndefined()
  })

  it("survives the Gateway handing back a string where an array belongs", () => {
    // The mangling lib/structured-output.ts exists for does not throw; it
    // returns a plausible object of the wrong shape.
    const mangled = { ...PROPOSAL, pillars: "[]" as unknown as [] }

    expect(strategyFrom(mangled, "x")).toBeNull()
  })
})

const CONTEXT: StrategyContext = {
  channel: "x",
  channelLabel: "X",
  connectedChannels: ["x"],
  posts: 99,
  newestPostedAt: new Date("2026-08-20T09:00:00Z"),
  portrait: "Writes short, lands the number on its own line.",
  rules: ["Never open with a question"],
  stories: [
    {
      title: "Two exits",
      point: "The long middle is the story.",
      theme: "exits",
    },
  ],
  slots: [{ weekday: 2, timeOfDay: "08:00" }],
  timezone: "Europe/Oslo",
  today: "2026-08-27",
}

describe("describeContext", () => {
  it("names the corpus, the slots and the stories without reading a post", () => {
    const described = describeContext(CONTEXT)

    expect(described).toContain("99 of their own posts")
    expect(described).toContain("Tuesday 08:00")
    expect(described).toContain("Two exits")
    expect(described).toContain("Europe/Oslo")
  })

  it("holds the input ceiling whatever the brain grows to", () => {
    const huge = describeContext({
      ...CONTEXT,
      rules: Array.from({ length: 400 }, (_, i) => `Rule ${i} `.repeat(40)),
    })

    expect(huge.length).toBeLessThanOrEqual(MAX_INPUT_CHARS)
  })
})

function deps(overrides: Parameters<typeof proposeStrategy>[2] = {}) {
  return {
    gather: async () => CONTEXT,
    propose: async () => ({
      ...PROPOSAL,
      usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 300 },
    }),
    write: vi.fn(async () => ({})),
    cooldown: async () => ({ ready: true as const }),
    meter: vi.fn(async () => {}),
    ...overrides,
  }
}

describe("proposeStrategy", () => {
  it("writes the page as inferred, because a reading is not a decision", async () => {
    const write = vi.fn(async (args: Record<string, unknown>) => args)
    const result = await proposeStrategy("u1", "x", deps({ write }))

    expect(result.ok).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)

    const [args] = write.mock.calls[0]
    expect(args.slug).toBe(strategySlug("x"))
    expect(args.kind).toBe("policy")
    // `proposePage` is the only writer that stamps `inferred`, and `inferred`
    // is the provenance that may not supply proof in a published post.
    expect(args.source).toBe("strategy-propose")
  })

  it("refuses before spending when the cooldown has not run out", async () => {
    const propose = vi.fn()
    const result = await proposeStrategy(
      "u1",
      "x",
      deps({
        cooldown: async () => ({ ready: false as const, secondsLeft: 3_600 }),
        propose,
      })
    )

    expect(result).toMatchObject({ ok: false, reason: "cooldown" })
    // The point of the order: a cooldown after the call is a bill, not a limit.
    expect(propose).not.toHaveBeenCalled()
  })

  it("meters the call, and meters it before judging the answer", async () => {
    const meter = vi.fn(async (userId: string, usage: StrategyUsage) => {
      void [userId, usage]
    })
    await proposeStrategy(
      "u1",
      "x",
      deps({
        meter,
        // Unusable, and paid for all the same.
        propose: async () => ({
          ...PROPOSAL,
          pillars: [],
          usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 12 },
        }),
      })
    )

    expect(meter).toHaveBeenCalledTimes(1)
    expect(meter.mock.calls[0][1]).toMatchObject({ inputTokens: 900 })
  })

  it("refuses to guess at a strategy for an account it has never read", async () => {
    const propose = vi.fn()
    const result = await proposeStrategy(
      "u1",
      "x",
      deps({
        gather: async () => ({
          ...CONTEXT,
          posts: 0,
          stories: [],
          portrait: "",
        }),
        propose,
      })
    )

    expect(result).toMatchObject({ ok: false, reason: "thin" })
    expect(propose).not.toHaveBeenCalled()
  })

  it("returns a sentence rather than a page when the answer is unusable", async () => {
    const write = vi.fn(async (args: Record<string, unknown>) => args)
    const result = await proposeStrategy(
      "u1",
      "x",
      deps({ write, propose: async () => ({ ...PROPOSAL, pillars: [] }) })
    )

    expect(result).toMatchObject({ ok: false, reason: "refused" })
    expect(write).not.toHaveBeenCalled()
  })
})

describe("saveStrategy", () => {
  it("flips the page to the user's the moment they edit it", async () => {
    const write = vi.fn(async (args: Record<string, unknown>) => args as never)

    await saveStrategy(
      "u1",
      "x",
      strategyFrom(PROPOSAL, "x")!,
      write as unknown as Parameters<typeof saveStrategy>[3]
    )

    const [args] = write.mock.calls[0]
    expect(args.provenance).toBe("user")
  })

  it("balances a split typed by hand rather than refusing it", async () => {
    const write = vi.fn(
      async (args: { data: { pillars: { weight: number }[] } }) => args as never
    )
    const strategy = strategyFrom(PROPOSAL, "x")!

    await saveStrategy(
      "u1",
      "x",
      {
        ...strategy,
        pillars: strategy.pillars.map((p) => ({ ...p, weight: 30 })),
      },
      write as unknown as Parameters<typeof saveStrategy>[3]
    )

    const [args] = write.mock.calls[0]
    expect(sum(args.data.pillars)).toBe(100)
  })
})

describe("strategyMarkdown", () => {
  it("renders the fields as the page a person reads", () => {
    const markdown = strategyMarkdown(strategyFrom(PROPOSAL, "x")!)

    expect(markdown).toContain("## Goal")
    expect(markdown).toContain("By 2027-03-31.")
    expect(markdown).toContain("| Building Quincy | 50% |")
    expect(markdown).toContain("3 posts a week.")
    expect(markdown).toContain("- Tuesday 08:00–10:00")
  })

  it("is empty for a page with nothing on it, rather than a stack of headings", () => {
    expect(strategyMarkdown({})).toBe("")
  })

  it("escapes a pipe rather than letting it end the table cell", () => {
    const markdown = strategyMarkdown({
      pillars: [{ name: "Ship | tell", weight: 100 }],
    })

    expect(markdown).toContain("Ship \\| tell")
  })
})

describe("cooldownNotice", () => {
  it("says when it happened and when it comes back", () => {
    const proposedAt = new Date("2026-08-27T06:00:00Z")
    const readyAt = new Date("2026-08-27T12:00:00Z")

    expect(
      cooldownNotice(
        proposedAt,
        readyAt,
        "UTC",
        new Date("2026-08-27T08:00:00Z")
      )
    ).toBe("Proposed 2 hours ago — try again after 12:00")
  })

  it("counts in minutes inside the first hour", () => {
    const proposedAt = new Date("2026-08-27T07:55:00Z")
    const readyAt = new Date("2026-08-27T13:55:00Z")

    expect(
      cooldownNotice(
        proposedAt,
        readyAt,
        "UTC",
        new Date("2026-08-27T08:00:00Z")
      )
    ).toContain("Proposed 5 minutes ago")
  })

  it("reads the clock in the user's own zone, never the server's", () => {
    const readyAt = new Date("2026-08-27T12:00:00Z")

    expect(
      cooldownNotice(new Date("2026-08-27T06:00:00Z"), readyAt, "Europe/Oslo")
    ).toContain("after 14:00")
  })
})
