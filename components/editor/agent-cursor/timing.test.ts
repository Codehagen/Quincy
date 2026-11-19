import { describe, expect, it } from "vitest"

import { aimed, type EditOp } from "@/lib/editor/ops"
import { us } from "@/lib/editor/time"

import { beatTarget, dragMs, fitApproach, gapMs, glideMs, removedUs, TIMING } from "./timing"

/** The locked numbers (plans/036), at piece 52's pace of 1.3. */
describe("the cursor's timing", () => {
  it("glides distance / 4, clamped to 110–220 ms, at 52's pace", () => {
    expect(glideMs(0)).toBe(0)
    expect(glideMs(100)).toBe(Math.round(110 * 1.3))
    expect(glideMs(600)).toBe(Math.round(150 * 1.3))
    expect(glideMs(5000)).toBe(Math.round(220 * 1.3))
  })

  it("drags 90–160 ms by width", () => {
    expect(dragMs(10)).toBe(Math.round(90 * 1.3))
    expect(dragMs(1000)).toBe(Math.round(160 * 1.3))
  })

  it("never keeps a change waiting more than one press for its approach", () => {
    const { glide, drag } = fitApproach(286, 208)
    expect(glide + drag).toBeLessThanOrEqual(TIMING.approachMaxMs + 1)
    expect(fitApproach(100, 100)).toEqual({ glide: 100, drag: 100 })
  })

  it("shrinks the gaps through the run, never uniform", () => {
    const gaps = [0, 1, 2, 3, 4, 5].map((i) => gapMs(i, 0))
    expect(gaps[0]).toBe(Math.round(140 * 1.3))
    expect(gaps[4]).toBe(Math.round(60 * 1.3))
    expect(new Set(gaps.slice(0, 5)).size).toBe(5)
    // A long queue runs at the shortest gap.
    expect(gapMs(0, 10)).toBe(Math.round(60 * 1.3))
  })

  it("reads a batch's target and what it removes", () => {
    const ops: EditOp[] = aimed([{ op: "rename", name: "x" }], {
      action: "cut",
      kind: "range",
      trackId: "t",
      spans: [
        { startUs: us(1_000_000), endUs: us(1_400_000) },
        { startUs: us(3_000_000), endUs: us(3_500_000) },
      ],
    })
    expect(beatTarget(ops)?.kind).toBe("range")
    expect(removedUs(beatTarget(ops))).toBe(900_000)
    expect(removedUs(null)).toBe(0)
  })
})
