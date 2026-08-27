import { readFileSync } from "node:fs"

import { describe, expect, it, vi } from "vitest"

import {
  describePlan,
  hitsAvoid,
  KIND_REPEAT_CAP,
  MAX_DRAFTS,
  MAX_INPUT_CHARS,
  runWeekPlan,
  varyKinds,
  WEEK_PLAN_COOLDOWN_MS,
  type Candidate,
  type WeekPlanDeps,
} from "./week-plan"
import type { Strategy } from "./strategy-format"

/**
 * Only the reads touch the database. What decides the week — the avoid rule,
 * the kind rule, the cadence cap, and the order the run does things in — is
 * pure or injected, and all of it is here.
 */

const strategy = (over: Partial<Strategy> = {}): Strategy => ({
  platform: "x",
  goal: "500 people who build things read this account",
  audience: { primary: "Founders shipping their own product" },
  pillars: [
    { name: "Building in public", weight: 50 },
    { name: "What the numbers say", weight: 50 },
  ],
  cadence: { postsPerDay: 1, postsPerWeek: 3 },
  windows: ["Monday 08:00–10:00"],
  leanInto: ["The number you actually measured"],
  avoid: ["Engagement bait questions", "Hype about your own product"],
  ...over,
})

const candidate = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  hook: `Hook ${id}`,
  why: `Why ${id}`,
  kind: "build",
  shape: "Short post",
  sourceLabel: "Pull request",
  ...over,
})

describe("hitsAvoid", () => {
  it("catches an angle that breaks an avoid line", () => {
    expect(
      hitsAvoid("Engagement bait questions are the cheapest reach there is", [
        "Engagement bait questions",
      ])
    ).toBe("Engagement bait questions")
  })

  it("needs every content word, so one shared word is not a hit", () => {
    // "questions" alone would fire on half of everything anybody writes.
    expect(
      hitsAvoid("Three questions I got about the migration", [
        "Engagement bait questions",
      ])
    ).toBeNull()
  })

  it("ignores the order the words come in", () => {
    expect(
      hitsAvoid("Questions written as bait for engagement", [
        "Engagement bait questions",
      ])
    ).toBe("Engagement bait questions")
  })

  it("matches nothing for an avoid line with no content in it", () => {
    expect(hitsAvoid("Anything at all", ["Be you"])).toBeNull()
  })
})

describe("varyKinds", () => {
  it("writes one of each kind, never two", () => {
    const { kept, dropped } = varyKinds(
      [
        candidate("a", { kind: "build" }),
        candidate("b", { kind: "build" }),
        candidate("c", { kind: "lesson" }),
      ],
      []
    )

    expect(kept.map((p) => p.id)).toEqual(["a", "c"])
    expect(dropped[0].why).toBe("already writing one build this week")
  })

  it("drops a kind that already fills half the last six drafts", () => {
    const recent = Array(KIND_REPEAT_CAP).fill("build")

    const { kept, dropped } = varyKinds(
      [candidate("a", { kind: "build" }), candidate("b", { kind: "lesson" })],
      recent
    )

    expect(kept.map((p) => p.id)).toEqual(["b"])
    expect(dropped[0].why).toBe("3 of your last six drafts were already build")
  })

  it("keeps one rather than planning nothing when every kind repeats", () => {
    // A rhythm that answers "your drafts were too similar, so here is nothing"
    // has told the user about its own rule instead of doing its job.
    const { kept } = varyKinds(
      [candidate("a", { kind: "build" }), candidate("b", { kind: "build" })],
      Array(KIND_REPEAT_CAP).fill("build")
    )

    expect(kept.map((p) => p.id)).toEqual(["a"])
  })
})

describe("describePlan", () => {
  const context = {
    strategy: strategy(),
    candidates: [candidate("a"), candidate("b")],
    recent: ["build", "lesson"],
    gaps: [{ theme: "pricing", posts: 7, question: "What happened?" }],
    cadence: 3,
    today: "2026-08-31",
  }

  it("calls the avoid list a rule, because the strategy does", () => {
    expect(describePlan(context)).toContain("Avoid — these are rules:")
  })

  it("prints the kinds already used, so the critique has something to judge", () => {
    expect(describePlan(context)).toContain(
      "Kinds of the last six drafts, newest first: build, lesson."
    )
  })

  it("is bounded whatever the backlog looks like", () => {
    const fat = {
      ...context,
      candidates: Array.from({ length: 30 }, (_, i) =>
        candidate(`c${i}`, { hook: "x".repeat(600), why: "y".repeat(600) })
      ),
    }

    expect(describePlan(fat).length).toBeLessThanOrEqual(MAX_INPUT_CHARS)
  })
})

/* ── The run ──────────────────────────────────────────────────────────────── */

