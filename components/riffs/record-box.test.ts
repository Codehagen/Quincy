import { describe, expect, it } from "vitest"

import {
  downsampleLevels,
  formatElapsed,
  microphoneFailureMessage,
} from "./record-box"

/**
 * The component itself is not rendered here — vitest runs
 * `environment: "node"` and this repo has no DOM test setup. What is pulled
 * out and tested is the pure judgment inside it: which sentence a person sees
 * when the microphone does not open, and how the timer reads.
 *
 * Both were found by /qa on 2026-08-08 rather than by a test, which is the
 * argument for having one.
 */

describe("microphoneFailureMessage", () => {
  /**
   * Regression: ISSUE-001 — an insecure origin said "Could not open the
   * microphone", which is true and useless.
   * Found by /qa on 2026-08-08.
   *
   * `navigator.mediaDevices` is undefined on a non-https origin, so nothing
   * throws and there is no error name to branch on. This is the walk-and-talk
   * feature: the phone is the primary device, and the ordinary way to reach it
   * from a phone is `http://192.168.x.x:3000`. Localhost is exempt from the
   * secure-origin rule, which is precisely why this never shows up on the
   * machine doing the building.
   */
  it("names the origin when the API is missing and the page is insecure", () => {
    const message = microphoneFailureMessage(null, false)

    expect(message).toMatch(/secure connection/i)
    expect(message).toMatch(/https/i)
  })

  it("blames the browser, not the origin, when the page is already secure", () => {
    // Same missing API, opposite cause. Telling somebody on https to "use
    // https" is the kind of advice that makes people stop reading messages.
    expect(microphoneFailureMessage(null, true)).toBe(
      "This browser cannot record audio."
    )
  })

  it("points at the address bar when permission was refused", () => {
    // Nothing the app does can re-prompt once the browser remembers a no, so
    // a "try again" that just re-runs the same call would be a lie.
    const message = microphoneFailureMessage({ name: "NotAllowedError" }, true)

    expect(message).toMatch(/address bar/i)
  })

  it("says there is no microphone when there is no microphone", () => {
    expect(microphoneFailureMessage({ name: "NotFoundError" }, true)).toBe(
      "No microphone found."
    )
  })

  it("recognises a browser with no media stack", () => {
    // Measured from headless Chromium during /qa, which answers
    // NotSupportedError rather than NotFoundError.
    expect(microphoneFailureMessage({ name: "NotSupportedError" }, true)).toBe(
      "This browser cannot record audio."
    )
  })

  it("tells you to close the other app when the device is busy", () => {
    const message = microphoneFailureMessage({ name: "NotReadableError" }, true)

    expect(message).toMatch(/something else is using/i)
  })

  it("falls back without guessing at an unknown error", () => {
    expect(microphoneFailureMessage({ name: "WeirdNewError" }, true)).toBe(
      "Could not open the microphone."
    )
    // An error with no name at all must not crash the branch.
    expect(microphoneFailureMessage({}, true)).toBe(
      "Could not open the microphone."
    )
  })
})

describe("formatElapsed", () => {
  it("pads the seconds so the timer does not jump width", () => {
    expect(formatElapsed(0)).toBe("0:00")
    expect(formatElapsed(9)).toBe("0:09")
    expect(formatElapsed(61)).toBe("1:01")
  })

  it("counts past ten minutes, which is the ceiling", () => {
    // MAX_AUDIO_SECONDS is 600. The recorder stops itself there, so this is
    // the last value the clock should ever render.
    expect(formatElapsed(600)).toBe("10:00")
  })
})

/**
 * The waveform the review step draws.
 *
 * Added with the review step (decided from /prototypes/record, 2026-08-08).
 * Worth testing because it is the one piece of that step that is arithmetic
 * rather than markup, and because getting it wrong is invisible: a waveform
 * drawn from the wrong buckets still looks like a waveform.
 */
describe("downsampleLevels", () => {
  it("averages each bucket rather than sampling one reading from it", () => {
    // Four readings into two bars. Sampling every other one would answer
    // [1, 0] and draw a recording that was loud then silent; it was neither.
    expect(downsampleLevels([1, 0, 1, 0], 2)).toEqual([0.5, 0.5])
  })

  it("keeps loud and quiet stretches apart", () => {
    const source = [...Array(50).fill(0.9), ...Array(50).fill(0.1)]
    const [loud, quiet] = downsampleLevels(source, 2)

    expect(loud).toBeCloseTo(0.9)
    expect(quiet).toBeCloseTo(0.1)
  })

  it("returns a full flat row when nothing was captured", () => {
    // A recorder that never produced a frame must still draw its 56 bars —
    // an empty array renders as no waveform at all, which reads as a broken
    // review step rather than as a silent take.
    expect(downsampleLevels([], 56)).toHaveLength(56)
    expect(downsampleLevels([], 56).every((level) => level === 0)).toBe(true)
  })

  it("does not divide by zero when there are fewer readings than bars", () => {
    // A take shorter than one meter frame. Every bar must still be a number:
    // NaN in a transform is a bar that vanishes.
    const bars = downsampleLevels([0.5], 8)

    expect(bars).toHaveLength(8)
    expect(bars.every((level) => Number.isFinite(level))).toBe(true)
  })

  it("asks for no bars and gets none", () => {
    expect(downsampleLevels([0.4, 0.6], 0)).toEqual([])
  })
})
