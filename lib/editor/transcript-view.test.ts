import { describe, expect, it } from "vitest"

import { DEFAULT_CAPTION_STYLE } from "./document"
import { createProvenance } from "./provenance"
import { secondsToUs, us, type Us } from "./time"
import {
  sourceRangesFor,
  timelineSpan,
  transcriptLines,
  transcriptWords,
  wordsBetween,
} from "./transcript-view"
import type { CaptionElement, CaptionToken, Scene, Track } from "./types"

const s = (seconds: number) => secondsToUs(seconds) as Us

/**
 * One caption element per word, which is what `wordsPerSegment: 1` produces and
 * therefore what the panel actually reads in a real project.
 */
function word(
  text: string,
  atSeconds: number,
  options: { lengthS?: number; mediaId?: string; sourceAtS?: number } = {}
): CaptionElement {
  const length = options.lengthS ?? 0.3
  const sourceAt = options.sourceAtS ?? atSeconds

  const token: CaptionToken = {
    id: `tok-${text}-${atSeconds}`,
    text,
    startUs: us(0),
    endUs: s(length),
    sourceMediaId: options.mediaId ?? "media-1",
    sourceElementId: "el-1",
    sourceStartUs: s(sourceAt),
    sourceEndUs: s(sourceAt + length),
  }

  return {
    kind: "caption",
    id: `cap-${text}-${atSeconds}`,
    name: text,
    startUs: s(atSeconds),
    durationUs: s(length),
    tokens: [token],
    style: DEFAULT_CAPTION_STYLE,
    transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
    provenance: createProvenance("agent"),
  }
}

function scene(captions: CaptionElement[]): Scene {
  const spine: Track = {
    id: "track-main",
    kind: "video",
    name: "Main",
    isMain: true,
    elements: [],
  }

  const lane: Track = {
    id: "track-captions",
    kind: "caption",
    name: "Captions",
    elements: captions,
  }

  return {
    id: "sc-1",
    name: "Scene",
    isMain: true,
    canvas: { width: 1080, height: 1920 },
    tracks: [spine, lane],
  }
}

describe("transcriptWords", () => {
  it("rebases token times into scene time", () => {
    // Tokens are element-relative and every consumer works in scene time. A
    // panel that seeked to a token's own startUs would send the playhead to the
    // top of the cut for every word.
    const [first, second] = transcriptWords(
      scene([word("hello", 2), word("there", 2.4)])
    )

    expect(first.startUs).toBe(s(2))
    expect(second.startUs).toBe(s(2.4))
    expect(second.endUs).toBe(s(2.7))
  })

  it("reads the words in spoken order, not element order", () => {
    // remapCaptions sorts, but nothing guarantees a caption track stays sorted
    // through every path that writes one.
    const words = transcriptWords(scene([word("second", 5), word("first", 1)]))

    expect(words.map((w) => w.text)).toEqual(["first", "second"])
  })

  it("measures the silence before each word", () => {
    const words = transcriptWords(
      scene([word("a", 0), word("b", 0.4), word("c", 2)])
    )

    expect(words.map((w) => w.gapUs)).toEqual([us(0), s(0.1), s(1.3)])
  })

  it("never reports a negative gap", () => {
    // remapCaptions clamps a word that straddles a cut to the end of its clip,
    // which can leave the next word starting fractionally earlier. A negative
    // gap would render as a pause pill of minus half a second.
    const words = transcriptWords(
      scene([word("a", 1, { lengthS: 1 }), word("b", 1.5)])
    )

    expect(words[1].gapUs).toBe(us(0))
  })
})

