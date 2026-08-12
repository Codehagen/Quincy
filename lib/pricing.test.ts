import { describe, expect, it } from "vitest"

import { estimateCostMicros, formatMicros } from "@/lib/pricing"

const MODEL = "anthropic/claude-sonnet-5"

describe("estimateCostMicros", () => {
  it("is zero for a turn that consumed nothing", () => {
    expect(
      estimateCostMicros(MODEL, {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      })
    ).toBe(0)
  })

  it("prices a million input tokens at the input rate", () => {
    expect(
      estimateCostMicros(MODEL, {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 0,
      })
    ).toBe(2_000_000)
  })

  it("prices a million output tokens at the output rate", () => {
    expect(
      estimateCostMicros(MODEL, {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
      })
    ).toBe(10_000_000)
  })

  it("charges cached input at a fraction of fresh input", () => {
    const fresh = estimateCostMicros(MODEL, {
      inputTokens: 100_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    })
    const cached = estimateCostMicros(MODEL, {
      inputTokens: 0,
      cachedInputTokens: 100_000,
      outputTokens: 0,
    })

    // The exact ratio is a pricing detail; that cached is much cheaper is the
    // property worth pinning, because getting it wrong overstates every
    // cached turn.
    expect(cached).toBeLessThan(fresh / 5)
  })

  it("falls back to a known rate for an unrecognised model", () => {
    expect(
      estimateCostMicros("some/model-we-have-never-seen", {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 0,
      })
    ).toBeGreaterThan(0)
  })

  it("returns whole micros, never a fraction", () => {
    const cost = estimateCostMicros(MODEL, {
      inputTokens: 7,
      cachedInputTokens: 3,
      outputTokens: 11,
    })

    expect(Number.isInteger(cost)).toBe(true)
  })
})

describe("formatMicros", () => {
  it("renders micro-dollars as money", () => {
    expect(formatMicros(1_234_567)).toBe("$1.23")
    expect(formatMicros(0)).toBe("$0.00")
  })
})
