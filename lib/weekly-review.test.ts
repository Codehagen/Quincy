import { readFileSync } from "node:fs"

import { describe, expect, it, vi } from "vitest"

const generateObject = vi.hoisted(() => vi.fn())
const generateText = vi.hoisted(() => vi.fn())

/**
 * The whole point of 4b is that it does not spend.
 *
 * Mocked rather than asserted on a dep, because there is no model dep to
 * assert on — the module never imports one, and this is the test that keeps it
 * that way. A future edit that reaches for `generateObject` to phrase the
 * sentence more nicely fails here rather than on the bill.
 */
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateObject,
  generateText,
}))

import {
  NO_WORK,
  MAX_MESSAGE_CHARS,
  reviewMessage,
  runWeeklyReview,
  workedFrom,
  type PostedFact,
  type WeeklyReviewDeps,
} from "./weekly-review"

const posted = (over: Partial<PostedFact> = {}): PostedFact => ({
  count: 0,
  channels: [],
  waiting: 0,
  oldest: null,
  ...over,
})

describe("workedFrom", () => {
  it("splits the week against the median, with the median itself below", () => {
    // Equality does not support "above", which is the claim being made.
    const worked = workedFrom([2_000, 1_000, 400], 1_000, "live")

    expect(worked).toEqual({
      measured: 3,
      above: 1,
      below: 2,
      median: 1_000,
      baseline: "live",
      best: 2_000,
    })
  })

  it("reports no baseline when the median is zero rather than dividing by it", () => {
    expect(workedFrom([120], 0, "corpus").baseline).toBe("none")
  })

  it("is the empty answer when nothing was measured", () => {
    expect(workedFrom([], 900, "live")).toEqual(NO_WORK)
  })
})

describe("reviewMessage", () => {
  it("names the oldest approved draft when nothing went out", () => {
    const message = reviewMessage(
      posted({
        waiting: 3,
        oldest: {
          idea: "What a merge costs to read",
          approvedAt: new Date("2026-08-12T10:00:00Z"),
        },
      }),
      NO_WORK
    )

    expect(message).toBe(
      'Nothing went out this week. "What a merge costs to read" has been approved since 12 August and still has no time. 2 other approved drafts are waiting behind it.'
    )
  })

  it("says so when nothing went out and nothing was ready either", () => {
    expect(reviewMessage(posted(), NO_WORK)).toBe(
      "Nothing went out this week. Nothing is approved and waiting either."
    )
  })

  it("states the two facts separately when posts went out", () => {
    const message = reviewMessage(
      posted({ count: 3, channels: ["LinkedIn", "X"], waiting: 4 }),
      workedFrom([4_100, 800], 1_240, "live")
    )

    expect(message).toBe(
      "3 posts went out this week, on LinkedIn and X. 4 approved drafts have no time. 2 of them have a reading: 1 above your 30-day median of 1,240 impressions, 1 below. The best did 4,100."
    )
  })

  it("names the corpus median when nothing has been measured live", () => {
    const message = reviewMessage(
      posted({ count: 1, channels: ["X"] }),
      workedFrom([300], 900, "corpus")
    )

    expect(message).toContain("your corpus median of 900 impressions")
  })

  it("says the readings are missing rather than reporting a zero", () => {
    const message = reviewMessage(
      posted({ count: 2, channels: ["X"] }),
      NO_WORK
    )

    expect(message).toContain("None of them has a reading yet.")
    expect(message).not.toContain("0")
  })

  it("never congratulates and never advises", () => {
    const message = reviewMessage(
      posted({ count: 5, channels: ["X"], waiting: 1 }),
      workedFrom([9_000, 8_000, 7_000, 6_000, 5_000], 1_000, "live")
    )

    for (const tell of [
      "great",
      "well done",
      "nice",
      "keep",
      "try",
      "should",
      "consider",
    ]) {
      expect(message.toLowerCase()).not.toContain(tell)
    }
  })

  it("stays inside the ceiling even when every fact is long", () => {
    const message = reviewMessage(
      posted({
        waiting: 40,
        oldest: {
          idea: "x".repeat(2_000),
          approvedAt: new Date("2026-01-02T00:00:00Z"),
        },
      }),
      NO_WORK
    )

    expect(message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS)
  })
})