function stubs(overrides: Partial<WeekPlanDeps> = {}) {
  return {
    lastRunAt: vi.fn(async () => null),
    strategy: vi.fn(async () => ({ strategy: strategy() })),
    candidates: vi.fn(async () => [
      candidate("a", { kind: "build" }),
      candidate("b", { kind: "lesson" }),
      candidate("c", { kind: "number" }),
      candidate("d", { kind: "story" }),
    ]),
    kinds: vi.fn(async () => []),
    gaps: vi.fn(async () => []),
    plan: vi.fn(async () => ({
      picks: [
        {
          id: "a",
          pillar: "Building in public",
          verdict: "The merge is the post",
          keep: true,
        },
        {
          id: "b",
          pillar: "What the numbers say",
          verdict: "One number, stated",
          keep: true,
        },
        {
          id: "c",
          pillar: "What the numbers say",
          verdict: "Second reading",
          keep: true,
        },
        {
          id: "d",
          pillar: "Building in public",
          verdict: "Told already",
          keep: false,
        },
      ],
    })),
    meter: vi.fn(async () => {}),
    draft: vi.fn(async (input: { userId: string; angleId: string }) => ({
      ok: true as const,
      draftId: `drf_${input.angleId}`,
    })),
    slot: vi.fn(async () => ({
      ok: true as const,
      at: new Date("2026-08-31T08:00:00Z"),
      slotId: "slot_1",
      beyondThisWeek: false,
    })),
    ...overrides,
  } satisfies WeekPlanDeps
}

