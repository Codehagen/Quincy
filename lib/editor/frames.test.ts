import { describe, expect, it } from "vitest"

import { durationInFrames, framesFor, usForFrame } from "./frames"
import { secondsToUs, us } from "./time"

describe("framesFor", () => {
  it("converts on the frame grid", () => {
    expect(framesFor(secondsToUs(1), 30)).toBe(30)
    expect(framesFor(secondsToUs(0.5), 30)).toBe(15)
  })

  it("rounds rather than floors", () => {
    // A clip 2.999 frames long is three frames of picture. Flooring loses the
    // last one at every cut, which reads as the edit being a frame tight
    // everywhere — the most annoying possible kind of wrong.
    expect(framesFor(99_967, 30)).toBe(3)
  })

  it("survives a round trip at frame boundaries", () => {
    for (const frame of [0, 1, 29, 30, 451]) {
      expect(framesFor(usForFrame(frame, 30), 30)).toBe(frame)
    }
  })
})

describe("durationInFrames", () => {
  it("never returns zero", () => {
    // Remotion treats a zero-length sequence as an error, and a 10ms sliver at
    // 30fps rounds to nothing. One frame is the shortest thing showable.
    expect(durationInFrames(us(10_000), 30)).toBe(1)
    expect(durationInFrames(us(0), 30)).toBe(1)
  })

  it("is the real length when there is one", () => {
    expect(durationInFrames(secondsToUs(2), 30)).toBe(60)
  })
})
