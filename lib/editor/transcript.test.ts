import { describe, expect, it } from "vitest"

import { secondsToUs, us, type Us } from "./time"
import {
  buildCaptionSeeds,
  detectFillers,
  detectSilences,
  groupIntoSegments,
  snapToQuiet,
  transcriptText,
  wordsFromDeepgram,
  type Word,
} from "./transcript"

const s = (seconds: number) => secondsToUs(seconds) as Us

function word(text: string, start: number, end: number): Word {
  return { text, startUs: s(start), endUs: s(end), confidence: 1 }
}

describe("wordsFromDeepgram", () => {
  it("reads words out of the nested provider shape", () => {
    const response = {
      results: {
        channels: [
          {
            alternatives: [
              {
                words: [
                  { word: "hei", punctuated_word: "Hei,", start: 0, end: 0.4 },
                ],
              },
            ],
          },
        ],
      },
    }

    expect(wordsFromDeepgram(response)).toEqual([
      {
        text: "Hei,",
        startUs: 0,
        endUs: s(0.4),
        confidence: 1,
        speaker: undefined,
      },
    ])
  })

  it("prefers the punctuated form, which is what a caption shows", () => {
    const response = {
      results: {
        channels: [
          {
            alternatives: [
              {
                words: [
                  { word: "ja", punctuated_word: "Ja!", start: 0, end: 1 },
                ],
              },
            ],
          },
        ],
      },
    }

    expect(wordsFromDeepgram(response)[0].text).toBe("Ja!")
  })

  it("returns nothing rather than throwing on a failed transcription", () => {
    expect(wordsFromDeepgram({})).toEqual([])
    expect(wordsFromDeepgram(null)).toEqual([])
  })
})

describe("detectSilences", () => {
  it("finds a long pause between two words", () => {
    const words = [word("first", 0, 1), word("second", 4, 5)]
    const [gap] = detectSilences(words, s(5))

    // Padded in from both sides so the breath survives the cut.
    expect(gap).toEqual({ startUs: s(1.12), endUs: s(3.88) })
  })

  it("leaves natural speech rhythm alone", () => {
    // A 200ms beat between words is emphasis, not dead air. Cutting it is what
    // makes a tightened edit sound robotic.
    const words = [word("one", 0, 1), word("two", 1.2, 2)]
    expect(detectSilences(words, s(2))).toEqual([])
  })

  it("trims dead air before the first word", () => {
    const words = [word("late", 3, 4)]
    const ranges = detectSilences(words, s(4))

    expect(ranges[0]).toEqual({ startUs: 0, endUs: s(2.88) })
  })

  it("trims dead air after the last word", () => {
    const words = [word("done", 0, 1)]
    const ranges = detectSilences(words, s(6))

    expect(ranges[ranges.length - 1]).toEqual({ startUs: s(1.12), endUs: s(6) })
  })

  it("drops a gap that padding would swallow whole", () => {
    // 400ms clears the threshold but leaves 160ms after 120ms padding each
    // side. Keeping it would cut less than the padding promised to leave.
    const words = [word("a", 0, 1), word("b", 1.4, 2)]
    const ranges = detectSilences(words, s(2), {
      minSilenceUs: us(350_000),
      paddingUs: us(200_000),
      trimHead: false,
      trimTail: false,
    })

    expect(ranges).toEqual([])
  })

  it("removes nothing when there is no speech at all", () => {
    // Music or b-roll. Failing closed here is the difference between a no-op
    // and an empty timeline.
    expect(detectSilences([], s(30))).toEqual([])
  })

  it("merges gaps that touch after padding", () => {
    const words = [word("a", 0, 1), word("b", 3, 3.1), word("c", 5, 6)]
    const ranges = detectSilences(words, s(6), {
      minSilenceUs: us(300_000),
      paddingUs: us(0),
      trimHead: false,
      trimTail: false,
    })

    expect(ranges).toEqual([
      { startUs: s(1), endUs: s(3) },
      { startUs: s(3.1), endUs: s(5) },
    ])
  })
})

