import { describe, expect, it } from "vitest"

import { refineCuts } from "./refine-cuts"
import { us } from "./time"
import type { AudioPeaks, Word } from "./transcript"

const word = (text: string, start: number, end: number): Word => ({
  text,
  startUs: us(start * 1000),
  endUs: us(end * 1000),
  confidence: 1,
})

/** 10 ms a sample, loud everywhere except where `quiet` says. */
function peaks(lengthMs: number, quiet: [number, number][]): AudioPeaks {
  const values = Array.from({ length: lengthMs / 10 }, (_, index) =>
    quiet.some(([from, to]) => index * 10 >= from && index * 10 < to)
      ? 0.01
      : 0.8
  )
  return { intervalUs: us(10_000), values }
}

describe("refineCuts", () => {
  const words = [word("one", 0, 400), word("two", 1000, 1400)]
  const range = { startUs: us(520_000), endUs: us(880_000) }

  it("leaves the ranges alone without peaks", () => {
    expect(refineCuts([range], words, null)).toEqual([range])
  })

  it("moves an edge to the quiet nearby", () => {
    const [refined] = refineCuts(
      [range],
      words,
      peaks(2000, [
        [450, 460],
        [940, 950],
      ])
    )
    expect(refined.startUs).toBe(450_000)
    expect(refined.endUs).toBe(940_000)
  })

  it("never moves an edge into a word", () => {
    const tight = { startUs: us(420_000), endUs: us(980_000) }
    const [refined] = refineCuts(
      [tight],
      words,
      peaks(2000, [
        [380, 390],
        [1020, 1030],
      ])
    )
    expect(refined).toEqual(tight)
  })
})
