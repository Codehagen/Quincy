import { describe, expect, it } from "vitest"

import { paceOf, seedOf, wordDeltas } from "./pace"

describe("paceOf", () => {
  it("waits like a model at the realistic pace", () => {
    const pace = paceOf("realistic", 7)
    expect(pace.thinkMs).toBe(1200)
    for (let i = 0; i < 50; i++) {
      const gap = pace.betweenMs()
      expect(gap).toBeGreaterThanOrEqual(600)
      expect(gap).toBeLessThanOrEqual(900)
    }
  })

  it("is the same run for the same seed", () => {
    const a = paceOf("realistic", 42)
    const b = paceOf("realistic", 42)
    expect([a.betweenMs(), a.betweenMs(), a.betweenMs()]).toEqual([b.betweenMs(), b.betweenMs(), b.betweenMs()])
  })

  it("moves the jitter on between gaps", () => {
    const pace = paceOf("realistic", 3)
    const gaps = new Set(Array.from({ length: 6 }, () => pace.betweenMs()))
    expect(gaps.size).toBeGreaterThan(1)
  })

  it("keeps the old back-to-back stream at none", () => {
    const pace = paceOf("none")
    expect(pace.thinkMs).toBe(0)
    expect(pace.betweenMs()).toBe(40)
  })

  it("is slower than realistic at slow", () => {
    expect(paceOf("slow").thinkMs).toBeGreaterThan(paceOf("realistic").thinkMs)
    expect(paceOf("slow").wordMs).toBeGreaterThan(paceOf("realistic").wordMs)
  })
})

describe("seedOf and wordDeltas", () => {
  it("seeds differently per name", () => {
    expect(seedOf("A")).not.toBe(seedOf("B"))
    expect(seedOf("A")).toBe(seedOf("A"))
  })

  it("splits a line into the deltas that join back to it", () => {
    const line = "Took out the long pauses.  The um stays."
    expect(wordDeltas(line).join("")).toBe(line)
    expect(wordDeltas(line)).toHaveLength(8)
  })
})
