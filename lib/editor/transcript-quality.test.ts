import { describe, expect, it } from "vitest"

import { us } from "./time"
import type { AudioPeaks, Word } from "./transcript"
import {
  looksMistranscribed,
  voicedSeconds,
  wordDensity,
} from "./transcript-quality"

/**
 * The real numbers from the recording that prompted this.
 *
 * Fifteen seconds of Norwegian: peaks topping out at 0.108 with 261 of 751
 * frames carrying speech. Asked for English it came back as two words; asked
 * for Norwegian, twenty-six.
 */
function peaks({
  loud,
  quiet,
  intervalUs = 20_000,
}: {
  loud: number
  quiet: number
  intervalUs?: number
}): AudioPeaks {
  return {
    intervalUs: us(intervalUs),
    values: [
      ...Array.from({ length: loud }, () => 0.06),
      ...Array.from({ length: quiet }, () => 0.003),
    ],
  }
}

const words = (count: number): Word[] =>
  Array.from({ length: count }, (_, i) => ({
    text: `w${i}`,
    startUs: us(i * 100_000),
    endUs: us(i * 100_000 + 90_000),
    confidence: 0.9,
  }))

describe("voicedSeconds", () => {
  it("measures against the recording's own loudest moment", () => {
    // A phone at arm's length peaks around 0.1. Judged against full scale this
    // whole take reads as silence, which is the mistake the waveform made when
    // it drew every bar at the 4% floor.
    expect(voicedSeconds(peaks({ loud: 261, quiet: 490 }))).toBeCloseTo(5.22, 1)
  })

  it("does not count hiss on a track with no voice", () => {
    // Everything quiet and nothing loud: relative thresholding alone would
    // call the loudest hiss "voice", which is what the absolute floor stops.
    const hiss: AudioPeaks = {
      intervalUs: us(20_000),
      values: Array.from({ length: 500 }, () => 0.004),
    }

    expect(voicedSeconds(hiss)).toBe(0)
  })

  it("is zero with no audio at all", () => {
    expect(voicedSeconds({ intervalUs: us(20_000), values: [] })).toBe(0)
  })
})

describe("looksMistranscribed", () => {
  it("catches the wrong language", () => {
    // Two words across 5.2 seconds of voice is 0.4 per second. Speech is 2–3.
    expect(looksMistranscribed({ words: words(2), voiced: 5.22 })).toBe(true)
  })

  it("passes the right one", () => {
    // Twenty-six words over the same audio: about five per second.
    expect(looksMistranscribed({ words: words(26), voiced: 5.22 })).toBe(false)
  })

  it("leaves a short clip alone", () => {
    // Under a couple of seconds the figure is noise — one word either way
    // swings it — and the cost of a false alarm is a round of API calls.
    expect(looksMistranscribed({ words: words(1), voiced: 1.2 })).toBe(false)
  })

  it("does not flag footage with no voice in it", () => {
    // Music and b-roll have no transcript by definition. Sending them round
    // every candidate language would spend real money finding nothing.
    expect(looksMistranscribed({ words: [], voiced: 0 })).toBe(false)
  })
})

describe("wordDensity", () => {
  it("is zero rather than infinite when nothing was voiced", () => {
    expect(wordDensity(words(3), 0)).toBe(0)
  })
})
