import { describe, expect, it, vi } from "vitest"

import {
  angleForChannel,
  firstSentence,
  MAX_MERGES,
  MAX_SCRAP_BYTES,
  MIN_MERGES,
  pickMerges,
  runShipLog,
  shipLogScrap,
  SHIP_LOG_COOLDOWN_MS,
  SHIP_LOG_WINDOW_DAYS,
  wasSilent,
  type MergeRow,
  type ShipLogDeps,
} from "./ship-log"

/**
 * Only the reads touch the database, so everything that decides what a ship log
 * is gets tested here — the verdict test, the caps, the scrap, and the run's
 * own order. `runShipLog` takes every read and every write as a dep for exactly
 * that reason, matching `StrategyDeps` in lib/strategy.ts.
 */

const merge = (id: string, meta: Record<string, unknown> = {}): MergeRow => ({
  id,
  meta: {
    number: 100,
    title: "Something merged",
    additions: 40,
    changedFiles: 3,
    ...meta,
  },
})

const refused = (id: string, extra: Record<string, unknown> = {}) =>
  merge(id, { refusal: "nothing-worth-keeping", ...extra })

const stopped = (id: string, extra: Record<string, unknown> = {}) =>
  merge(id, { stopped: "unentitled", ...extra })

describe("wasSilent", () => {
  it("is true for a merge the selection refused", () => {
    expect(wasSilent({ refusal: "nothing-worth-keeping" })).toBe(true)
  })

  it("is true for a merge nothing ever read", () => {
    expect(wasSilent({ stopped: "not-started" })).toBe(true)
  })

  it("is false for a merge that produced neither", () => {
    // The common shape of a merge that became a riff: the riff row is the
    // record, and `recordShippedRefusal` deliberately never writes a success.
    expect(wasSilent({ number: 282, title: "A post" })).toBe(false)
    expect(wasSilent(null)).toBe(false)
  })
})

describe("pickMerges", () => {
  it("keeps only the merges that were refused or stopped", () => {
    const rows = [refused("a"), merge("b"), stopped("c"), merge("d")]

    expect(pickMerges(rows).map((m) => m.sourceItemId)).toEqual(["a", "c"])
  })

  it("stops at the cap, keeping the newest", () => {
    // Rows arrive newest first from the read, so the cap has to cut the tail.
    const rows = Array.from({ length: MAX_MERGES + 4 }, (_, i) =>
      refused(`m${i}`, { number: 300 - i })
    )

    const picked = pickMerges(rows)

    expect(picked).toHaveLength(MAX_MERGES)
    expect(picked[0].number).toBe(300)
  })

  it("falls back to the material's file list when the platform sent no count", () => {
    const [picked] = pickMerges([
      refused("a", {
        changedFiles: undefined,
        material: { files: [{ path: "a.ts" }, { path: "b.ts" }] },
      }),
    ])

    expect(picked.files).toBe(2)
  })

  it("survives a row written before any of these keys existed", () => {
    // jsonb, so every read narrows. A merge stored in July has a refusal and
    // nothing else, and it must produce a line rather than a TypeError.
    const [picked] = pickMerges([{ id: "a", meta: { refusal: "empty" } }])

    expect(picked).toEqual({
      sourceItemId: "a",
      number: 0,
      title: "",
      brief: "",
      additions: 0,
      files: 0,
    })
  })
})

describe("firstSentence", () => {
  it("takes the first line's first sentence and nothing else", () => {
    expect(
      firstSentence(
        "The page loads without waiting. It used to take 1.2s.\nSecond line."
      )
    ).toBe("The page loads without waiting.")
  })

  it("takes the whole line when it has no full stop", () => {
    expect(
      firstSentence("Nothing anybody outside the repository can see")
    ).toBe("Nothing anybody outside the repository can see")
  })

  it("is empty for a merge with no brief", () => {
    expect(firstSentence("")).toBe("")
  })
})

describe("shipLogScrap", () => {
  const merges = pickMerges([
    refused("a", {
      number: 282,
      title: "Read the material",
      additions: 412,
      changedFiles: 7,
      brief: "The writer now sees the commit messages. Numbers kept exactly.",
    }),
    stopped("b", {
      number: 283,
      title: "Fix the changelog",
      additions: 9,
      changedFiles: 1,
    }),
  ])

  it("opens by saying what the list is", () => {
    expect(shipLogScrap(merges).split("\n")[0]).toBe(
      "Everything I merged this week and never posted about, one line each:"
    )
  })

  it("is one line per merge, with the number, the title and the counts", () => {
    const lines = shipLogScrap(merges).split("\n").filter(Boolean)

    // Header plus one line each. A merge that spans two lines is a document.
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe(
      "#282 Read the material (412 additions across 7 files) — The writer now sees the commit messages."
    )
    expect(lines[2]).toBe("#283 Fix the changelog (9 additions across 1 file)")
  })

  it("never states a percentage about how the user writes lists", () => {
    // The list habit is measured by `measureHabits` and reaches the writer
    // through the brain. A number copied here would be a second copy of it,
    // wrong the first week the corpus changed.
    expect(shipLogScrap(merges)).not.toMatch(/\d+%/)
  })

  it("is bounded, whatever the merges carry", () => {
    const fat = Array.from({ length: MAX_MERGES }, (_, i) =>
      refused(`m${i}`, { title: "x".repeat(2_000), brief: "y".repeat(2_000) })
    )

    expect(shipLogScrap(pickMerges(fat)).length).toBeLessThanOrEqual(
      MAX_SCRAP_BYTES
    )
  })
})

