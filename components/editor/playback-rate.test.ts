import { describe, expect, it } from "vitest"

import { cycleRate, rateLabel, stepRate } from "./playback-rate"

describe("playback rate", () => {
  it("steps and holds at the ends", () => {
    expect(stepRate(1, 1)).toBe(1.25)
    expect(stepRate(1, -1)).toBe(0.5)
    expect(stepRate(0.5, -1)).toBe(0.5)
    expect(stepRate(2, 1)).toBe(2)
  })

  it("cycles back to the slowest", () => {
    expect(cycleRate(2)).toBe(0.5)
    expect(cycleRate(1)).toBe(1.25)
    expect(rateLabel(1.5)).toBe("1.5×")
  })
})