describe("detectFillers", () => {
  it("finds an um", () => {
    const words = [
      word("so", 0, 0.3),
      word("um", 0.4, 0.7),
      word("yes", 0.8, 1),
    ]
    expect(detectFillers(words)).toEqual([{ startUs: s(0.4), endUs: s(0.7) }])
  })

  it("sees through the punctuation Deepgram attaches", () => {
    // The punctuated form is "um," and a naive equality check misses it.
    const words = [word("Um,", 0, 0.3)]
    expect(detectFillers(words)).toHaveLength(1)
  })

  it("finds the Norwegian ones too", () => {
    const words = [word("det", 0, 0.2), word("liksom", 0.3, 0.7)]
    expect(detectFillers(words)).toHaveLength(1)
  })

  it("leaves real words alone", () => {
    const words = [word("umbrella", 0, 0.5)]
    expect(detectFillers(words)).toEqual([])
  })
})

describe("snapToQuiet", () => {
  it("pulls a boundary to the quietest sample nearby", () => {
    // Word timestamps mark recognition, not silence. The true quiet point here
    // is index 5; the padded boundary landed on index 4.
    const peaks = {
      intervalUs: us(10_000),
      values: [1, 1, 1, 0.8, 0.5, 0.05, 0.6, 1],
    }

    const [range] = snapToQuiet(
      [{ startUs: us(40_000), endUs: us(40_000) }],
      peaks,
      us(30_000)
    )

    expect(range.startUs).toBe(50_000)
  })

  it("leaves ranges untouched when there are no peaks", () => {
    const ranges = [{ startUs: us(1000), endUs: us(2000) }]
    expect(snapToQuiet(ranges, { intervalUs: us(10_000), values: [] })).toEqual(
      ranges
    )
  })
})

describe("groupIntoSegments", () => {
  it("gives one word per segment by default", () => {
    const words = [word("a", 0, 0.2), word("b", 0.2, 0.4)]
    expect(groupIntoSegments(words, 1)).toHaveLength(2)
  })

  it("groups up to the requested count", () => {
    const words = [
      word("a", 0, 0.2),
      word("b", 0.2, 0.4),
      word("c", 0.4, 0.6),
      word("d", 0.6, 0.8),
    ]
    expect(groupIntoSegments(words, 2).map((seg) => seg.length)).toEqual([2, 2])
  })

  it("breaks at a long pause even mid-group", () => {
    // A caption holding two words either side of a two second gap reads as a
    // mistake, however many words the setting allows.
    const words = [word("a", 0, 0.2), word("b", 3, 3.2)]
    expect(groupIntoSegments(words, 5)).toHaveLength(2)
  })

  it("returns nothing for no words", () => {
    expect(groupIntoSegments([], 1)).toEqual([])
  })
})

describe("buildCaptionSeeds", () => {
  const words = [word("hei", 1, 1.3), word("der", 1.4, 1.8)]

  it("keeps token times relative to their segment", () => {
    const [first] = buildCaptionSeeds(words, {
      mediaId: "m1",
      elementId: "e1",
      wordsPerSegment: 2,
    })

    expect(first.startUs).toBe(s(1))
    expect(first.tokens[0].startUs).toBe(0)
    expect(first.tokens[1].startUs).toBe(s(0.4))
  })

  it("binds every token back to its source range", () => {
    // The binding that lets captions survive cuts. Without it, editing
    // degrades into putting words roughly where they used to be.
    const [first] = buildCaptionSeeds(words, {
      mediaId: "m1",
      elementId: "e1",
      wordsPerSegment: 2,
    })

    expect(first.tokens[1]).toMatchObject({
      sourceMediaId: "m1",
      sourceElementId: "e1",
      sourceStartUs: s(1.4),
      sourceEndUs: s(1.8),
    })
  })

  it("makes one segment per word by default", () => {
    expect(
      buildCaptionSeeds(words, { mediaId: "m1", elementId: "e1" })
    ).toHaveLength(2)
  })
})

describe("transcriptText", () => {
  it("joins words without stranding punctuation", () => {
    const words = [
      word("Hei", 0, 0.3),
      word(",", 0.3, 0.3),
      word("der", 0.4, 0.7),
    ]
    expect(transcriptText(words)).toBe("Hei, der")
  })
})
