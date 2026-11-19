import { describe, expect, it } from "vitest"

import type { TakeReading } from "@/lib/editor/reading"

import {
  ARRIVAL,
  ARRIVAL_TOTAL_MS,
  MILESTONES,
  passDoneMs,
  passStartMs,
  passState,
  REVEAL_MS,
  scanPasses,
  sweepStops,
} from "./passes"

const reading: TakeReading = {
  durationUs: 37_000_000,
  words: 62,
  speakers: 1,
  pauses: { count: 2, totalUs: 4_600_000 },
  fillers: { count: 1, byWord: { um: 1 } },
  firstLine: "I built a thing.",
  strongLine: "The screens weren't the product.",
}

describe("the arrival's timeline", () => {
  it("starts each pass just before the one before it settles", () => {
    expect(passStartMs(1)).toBeLessThan(passDoneMs(0))
    expect(passDoneMs(0) - passStartMs(1)).toBe(100)
  })

  it("runs about two seconds, entrance included", () => {
    expect(ARRIVAL_TOTAL_MS).toBeGreaterThanOrEqual(1600)
    expect(ARRIVAL_TOTAL_MS).toBeLessThanOrEqual(2200)
    expect(ARRIVAL_TOTAL_MS - REVEAL_MS).toBe(ARRIVAL.enterMs)
  })

  it("reads one pass at a time, in order", () => {
    expect(passState(0, 0)).toBe("reading")
    expect(passState(1, 0)).toBe("waiting")
    expect(passState(0, passDoneMs(0))).toBe("done")
    expect(passState(2, REVEAL_MS)).toBe("done")
  })

  it("steps on sorted, distinct milestones that end with the reveal", () => {
    expect([...MILESTONES]).toEqual([...MILESTONES].sort((a, b) => a - b))
    expect(new Set(MILESTONES).size).toBe(MILESTONES.length)
    expect(MILESTONES.at(-1)).toBe(REVEAL_MS)
  })

  it("sweeps a third of the lane per pass, reached as that pass resolves", () => {
    const stops = sweepStops()
    expect(stops[0]).toEqual({ offset: 0, at: 0 })
    expect(stops.at(-1)).toEqual({ offset: 1, at: 1 })
    expect(stops[1].offset).toBeCloseTo(passDoneMs(0) / passDoneMs(2))
  })
})

describe("scanPasses", () => {
  it("says what the reading and the file say", () => {
    const [words, picture, delivery] = scanPasses(reading, { width: 768, height: 432, fps: 24 })
    expect(words.found).toBe("62 words, one voice")
    expect(picture.found).toBe("Shot wide, 16:9 at 24 fps")
    expect(delivery.found).toBe("2 long pauses, one filler, the strong line")
  })

  it("turns a phone recording before naming its shape", () => {
    const [, picture] = scanPasses(reading, { width: 1920, height: 1080, rotation: 90, fps: null })
    expect(picture.found).toBe("Shot vertical, 9:16")
  })

  it("claims nothing it does not know", () => {
    const quiet: TakeReading = { ...reading, words: 0, pauses: { count: 0, totalUs: 0 }, fillers: { count: 0, byWord: {} }, strongLine: null }
    const [words, picture, delivery] = scanPasses(quiet, { width: null, height: null, fps: null })
    expect(words.found).toBe("37.0 s, no words")
    expect(picture.found).toBe("One recording")
    expect(delivery.found).toBe("No long pauses")
  })
})
