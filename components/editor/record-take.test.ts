import { describe, expect, it } from "vitest"

import {
  levelOf,
  pickRecorderType,
  scrollPixelsPerSecond,
  silentTooLong,
  takeFileName,
} from "./record-take"

describe("record take", () => {
  it("picks MP4 where it records, then WebM", () => {
    expect(pickRecorderType((type) => type === "video/mp4")).toBe("video/mp4")
    expect(pickRecorderType((type) => type.startsWith("video/webm"))).toBe(
      "video/webm;codecs=vp9,opus"
    )
    expect(pickRecorderType(() => false)).toBeNull()
  })

  it("names the take for when it was made", () => {
    expect(
      takeFileName("video/webm;codecs=vp9", new Date("2026-11-19T10:05:00Z"))
    ).toBe("Take 2026-11-19 10.05.webm")
    expect(takeFileName("video/mp4", new Date("2026-11-19T10:05:00Z"))).toMatch(
      /\.mp4$/
    )
  })

  it("scrolls faster for a faster pace and a bigger font", () => {
    expect(scrollPixelsPerSecond(140, 32)).toBeCloseTo(
      (140 / 60 / 7) * 32 * 1.4
    )
    expect(scrollPixelsPerSecond(180, 32)).toBeGreaterThan(
      scrollPixelsPerSecond(140, 32)
    )
  })

  it("hears silence and sound", () => {
    expect(levelOf(new Uint8Array(64).fill(128))).toBe(0)
    expect(levelOf(new Uint8Array([0, 255, 0, 255]))).toBeGreaterThan(0.9)
    expect(silentTooLong(null, 10_000)).toBe(false)
    expect(silentTooLong(1000, 3500)).toBe(false)
    expect(silentTooLong(1000, 4000)).toBe(true)
  })
})
