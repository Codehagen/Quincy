import { describe, expect, it } from "vitest"

import {
  boundResult,
  ceilingSkip,
  MAX_RESULT_BYTES,
  RHYTHM_DAILY_CEILING_MICROS,
} from "./rhythm-run"

/**
 * The two rules in lib/rhythm-run.ts that decide something without a database:
 * the daily ceiling and the bound on what a run may write into
 * `rhythm_run.result`. Everything else in that file is claims, cursors and
 * inserts, and lib/rhythm-schedule.test.ts already pins the timing model those
 * are built on.
 *
 * Both functions are exported for exactly this — the same split lib/heartbeat.
 * ts draws between `factsFrom` and `runHeartbeat`.
 */

/** The three shapes the real handlers return, shrunk to their skeletons. */
const shipLog = { merges: 7, riffId: "rf_abc", draftId: "dr_abc" }

const weeklyReview = {
  message: "Three posts, two channels.",
  posted: { count: 3, channels: ["X"], waiting: 1, oldest: null },
  worked: { measured: 2, above: 1, below: 1, median: 400, best: 900 },
  remembered: true,
}

const weekPlan = {
  proposed: 5,
  critiqued: [{ idea: "The migration nobody noticed", verdict: "keep" }],
  drafted: ["dr_one", "dr_two"],
  skipped: ["said the same thing last week"],
  placed: [{ draftId: "dr_one", at: "2026-09-01T07:00:00Z", slotId: "sl_one" }],
}

describe("boundResult — nothing to record", () => {
  it("answers null for a handler that returned no result", () => {
    // The common case by a distance. Every skip, every miss, every throw, and
    // the three handlers that have never returned a record at all.
    expect(boundResult(undefined, "No new bookmarks.")).toBeNull()
  })

  it("answers null for an explicit null", () => {
    expect(boundResult(null, "No new bookmarks.")).toBeNull()
  })

  it("keeps an empty object, which is not the same as nothing", () => {
    // `{}` is a handler that recorded a result with no facts in it. Collapsing
    // it to null would make it indistinguishable from a run that recorded
    // nothing, which is the distinction the nullable column exists to hold.
    expect(boundResult({}, "Ran.")).toEqual({})
  })
})

describe("boundResult — under the cap", () => {
  it("passes a Ship Log record through unchanged", () => {
    expect(boundResult(shipLog, "Drafted one ship log.")).toBe(shipLog)
  })

  it("passes a Weekly Review record through unchanged", () => {
    expect(boundResult(weeklyReview, "Three posts.")).toBe(weeklyReview)
  })

  it("passes a Week Plan record through unchanged", () => {
    // The largest of the three in the real product, and still nowhere near
    // the cap. See `MAX_RESULT_BYTES`.
    expect(boundResult(weekPlan, "Drafted 2 posts.")).toBe(weekPlan)
    expect(JSON.stringify(weekPlan).length).toBeLessThan(MAX_RESULT_BYTES)
  })

  it("keeps a record that sits exactly on the cap", () => {
    // The boundary is inclusive. `{"a":"…"}` is eight characters of scaffolding
    // around the padding, all of them single-byte.
    const exact = { a: "x".repeat(MAX_RESULT_BYTES - 8) }
    expect(JSON.stringify(exact).length).toBe(MAX_RESULT_BYTES)
    expect(boundResult(exact, "Ran.")).toBe(exact)
  })
})

describe("boundResult — over the cap", () => {
  it("drops a record one byte too big to the truncation marker", () => {
    const oversize = { a: "x".repeat(MAX_RESULT_BYTES - 7) }
    expect(JSON.stringify(oversize).length).toBe(MAX_RESULT_BYTES + 1)
    expect(boundResult(oversize, "Drafted 2 posts.")).toEqual({
      truncated: true,
      summary: "Drafted 2 posts.",
    })
  })

  it("drops the handler that returned its drafts rather than their ids", () => {
    // The accident the cap exists for: a week of post bodies on a row that is
    // written once per subscription per fire, forever.
    const runaway = {
      drafted: Array.from({ length: 40 }, (_, i) => ({
        id: `dr_${i}`,
        body: "A paragraph nobody meant to keep. ".repeat(40),
      })),
    }

    expect(boundResult(runaway, "Drafted 40 posts.")).toEqual({
      truncated: true,
      summary: "Drafted 40 posts.",
    })
  })

  it("measures bytes rather than characters", () => {
    // Well under the cap in characters, well over it in UTF-8: every one of
    // these is two bytes. A cap on `.length` would let this through, and
    // Postgres stores the bytes.
    const accented = { a: "é".repeat(10_000) }
    expect(JSON.stringify(accented).length).toBeLessThan(MAX_RESULT_BYTES)
    expect(Buffer.byteLength(JSON.stringify(accented), "utf8")).toBeGreaterThan(
      MAX_RESULT_BYTES
    )
    expect(boundResult(accented, "Ran.")).toEqual({
      truncated: true,
      summary: "Ran.",
    })
  })

  it("bounds the summary it falls back to, the way the column is bounded", () => {
    const oversize = { a: "x".repeat(MAX_RESULT_BYTES) }
    const long = "y".repeat(900)

    expect(boundResult(oversize, long)).toEqual({
      truncated: true,
      summary: "y".repeat(500),
    })
  })
})

describe("boundResult — what will not serialise", () => {
  it("marks a cycle as truncated rather than throwing", () => {
    // A throw here would happen inside the receipt, after the work is done.
    // `recordRun`'s callers already treat a lost receipt as the lesser harm;
    // this makes sure they never have to.
    const cycle: Record<string, unknown> = { merges: 3 }
    cycle.self = cycle

    expect(() => boundResult(cycle, "Drafted one ship log.")).not.toThrow()
    expect(boundResult(cycle, "Drafted one ship log.")).toEqual({
      truncated: true,
      summary: "Drafted one ship log.",
    })
  })

  it("marks a BigInt as truncated rather than throwing", () => {
    // `BigInt(3)` rather than `3n`: tsconfig targets below ES2020.
    expect(boundResult({ merges: BigInt(3) }, "Ran.")).toEqual({
      truncated: true,
      summary: "Ran.",
    })
  })

  it("answers null for a value JSON has no word for", () => {
    // `JSON.stringify(() => {})` is `undefined` — not a failure, and not a
    // record either.
    expect(boundResult(() => {}, "Ran.")).toBeNull()
  })
})

describe("ceilingSkip", () => {
  it("lets a run through below the ceiling", () => {
    expect(ceilingSkip(RHYTHM_DAILY_CEILING_MICROS - 1)).toBeNull()
  })

  it("stops a run on the ceiling, and names both numbers", () => {
    const skip = ceilingSkip(RHYTHM_DAILY_CEILING_MICROS)

    // Both are in the sentence because neither is enough alone: a ceiling with
    // no spend beside it cannot be checked against /credits.
    expect(skip).toContain("$0.50")
    expect(skip).toMatch(/^Skipped —/)
  })

  it("reports the spend, not the ceiling, when it is over", () => {
    expect(ceilingSkip(1_234_567)).toContain("$1.23")
  })
})