describe("runWeekPlan", () => {
  it("refuses without a strategy and never reaches the model", async () => {
    const deps = stubs({ strategy: vi.fn(async () => null) })
    const run = await runWeekPlan({ userId: "u1", deps })

    expect(run.ok).toBe(false)
    if (run.ok) return

    expect(run.reason).toBe("no-strategy")
    expect(run.summary).toBe("No strategy yet — propose one on /brain.")
    expect(deps.plan).not.toHaveBeenCalled()
    expect(deps.draft).not.toHaveBeenCalled()
  })

  it("refuses with no candidates, and spends nothing", async () => {
    const deps = stubs({ candidates: vi.fn(async () => []) })
    const run = await runWeekPlan({ userId: "u1", deps })

    expect(run.ok).toBe(false)
    if (run.ok) return
    expect(run.reason).toBe("no-candidates")
    expect(deps.plan).not.toHaveBeenCalled()
  })

  it("refuses inside the cooldown, before it reads the strategy", async () => {
    const now = new Date("2026-08-31T07:00:00Z")
    const deps = stubs({
      lastRunAt: vi.fn(async () => new Date(now.getTime() - 3_600_000)),
    })

    const run = await runWeekPlan({ userId: "u1", now, deps })

    expect(run.ok).toBe(false)
    if (run.ok) return
    expect(run.reason).toBe("cooldown")
    expect(deps.strategy).not.toHaveBeenCalled()
  })

  it("runs once the cooldown has passed", async () => {
    const now = new Date("2026-08-31T07:00:00Z")
    const deps = stubs({
      lastRunAt: vi.fn(
        async () => new Date(now.getTime() - WEEK_PLAN_COOLDOWN_MS - 1000)
      ),
    })

    expect((await runWeekPlan({ userId: "u1", now, deps })).ok).toBe(true)
  })

  it("writes at most the cadence, however many the model kept", async () => {
    const deps = stubs()
    const run = await runWeekPlan({ userId: "u1", deps })

    expect(run.ok).toBe(true)
    if (!run.ok) return

    // The strategy asks for three a week and the model kept three; all three
    // survive because their kinds differ.
    expect(run.result.drafted).toHaveLength(3)
    expect(deps.draft).toHaveBeenCalledTimes(3)
  })

  it("never writes more than the hard cap, whatever the strategy asks for", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      candidate(`k${i}`, { kind: `kind${i}` })
    )

    const deps = stubs({
      strategy: vi.fn(async () => ({
        strategy: strategy({ cadence: { postsPerDay: 2, postsPerWeek: 14 } }),
      })),
      candidates: vi.fn(async () => many),
      plan: vi.fn(async () => ({
        picks: many.map((c) => ({
          id: c.id,
          pillar: "Building in public",
          verdict: "In the plan",
          keep: true,
        })),
      })),
    })

    const run = await runWeekPlan({ userId: "u1", deps })

    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.result.drafted).toHaveLength(MAX_DRAFTS)
  })

  it("drops an angle that breaks the avoid list, whatever the model said", async () => {
    const bait = candidate("bait", {
      kind: "question",
      hook: "Engagement bait questions still work, apparently",
    })

    const deps = stubs({
      candidates: vi.fn(async () => [bait, candidate("a")]),
      plan: vi.fn(async () => ({
        picks: [
          {
            id: "bait",
            pillar: "Building in public",
            verdict: "Reach",
            keep: true,
          },
          {
            id: "a",
            pillar: "Building in public",
            verdict: "The merge",
            keep: true,
          },
        ],
      })),
    })

    const run = await runWeekPlan({ userId: "u1", deps })

    expect(run.ok).toBe(true)
    if (!run.ok) return

    expect(run.result.drafted).toEqual(["drf_a"])
    expect(run.result.skipped).toContain(
      'Engagement bait questions still work, apparently — breaks "Engagement bait questions"'
    )
    // The critique still records it. The rejections are the useful half.
    expect(run.result.critiqued).toHaveLength(2)
  })

  it("varies the kind against the last six drafts", async () => {
    const deps = stubs({
      kinds: vi.fn(async () => ["build", "build", "build", "lesson"]),
    })

    const run = await runWeekPlan({ userId: "u1", deps })

    expect(run.ok).toBe(true)
    if (!run.ok) return

    expect(run.result.drafted).not.toContain("drf_a")
    expect(run.result.skipped).toContain(
      "Hook a — 3 of your last six drafts were already build"
    )
  })

  it("records the slot each draft would take, and creates no scheduled post", async () => {
    const deps = stubs()
    const run = await runWeekPlan({ userId: "u1", deps })

    expect(run.ok).toBe(true)
    if (!run.ok) return

    expect(run.result.placed).toHaveLength(3)
    expect(run.result.placed[0]).toEqual({
      draftId: "drf_a",
      at: "2026-08-31T08:00:00.000Z",
      slotId: "slot_1",
    })

    // The module cannot write a `scheduled_post` because it never names one.
    // A row there is an approved version with a time, and approving is the
    // user's press.
    const source = readFileSync("lib/week-plan.ts", "utf8")
    expect(source).not.toContain("scheduledPost")
    // Nor anything else. The only write this module makes is through
    // `draftFromAngle`, which is the one writer of draft rows.
    expect(source).not.toMatch(/db\.(insert|update|delete)/)
  })

  it("walks the placement forward, so two drafts do not propose one slot", async () => {
    const slot = vi.fn(async ({ now }: { now: Date }) => ({
      ok: true as const,
      at: new Date(now.getTime() + 86_400_000),
      slotId: "slot_1",
      beyondThisWeek: false,
    }))

    const run = await runWeekPlan({
      userId: "u1",
      now: new Date("2026-08-31T07:00:00Z"),
      deps: stubs({ slot }),
    })

    expect(run.ok).toBe(true)
    if (!run.ok) return

    expect(run.result.placed.map((p) => p.at)).toEqual([
      "2026-09-01T07:00:00.000Z",
      "2026-09-02T07:00:00.000Z",
      "2026-09-03T07:00:00.000Z",
    ])
  })

  it("still drafts when there is no slot to propose", async () => {
    const run = await runWeekPlan({
      userId: "u1",
      deps: stubs({
        slot: vi.fn(async () => ({
          ok: false as const,
          reason: "no-slot" as const,
        })),
      }),
    })

    expect(run.ok).toBe(true)
    if (!run.ok) return

    expect(run.result.drafted).toHaveLength(3)
    expect(run.result.placed).toEqual([])
  })

  it("reports the week as nothing kept when every pick was rejected", async () => {
    const deps = stubs({
      plan: vi.fn(async () => ({
        picks: [
          { id: "a", pillar: "", verdict: "Belongs to no pillar", keep: false },
        ],
      })),
    })

    const run = await runWeekPlan({ userId: "u1", deps })

    expect(run.ok).toBe(false)
    if (run.ok) return
    expect(run.reason).toBe("nothing-kept")
    expect(deps.draft).not.toHaveBeenCalled()
  })

  it("ignores an id the model invented", async () => {
    const run = await runWeekPlan({
      userId: "u1",
      deps: stubs({
        plan: vi.fn(async () => ({
          picks: [
            {
              id: "does-not-exist",
              pillar: "x",
              verdict: "made up",
              keep: true,
            },
            {
              id: "a",
              pillar: "Building in public",
              verdict: "real",
              keep: true,
            },
          ],
        })),
      }),
    })

    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.result.drafted).toEqual(["drf_a"])
    expect(run.result.proposed).toBe(1)
  })

  it("meters what the plan cost, whatever became of the answer", async () => {
    const meter = vi.fn(async () => {})

    await runWeekPlan({
      userId: "u1",
      deps: stubs({
        meter,
        plan: vi.fn(async () => ({
          picks: [],
          usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 40 },
        })),
      }),
    })

    expect(meter).toHaveBeenCalledWith("u1", {
      inputTokens: 900,
      cachedInputTokens: 0,
      outputTokens: 40,
    })
  })
})
