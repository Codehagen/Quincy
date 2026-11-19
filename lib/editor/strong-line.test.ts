import { beforeEach, describe, expect, it, vi } from "vitest"

import { STRONG_LINE_KEY } from "./reading"

/**
 * The strong line's money guards: at most one model call per asset (the
 * claim on the asset row), a usage row for every call made (failed ones
 * too), the cached line read for free, and no call for a take too short to
 * choose from. The database is a fake that holds one asset's claim.
 */

const mocks = vi.hoisted(() => ({
  claimed: false,
  settled: 0,
  rows: [] as { conversationId: string; model: string; inputTokens: number }[],
  generate: vi.fn(),
  order: [] as string[],
  recordFails: false,
}))

vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: () => ({
        where: () => ({
          // The claim: only the first caller finds no slot.
          returning: async () => {
            if (mocks.claimed) return []
            mocks.claimed = true
            return [{ id: "va-1" }]
          },
          // The settle, awaited without `returning`.
          then: (resolve: (v: unknown) => void) => {
            mocks.settled++
            mocks.order.push("settle")
            resolve(undefined)
          },
        }),
      }),
    }),
  },
}))
vi.mock("@/lib/usage", () => ({
  recordUsage: async (row: { conversationId: string; model: string; inputTokens: number }) => {
    mocks.order.push("record")
    if (mocks.recordFails) throw new Error("db down")
    mocks.rows.push(row)
  },
}))
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generate,
}))

const { fillStrongLine, STRONG_LINE_MODEL, candidateSentences, isStalePending, MAX_SENTENCES } = await import(
  "./strong-line"
)

function deepgram(texts: string[]) {
  const words = texts.flatMap((sentence, s) =>
    sentence.split(" ").map((word, w) => ({
      word,
      punctuated_word: word,
      start: s * 3 + w * 0.3,
      end: s * 3 + w * 0.3 + 0.25,
      confidence: 1,
    }))
  )
  return { results: { channels: [{ alternatives: [{ words }] }] } }
}

const TAKE = deepgram(["I shipped it.", "Nobody came.", "Then one person wrote back."])

beforeEach(() => {
  mocks.claimed = false
  mocks.settled = 0
  mocks.rows.length = 0
  mocks.order.length = 0
  mocks.recordFails = false
  mocks.generate.mockReset()
  mocks.generate.mockResolvedValue({
    output: { index: 2 },
    usage: { inputTokens: 120, outputTokens: 3 },
  })
})

describe("fillStrongLine", () => {
  it("chooses a sentence of the take, metered", async () => {
    const line = await fillStrongLine({ id: "va-1", userId: "u-1", transcript: TAKE })
    expect(line).toBe("Then one person wrote back.")
    expect(mocks.rows).toEqual([
      expect.objectContaining({ conversationId: "strong-line:va-1", model: STRONG_LINE_MODEL, inputTokens: 120 }),
    ])
    expect(mocks.settled).toBe(1)
  })

  it("is called at most once per asset, even by two requests at once", async () => {
    const asset = { id: "va-1", userId: "u-1", transcript: TAKE }
    await Promise.all([fillStrongLine(asset), fillStrongLine(asset)])
    await fillStrongLine(asset)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.rows).toHaveLength(1)
  })

  it("reads a cached line for free", async () => {
    const cached = { ...TAKE, [STRONG_LINE_KEY]: { state: "done", line: "Nobody came." } }
    expect(await fillStrongLine({ id: "va-1", userId: "u-1", transcript: cached })).toBe("Nobody came.")
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it("never retries after a failed call, and the failure is metered", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("down"))
    expect(await fillStrongLine({ id: "va-1", userId: "u-1", transcript: TAKE })).toBeNull()
    expect(mocks.rows).toHaveLength(1)
    const failed = { ...TAKE, [STRONG_LINE_KEY]: { state: "failed" } }
    expect(await fillStrongLine({ id: "va-1", userId: "u-1", transcript: failed })).toBeNull()
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it("settles the claim before metering, so a failed meter cannot leave it pending", async () => {
    mocks.recordFails = true
    expect(await fillStrongLine({ id: "va-1", userId: "u-1", transcript: TAKE })).toBe("Then one person wrote back.")
    expect(mocks.order).toEqual(["settle", "record"])
  })

  it("takes a pending claim again once it is a minute old, and not before", async () => {
    const fresh = { ...TAKE, [STRONG_LINE_KEY]: { state: "pending", at: new Date().toISOString() } }
    expect(await fillStrongLine({ id: "va-1", userId: "u-1", transcript: fresh })).toBeNull()
    expect(mocks.generate).not.toHaveBeenCalled()

    const dead = { ...TAKE, [STRONG_LINE_KEY]: { state: "pending", at: new Date(Date.now() - 61_000).toISOString() } }
    expect(await fillStrongLine({ id: "va-1", userId: "u-1", transcript: dead })).toBe("Then one person wrote back.")
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it("treats a pending claim with no stamp as dead", () => {
    expect(isStalePending(undefined)).toBe(true)
    expect(isStalePending(new Date().toISOString())).toBe(false)
  })

  it("makes no call for a one-sentence take", async () => {
    const short = deepgram(["Just this."])
    expect(await fillStrongLine({ id: "va-1", userId: "u-1", transcript: short })).toBeNull()
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.rows).toHaveLength(0)
  })

  it("caps what one call reads", () => {
    const long = deepgram(Array.from({ length: 200 }, (_, i) => `Line number ${i}.`))
    expect(candidateSentences(long)).toHaveLength(MAX_SENTENCES)
  })
})
