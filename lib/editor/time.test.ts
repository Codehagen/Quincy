import { describe, expect, it } from "vitest"

import {
  formatTimecode,
  frameToUs,
  invertRanges,
  mergeRanges,
  rangesOverlap,
  secondsToUs,
  snapToFrame,
  us,
  usToFrame,
} from "./time"

describe("secondsToUs", () => {
  it("converts a whole second", () => {
    expect(secondsToUs(1)).toBe(1_000_000)
  })

  it("survives the addition that float seconds get wrong", () => {
    // The entire reason this module exists: 0.1 + 0.2 is 0.30000000000000004,
    // and a timeline is thousands of these stacked. In integers it is exact.
    expect(secondsToUs(0.1) + secondsToUs(0.2)).toBe(secondsToUs(0.3))
  })

  it("does not drift over a thousand additions", () => {
    let total = 0
    for (let i = 0; i < 1000; i++) total += secondsToUs(0.033)
    expect(total).toBe(33_000_000)
  })
})

describe("usToFrame", () => {
  it("floors to the frame the instant is inside", () => {
    // One microsecond before frame 1 at 30fps is still frame 0. Rounding here
    // would make the scrub display jump a frame early.
    expect(usToFrame(us(33_332), 30)).toBe(0)
    expect(usToFrame(us(33_334), 30)).toBe(1)
  })

  it("round-trips a frame boundary", () => {
    expect(usToFrame(frameToUs(90, 30), 30)).toBe(90)
  })

  it("handles 29.97 without landing a frame short over a minute", () => {
    const oneMinute = us(60 * 1_000_000)
    expect(usToFrame(oneMinute, 29.97)).toBe(1798)
  })
})

describe("snapToFrame", () => {
  it("pulls a word timestamp onto the nearest frame", () => {
    // Deepgram says 2.32s; at 30fps the frames either side are 2.3s and
    // 2.3333s. Storing the raw value makes the renderer and the timeline
    // disagree about which frame is showing at the cut.
    expect(snapToFrame(secondsToUs(2.32) as never, 30)).toBe(2_333_333)
  })

  it("leaves a value already on a boundary alone", () => {
    const onBoundary = frameToUs(12, 30)
    expect(snapToFrame(onBoundary, 30)).toBe(onBoundary)
  })
})

describe("formatTimecode", () => {
  it("drops the hour on short-form lengths", () => {
    expect(formatTimecode(secondsToUs(12.4) as never)).toBe("00:12.400")
  })

  it("shows the hour once there is one", () => {
    expect(formatTimecode(secondsToUs(3661.5) as never)).toBe("01:01:01.500")
  })

  it("signs a negative offset rather than wrapping it", () => {
    expect(formatTimecode(secondsToUs(-2.25) as never)).toBe("-00:02.250")
  })
})

describe("rangesOverlap", () => {
  it("says no when two clips merely touch", () => {
    // Half-open, so a gapless track does not read as one long collision.
    const a = { startUs: us(0), endUs: us(1000) }
    const b = { startUs: us(1000), endUs: us(2000) }
    expect(rangesOverlap(a, b)).toBe(false)
  })

  it("says yes on a real overlap", () => {
    const a = { startUs: us(0), endUs: us(1500) }
    const b = { startUs: us(1000), endUs: us(2000) }
    expect(rangesOverlap(a, b)).toBe(true)
  })
})

describe("mergeRanges", () => {
  it("joins two silences separated by a dropped filler word", () => {
    // Adjacent gaps are the common case, not the exotic one. Cutting them
    // separately would strand a frame of audio between them.
    const merged = mergeRanges([
      { startUs: us(1000), endUs: us(2000) },
      { startUs: us(2000), endUs: us(3000) },
    ])
    expect(merged).toEqual([{ startUs: 1000, endUs: 3000 }])
  })

  it("keeps genuinely separate gaps apart", () => {
    const merged = mergeRanges([
      { startUs: us(0), endUs: us(1000) },
      { startUs: us(5000), endUs: us(6000) },
    ])
    expect(merged).toHaveLength(2)
  })

  it("sorts before merging, because detection order is not time order", () => {
    const merged = mergeRanges([
      { startUs: us(5000), endUs: us(6000) },
      { startUs: us(0), endUs: us(5000) },
    ])
    expect(merged).toEqual([{ startUs: 0, endUs: 6000 }])
  })
})

describe("invertRanges", () => {
  it("returns what survives after the cuts", () => {
    const keeps = invertRanges([{ startUs: us(1000), endUs: us(2000) }], {
      startUs: us(0),
      endUs: us(3000),
    })
    expect(keeps).toEqual([
      { startUs: 0, endUs: 1000 },
      { startUs: 2000, endUs: 3000 },
    ])
  })

  it("returns nothing when the cut covers everything", () => {
    const keeps = invertRanges([{ startUs: us(0), endUs: us(3000) }], {
      startUs: us(0),
      endUs: us(3000),
    })
    expect(keeps).toEqual([])
  })

  it("ignores cuts that fall outside the window", () => {
    const keeps = invertRanges([{ startUs: us(9000), endUs: us(9999) }], {
      startUs: us(0),
      endUs: us(3000),
    })
    expect(keeps).toEqual([{ startUs: 0, endUs: 3000 }])
  })
})