describe("transcriptLines", () => {
  it("breaks where the speaker breathes", () => {
    const lines = transcriptLines(
      scene([
        word("okay", 0),
        word("so", 0.35),
        // 0.65s of silence: a break, not a gap between words.
        word("here", 1.3),
        word("we", 1.65),
      ])
    )

    expect(lines.map((line) => line.words.map((w) => w.text))).toEqual([
      ["okay", "so"],
      ["here", "we"],
    ])
  })

  it("wraps speech that never pauses", () => {
    // Without a ceiling a fast talker is one line the length of the cut, which
    // is a wall of text with a single timecode against it.
    const captions = Array.from({ length: 20 }, (_, i) =>
      word(`w${i}`, i * 0.31)
    )

    const lines = transcriptLines(scene(captions))

    expect(lines).toHaveLength(2)
    expect(lines[0].words).toHaveLength(14)
    expect(lines[1].words).toHaveLength(6)
  })

  it("takes its start and id from the first word on it", () => {
    const lines = transcriptLines(scene([word("hello", 2), word("there", 2.4)]))

    expect(lines[0].startUs).toBe(s(2))
    expect(lines[0].id).toBe(lines[0].words[0].id)
  })

  it("has nothing to show for a cut with no captions", () => {
    expect(transcriptLines(scene([]))).toEqual([])
  })
})

describe("wordsBetween", () => {
  const words = transcriptWords(
    scene([word("a", 0), word("b", 0.4), word("c", 0.8), word("d", 1.2)])
  )

  it("includes both ends", () => {
    expect(
      wordsBetween(words, words[1].id, words[2].id).map((w) => w.text)
    ).toEqual(["b", "c"])
  })

  it("reads a backwards drag the same as a forwards one", () => {
    expect(
      wordsBetween(words, words[2].id, words[0].id).map((w) => w.text)
    ).toEqual(["a", "b", "c"])
  })

  it("is a single word when both ends are the same", () => {
    expect(wordsBetween(words, words[1].id, words[1].id)).toHaveLength(1)
  })

  it("has nothing to say about a word that is gone", () => {
    expect(wordsBetween(words, "tok-missing", words[0].id)).toEqual([])
  })
})

describe("timelineSpan", () => {
  it("covers the whole selection", () => {
    const words = transcriptWords(scene([word("a", 1), word("b", 2)]))

    expect(timelineSpan(words)).toEqual({ startUs: s(1), endUs: s(2.3) })
  })

  it("is null when nothing is selected", () => {
    expect(timelineSpan([])).toBeNull()
  })
})

describe("sourceRangesFor", () => {
  it("joins a phrase into one range, silence included", () => {
    // Four words deleted as four ranges leaves the three pauses between them in
    // the cut — three fragments of room tone butted together, which is audible.
    const words = transcriptWords(
      scene([word("every", 1), word("day", 1.4), word("this", 1.8)])
    )

    expect(sourceRangesFor(words)).toEqual([
      { mediaId: "media-1", ranges: [{ startUs: s(1), endUs: s(2.1) }] },
    ])
  })

  it("cuts around a real pause rather than through it", () => {
    // Selecting across a two-second silence should not quietly delete the beat.
    const words = transcriptWords(scene([word("a", 0), word("b", 3)]))

    expect(sourceRangesFor(words)[0].ranges).toEqual([
      { startUs: s(0), endUs: s(0.3) },
      { startUs: s(3), endUs: s(3.3) },
    ])
  })

  it("keeps each asset's ranges to itself", () => {
    // A selection can run from one clip into another recording. Each asset's
    // spine elements are cut against their own source ranges.
    const words = transcriptWords(
      scene([
        word("a", 0, { mediaId: "media-1", sourceAtS: 10 }),
        word("b", 0.4, { mediaId: "media-2", sourceAtS: 4 }),
      ])
    )

    expect(sourceRangesFor(words)).toEqual([
      { mediaId: "media-1", ranges: [{ startUs: s(10), endUs: s(10.3) }] },
      { mediaId: "media-2", ranges: [{ startUs: s(4), endUs: s(4.3) }] },
    ])
  })

  it("uses source time, not the timeline's", () => {
    // The point of the token binding. A word spoken at 30s of the recording and
    // sitting at 2s of the cut has to be cut at 30.
    const words = transcriptWords(
      scene([word("late", 2, { sourceAtS: 30 })])
    )

    expect(sourceRangesFor(words)[0].ranges).toEqual([
      { startUs: s(30), endUs: s(30.3) },
    ])
  })
})
