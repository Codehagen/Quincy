import { describe, expect, it } from "vitest"

import { cooldownDecision } from "./cooldown"

const NOW = Date.parse("2026-11-16T12:00:00Z")

describe("cooldownDecision", () => {
  it("is ready when nothing was ever started", () => {
    expect(cooldownDecision(null, 60_000, NOW)).toEqual({ ready: true })
  })

  it("is ready once the whole window has passed", () => {
    expect(cooldownDecision(new Date(NOW - 60_000), 60_000, NOW)).toEqual({
      ready: true,
    })
  })

  it("refuses inside the window and says how long is left, rounded up", () => {
    expect(cooldownDecision(new Date(NOW - 10_500), 60_000, NOW)).toEqual({
      ready: false,
      secondsLeft: 50,
    })
  })

  it("never says zero seconds while still refusing", () => {
    expect(cooldownDecision(new Date(NOW - 59_999), 60_000, NOW)).toEqual({
      ready: false,
      secondsLeft: 1,
    })
  })
})