/* ── The run ──────────────────────────────────────────────────────────────── */

const reading = (externalId: string, impressions: number) => ({
  sourceItemId: "",
  channel: "x" as const,
  externalId,
  capturedAt: new Date("2026-08-27T06:00:00Z"),
  impressions,
  likes: 1,
  replies: 0,
  reposts: 0,
  bookmarks: 0,
  quotes: 0,
})

function stubs(overrides: Partial<WeeklyReviewDeps> = {}) {
  return {
    published: vi.fn(async () => [
      {
        channel: "x",
        channelLabel: "X",
        externalId: "t1",
        publishedAt: new Date("2026-08-25T08:00:00Z"),
      },
    ]),
    waiting: vi.fn(async () => []),
    readings: vi.fn(async () => [reading("t1", 3_000), reading("t2", 500)]),
    corpusMedian: vi.fn(async () => 900),
    remember: vi.fn(async () => true),
    ...overrides,
  } satisfies WeeklyReviewDeps
}

describe("runWeeklyReview", () => {
  it("buys nothing", async () => {
    await runWeeklyReview({ userId: "u1", deps: stubs() })

    expect(generateObject).not.toHaveBeenCalled()
    expect(generateText).not.toHaveBeenCalled()
  })

  it("does not even import a model client", () => {
    // The mock above proves nothing was called on this path. This proves the
    // module has no path to call one at all.
    const source = readFileSync("lib/weekly-review.ts", "utf8")

    expect(source).not.toMatch(/from "ai"/)
  })

  it("judges the week against the live median, not the corpus one", async () => {
    const deps = stubs()
    const review = await runWeeklyReview({ userId: "u1", deps })

    // Two readings, medians 3,000 and 500 → 1,750. One post this week, at
    // 3,000, which is above it.
    expect(review.worked).toEqual({
      measured: 1,
      above: 1,
      below: 0,
      median: 1_750,
      baseline: "live",
      best: 3_000,
    })
    expect(deps.corpusMedian).not.toHaveBeenCalled()
  })

  it("falls back to the corpus median only when nothing has been measured", async () => {
    const deps = stubs({
      readings: vi.fn(async () => []),
    })

    const review = await runWeeklyReview({ userId: "u1", deps })

    // No readings at all means no impressions to judge, so there is nothing to
    // compare and the corpus is not read either.
    expect(review.worked).toEqual(NO_WORK)
    expect(deps.corpusMedian).not.toHaveBeenCalled()
  })

  it("counts what went out and what is approved separately", async () => {
    const review = await runWeeklyReview({
      userId: "u1",
      deps: stubs({
        waiting: vi.fn(async () => [
          {
            idea: "The first one",
            approvedAt: new Date("2026-08-10T09:00:00Z"),
          },
          { idea: "The second", approvedAt: new Date("2026-08-20T09:00:00Z") },
        ]),
      }),
    })

    expect(review.posted.count).toBe(1)
    expect(review.posted.channels).toEqual(["X"])
    expect(review.posted.waiting).toBe(2)
    expect(review.posted.oldest?.idea).toBe("The first one")
  })

  it("writes the message to the ledger as a fact", async () => {
    const remember = vi.fn(async () => true)
    const review = await runWeeklyReview({
      userId: "u1",
      timezone: "Europe/Oslo",
      deps: stubs({ remember }),
    })

    expect(review.remembered).toBe(true)
    expect(remember).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ text: review.message, timezone: "Europe/Oslo" })
    )
  })

  it("keeps the message when the ledger write fails", async () => {
    const review = await runWeeklyReview({
      userId: "u1",
      deps: stubs({
        remember: vi.fn(async () => {
          throw new Error("brain page invariant")
        }),
      }),
    })

    expect(review.remembered).toBe(false)
    expect(review.message).toContain("went out this week")
  })
})
