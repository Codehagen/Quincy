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

describe("a model with its own rate", () => {
  const FLASH = "deepseek/deepseek-v4-flash-0731"

  it("prices Luna from the gateway's rate", () => {
    // $0.20 in / $1.20 out per million.
    expect(
      estimateCostMicros("openai/gpt-5.6-luna", {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
      })
    ).toBe(1_400_000)
  })

  it("prices DeepSeek at its own rate, not at the fallback", () => {
    // 1M input + 1M output at the gateway's $0.20 / $0.40 = $0.60 = 600_000
    // micros. Priced through the fallback it would be $12.00, which is the
    // number that would silently lock a user out of a $10 day.
    expect(
      estimateCostMicros(FLASH, {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
      })
    ).toBe(600_000)
  })

  it("prices the floating alias the same as the pinned one", () => {
    const usage = {
      inputTokens: 10_000,
      cachedInputTokens: 0,
      outputTokens: 2_000,
    }

    // Pinning or unpinning the date must not also be a pricing change.
    expect(estimateCostMicros("deepseek/deepseek-v4-flash", usage)).toBe(
      estimateCostMicros(FLASH, usage)
    )
  })

  it("falls back to the dearest rate for a model nobody priced", () => {
    const usage = {
      inputTokens: 1_000,
      cachedInputTokens: 0,
      outputTokens: 1_000,
    }

    // Of the two ways to be wrong, only over-reporting is recoverable: it
    // trips the ceiling early and loudly instead of spending quietly.
    expect(estimateCostMicros("someone/unpriced-model", usage)).toBe(
      estimateCostMicros("anthropic/claude-sonnet-5", usage)
    )
  })
})
