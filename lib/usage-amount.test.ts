import { describe, expect, it } from "vitest"

import { formatSeconds, usageAmount } from "./usage-amount"

describe("usageAmount", () => {
  it("reads a model turn as tokens", () => {
    expect(
      usageAmount({
        model: "anthropic/claude-sonnet-5",
        inputTokens: 1200,
        outputTokens: 80,
      })
    ).toBe("1,200 in · 80 out")
  })

  it("reads a Deepgram row as seconds of audio", () => {
    expect(
      usageAmount({
        model: "deepgram:transcribe",
        inputTokens: 125,
        outputTokens: 0,
      })
    ).toBe("2m 05s of audio")
  })

  it("shows nothing for a label that bought no tokens", () => {
    expect(
      usageAmount({ model: "x:post", inputTokens: 0, outputTokens: 0 })
    ).toBeNull()
  })
})

describe("formatSeconds", () => {
  it("stays in seconds under a minute", () => {
    expect(formatSeconds(42)).toBe("42s")
  })
})
