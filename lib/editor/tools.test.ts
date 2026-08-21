import { describe, expect, it } from "vitest"

import { createScene } from "./document"
import { applyOps, newElement } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import { addCaptions, removeSilences } from "./tools"
import type { Word } from "./transcript"
import {
  UNLOCKED,
  type CaptionElement,
  type Scene,
  type VideoElement,
  type VideoDocument,
} from "./types"

/**
 * One sixty-second take, whole, with a caption lane waiting for it — which is
 * what `documentForAsset` produces the moment an upload finishes.
 */
function scene(): Scene {
  const base = createScene({})
  const main = findMainTrack(base)!

  main.elements = [
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "va-1",
        startUs: us(0),
        durationUs: secondsToUs(60),
        trimStartUs: us(0),
        trimEndUs: secondsToUs(60),
        sourceDurationUs: secondsToUs(60),
        transform: {
          position: { x: 0, y: 0 },
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
        },
        opacity: 1,
        blendMode: "normal",
        volume: 1,
        muted: false,
        effects: [],
        animations: { channels: {} },
      },
      "user"
    ),
  ]

  return base
}

/**
 * Four words with a five-second hole in the middle, and dead air at both ends.
 * Every silence rule has something to find here.
 */
const WORDS: Word[] = [
  ["this", 5, 5.4],
  ["is", 5.4, 5.8],
  ["the", 11, 11.4],
  ["take", 11.4, 12],
].map(([text, start, end]) => ({
  text: text as string,
  startUs: secondsToUs(start as number),
  endUs: secondsToUs(end as number),
  confidence: 0.99,
}))

function apply(base: Scene, ops: ReturnType<typeof addCaptions>): Scene {
  const document: VideoDocument = {
    version: 1,
    metadata: {
      id: "vp-1",
      name: "t",
      durationUs: us(0),
      createdAt: "",
      updatedAt: "",
    },
    settings: {
      fps: 30,
      canvas: { width: 1920, height: 1080 },
      background: { type: "color", color: "#000" },
    },
    scenes: [base],
    currentSceneId: base.id,
  }

  return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
    author: "agent",
  }).snapshot.document.scenes[0]
}

const captionsOf = (result: Scene) =>
  (result.tracks.find((track) => track.kind === "caption")?.elements ??
    []) as CaptionElement[]

describe("addCaptions", () => {
  it("puts one caption on the lane per word", () => {
    const base = scene()
    const result = apply(
      base,
      addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" })
    )

    expect(captionsOf(result).map((caption) => caption.name)).toEqual([
      "this",
      "is",
      "the",
      "take",
    ])
  })

  it("places them where the words were spoken", () => {
    const base = scene()
    const result = apply(
      base,
      addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" })
    )

    expect(captionsOf(result)[0].startUs).toBe(secondsToUs(5))
    expect(captionsOf(result)[2].startUs).toBe(secondsToUs(11))
  })

  it("binds every token back to the source instant it came from", () => {
    // The binding is what makes captions survive a cut. Without it they are
    // decoration that has to be rebuilt after every edit.
    const base = scene()
    const result = apply(
      base,
      addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" })
    )

    for (const caption of captionsOf(result)) {
      for (const token of caption.tokens) {
        expect(token.sourceMediaId).toBe("va-1")
        expect(token.sourceEndUs).toBeGreaterThan(token.sourceStartUs)
      }
    }
  })

  it("groups words when asked for phrases", () => {
    const base = scene()
    const result = apply(
      base,
      addCaptions(base, WORDS, {
        mediaId: "va-1",
        author: "agent",
        wordsPerSegment: 2,
      })
    )

    expect(captionsOf(result).map((caption) => caption.name)).toEqual([
      "this is",
      "the take",
    ])
  })

  it("replaces the lane rather than doubling it", () => {
    // Running it twice is normal — after changing words-per-segment, after a
    // re-transcribe. Appending would give the user every word twice.
    const base = scene()
    const once = apply(
      base,
      addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" })
    )
    const twice = apply(
      once,
      addCaptions(once, WORDS, { mediaId: "va-1", author: "agent" })
    )

    expect(captionsOf(twice)).toHaveLength(WORDS.length)
  })

  it("does nothing without a transcript", () => {
    expect(
      addCaptions(scene(), [], { mediaId: "va-1", author: "agent" })
    ).toEqual([])
  })

  it("does nothing when the spine has none of that media", () => {
    expect(
      addCaptions(scene(), WORDS, { mediaId: "va-other", author: "agent" })
    ).toEqual([])
  })
})

describe("removeSilences", () => {
  const options = {
    mediaId: "va-1",
    author: "agent" as const,
    sourceDurationUs: secondsToUs(60),
  }

  it("cuts the spine into the parts that have speech in them", () => {
    const base = scene()
    const result = apply(base, removeSilences(base, WORDS, options))
    const spine = findMainTrack(result)!

    // Head, the hole in the middle, and the tail: three cuts, two pieces.
    expect(spine.elements).toHaveLength(2)
  })

  it("leaves no gaps behind", () => {
    const base = scene()
    const spine = findMainTrack(
      apply(base, removeSilences(base, WORDS, options))
    )!

    let cursor = 0
    for (const element of spine.elements) {
      expect(element.startUs).toBe(cursor)
      cursor += element.durationUs
    }
  })

  it("makes the take shorter than the footage", () => {
    const base = scene()
    const spine = findMainTrack(
      apply(base, removeSilences(base, WORDS, options))
    )!
    const total = spine.elements.reduce(
      (sum, element) => sum + element.durationUs,
      0
    )

    expect(total).toBeLessThan(secondsToUs(60))
    expect(total).toBeGreaterThan(0)
  })

  it("brings the captions with it", () => {
    // The point of the source binding. Every word is still on screen while it
    // is being spoken, at its new position, after a cut that moved different
    // words by different amounts.
    const base = scene()
    const withCaptions = apply(
      base,
      addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" })
    )

    const result = apply(
      withCaptions,
      removeSilences(withCaptions, WORDS, options)
    )

    const spine = findMainTrack(result)!
    const captions = captionsOf(result)

    expect(captions).toHaveLength(WORDS.length)

    // "the" was spoken at 11s and the head and the middle hole are both gone,
    // so it now lands well before that — and inside a clip, not in a gap.
    const third = captions[2]
    expect(third.startUs).toBeLessThan(secondsToUs(11))
    expect(
      spine.elements.some(
        (element) =>
          third.startUs >= element.startUs &&
          third.startUs < element.startUs + element.durationUs
      )
    ).toBe(true)
  })

  it("credits the tightening to whoever asked for it", () => {
    const base = scene()
    const spine = findMainTrack(
      apply(base, removeSilences(base, WORDS, options))
    )!

    for (const element of spine.elements) {
      expect(element.provenance.fields.trimStartUs).toBe("agent")
    }
  })

  it("does nothing when there is nothing to cut", () => {
    // No words means music or b-roll. "Remove the silence" from that is
    // "remove all of it", so failing closed is the difference between a no-op
    // and an empty timeline.
    expect(removeSilences(scene(), [], options)).toEqual([])
  })

  it("lands as one revision", () => {
    // The spine moving and the captions moving are one edit. Applied apart,
    // the timeline renders a frame where the clips have shifted and the words
    // have not, which looks exactly like the bug this avoids.
    const base = scene()
    const withCaptions = apply(
      base,
      addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" })
    )

    const ops = removeSilences(withCaptions, WORDS, options)
    expect(ops.filter((op) => op.op === "replace_elements")).toHaveLength(2)
  })
})