describe("angleForChannel", () => {
  it("takes the first angle whose shape can reach the channel", () => {
    const angles = [
      { id: "a1", shape: "Essay" },
      { id: "a2", shape: "Short post" },
    ]

    expect(angleForChannel(angles, "x")?.id).toBe("a2")
  })

  it("is null when nothing fits, rather than picking one anyway", () => {
    expect(angleForChannel([{ id: "a1", shape: "Essay" }], "x")).toBeNull()
  })
})

/* ── The run ──────────────────────────────────────────────────────────────── */

function stubs(overrides: Partial<ShipLogDeps> = {}) {
  const deps = {
    read: vi.fn(async () => [refused("a"), refused("b"), refused("c")]),
    lastRunAt: vi.fn(async () => null),
    capture: vi.fn(async () => ({ ok: true as const, riffId: "rif_1" })),
    anglesOf: vi.fn(async () => [{ id: "rif_1-a0", shape: "Short post" }]),
    draft: vi.fn(async () => ({ ok: true as const, draftId: "drf_1" })),
    ...overrides,
  }

  // Cast for the shape, kept for the spies: `ShipLogDeps` types what the run
  // may call and `typeof deps` is what a test may assert on.
  return deps satisfies ShipLogDeps
}

describe("runShipLog", () => {
  it("writes one riff and one draft from the week's silent merges", async () => {
    const deps = stubs()
    const run = await runShipLog({ userId: "u1", deps })

    expect(run.ok).toBe(true)
    if (!run.ok) return

    expect(run.result).toEqual({
      merges: 3,
      riffId: "rif_1",
      draftId: "drf_1",
    })
    // One draft, never one per merge. A ship log is a post.
    expect(deps.draft).toHaveBeenCalledTimes(1)
    expect(deps.capture).toHaveBeenCalledTimes(1)
  })

  it("refuses below the minimum, and spends nothing doing it", async () => {
    const deps = stubs({ read: vi.fn(async () => [refused("a")]) })
    const run = await runShipLog({ userId: "u1", deps })

    expect(run.ok).toBe(false)
    if (run.ok) return

    expect(run.reason).toBe("too-few")
    expect(deps.capture).not.toHaveBeenCalled()
    expect(deps.draft).not.toHaveBeenCalled()
    expect(MIN_MERGES).toBe(2)
  })

  it("says so plainly when the week produced nothing", async () => {
    const deps = stubs({ read: vi.fn(async () => []) })
    const run = await runShipLog({ userId: "u1", deps })

    expect(run.ok).toBe(false)
    if (run.ok) return
    expect(run.summary).toBe("No merges went unwritten this week.")
  })

  it("refuses inside the cooldown, before it reads anything", async () => {
    const now = new Date("2026-08-27T09:00:00Z")
    const deps = stubs({
      lastRunAt: vi.fn(async () => new Date(now.getTime() - 86_400_000)),
    })

    const run = await runShipLog({ userId: "u1", now, deps })

    expect(run.ok).toBe(false)
    if (run.ok) return

    expect(run.reason).toBe("cooldown")
    // The cooldown is what stops "Run now" buying a second weekly draft, so it
    // has to answer before the read as well as before the spend.
    expect(deps.read).not.toHaveBeenCalled()
  })

  it("runs again once the cooldown has passed", async () => {
    const now = new Date("2026-08-27T09:00:00Z")
    const deps = stubs({
      lastRunAt: vi.fn(
        async () => new Date(now.getTime() - SHIP_LOG_COOLDOWN_MS - 1000)
      ),
    })

    expect((await runShipLog({ userId: "u1", now, deps })).ok).toBe(true)
  })

  it("reads from the last run rather than re-listing merges it already used", async () => {
    const now = new Date("2026-08-27T09:00:00Z")
    const last = new Date(now.getTime() - SHIP_LOG_COOLDOWN_MS - 1000)
    const deps = stubs({ lastRunAt: vi.fn(async () => last) })

    await runShipLog({ userId: "u1", now, deps })

    expect(deps.read).toHaveBeenCalledWith("u1", last, now)
  })

  it("never reaches further back than the window, however long it has been off", async () => {
    const now = new Date("2026-08-27T09:00:00Z")
    const read: ShipLogDeps["read"] = vi.fn(async () => [
      refused("a"),
      refused("b"),
    ])
    const deps = stubs({
      read,
      lastRunAt: vi.fn(async () => new Date("2026-01-01T00:00:00Z")),
    })

    await runShipLog({ userId: "u1", now, deps })

    const since = vi.mocked(read).mock.calls[0][1]
    expect(now.getTime() - since.getTime()).toBe(
      SHIP_LOG_WINDOW_DAYS * 86_400_000
    )
  })

  it("keeps the riff when no angle fits X, and does not draft", async () => {
    const deps = stubs({
      anglesOf: vi.fn(async () => [{ id: "rif_1-a0", shape: "Essay" }]),
    })

    const run = await runShipLog({ userId: "u1", deps })

    expect(run.ok).toBe(false)
    if (run.ok) return
    expect(run.reason).toBe("no-angle")
    expect(deps.draft).not.toHaveBeenCalled()
  })

  it("hands the capture path the scrap, never the raw rows", async () => {
    const capture: ShipLogDeps["capture"] = vi.fn(async () => ({
      ok: true as const,
      riffId: "rif_1",
    }))
    await runShipLog({ userId: "u1", deps: stubs({ capture }) })

    const [input] = vi.mocked(capture).mock.calls[0]
    expect(input.text).toContain("one line each")
    expect(input.sourceLabel).toBe("Ship log")
  })
})
