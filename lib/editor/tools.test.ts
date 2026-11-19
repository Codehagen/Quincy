import { describe, expect, it } from "vitest"

import { createScene } from "./document"
import { applyOps, applyToScene, newElement, targetInScene } from "./ops"
import { findMainTrack, sceneDurationUs } from "./timeline"
import { secondsToUs, us } from "./time"
import {
  addCaptions,
  cleanUpSteps,
  cutGapAround,
  MAX_CUT_STEPS,
  removeSilences,
  removeSilenceSteps,
  restoreSpeech,
} from "./tools"
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

describe("targets (plans/036)", () => {
  const options = {
    mediaId: "va-1",
    author: "agent" as const,
    sourceDurationUs: secondsToUs(60),
  }

  it("addCaptions presses the captions control", () => {
    const base = scene()
    const ops = addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" })
    for (const op of ops) {
      expect(op.target).toEqual({
        action: "press",
        kind: "control",
        control: "captions",
      })
    }
  })

  it("removeSilences names every pause it cuts, in scene time", () => {
    const base = scene()
    const ops = removeSilences(base, WORDS, options)
    for (const op of ops) {
      expect(op.target?.kind).toBe("range")
      expect(targetInScene(base, op.target!)).toBe(true)
    }
  })

  it("removeSilenceSteps is one pause per step, each aimed at the scene it lands on", () => {
    let current = scene()
    const steps = removeSilenceSteps(current, WORDS, options)
    // Head, the hole in the middle, and the tail.
    expect(steps).toHaveLength(3)
    for (const step of steps) {
      for (const op of step) {
        expect(op.target).toMatchObject({ kind: "range", action: "cut" })
        expect(targetInScene(current, op.target!)).toBe(true)
      }
      current = applyToScene(current, step, "agent")
    }
  })

  it("arrives at the same cut as removeSilences", () => {
    const base = scene()
    const batch = apply(base, removeSilences(base, WORDS, options))

    let stepped = base
    for (const step of removeSilenceSteps(base, WORDS, options)) {
      stepped = applyToScene(stepped, step, "agent")
    }

    expect(sceneDurationUs(stepped)).toBe(sceneDurationUs(batch))
    const windows = (s: Scene) =>
      (findMainTrack(s)!.elements as VideoElement[]).map((clip) => [
        clip.trimStartUs,
        clip.trimEndUs,
      ])
    expect(windows(stepped)).toEqual(windows(batch))
  })

  it("keeps the captions in step with the spine at every step", () => {
    const base = scene()
    let current = apply(
      base,
      addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" })
    )
    for (const step of removeSilenceSteps(current, WORDS, options)) {
      expect(
        step.some(
          (op) =>
            op.op === "replace_elements" &&
            op.trackId !== findMainTrack(current)!.id
        )
      ).toBe(true)
      current = applyToScene(current, step, "agent")
    }
    expect(captionsOf(current)[0].startUs).toBe(secondsToUs(0.12))
  })

  it("never streams more steps than its ceiling", () => {
    // Forty words a second apart: thirty-nine pauses.
    const many: Word[] = Array.from({ length: 40 }, (_, index) => ({
      text: `w${index}`,
      startUs: secondsToUs(index * 1.4),
      endUs: secondsToUs(index * 1.4 + 0.3),
      confidence: 1,
    }))
    const steps = removeSilenceSteps(scene(), many, options)
    expect(steps.length).toBeLessThanOrEqual(MAX_CUT_STEPS)
    const multi = steps.find(
      (step) =>
        step[0].target?.kind === "range" && step[0].target.spans.length > 1
    )
    expect(multi).toBeDefined()
  })
})

describe("cleanUpSteps", () => {
  const STUMBLE: Word[] = [
    ["we", 1, 1.3],
    ["we", 1.4, 1.7],
    ["shipped", 1.8, 2.3],
    ["it.", 2.4, 2.7],
  ].map(([text, start, end]) => ({
    text: text as string,
    startUs: secondsToUs(start as number),
    endUs: secondsToUs(end as number),
    confidence: 0.99,
  }))

  it("cuts the first copy of a repeat and names it", () => {
    const base = scene()
    const plan = cleanUpSteps(base, STUMBLE, {
      mediaId: "va-1",
      author: "agent",
      sourceDurationUs: secondsToUs(60),
    })
    expect(plan.removed.map((item) => item.kind)).toEqual(["repetition"])
    const after = plan.steps.reduce(
      (current, ops) => applyToScene(current, ops, "agent"),
      base
    )
    expect(sceneDurationUs(after)).toBeLessThan(sceneDurationUs(base))
    for (const ops of plan.steps) {
      for (const op of ops) expect(op.target).toBeDefined()
    }
  })

  it("finds nothing in clean speech", () => {
    const plan = cleanUpSteps(scene(), WORDS, {
      mediaId: "va-1",
      author: "agent",
      sourceDurationUs: secondsToUs(60),
    })
    expect(plan.steps).toEqual([])
  })
})

describe("restoreSpeech", () => {
  it("brings a cut pause back and the cut is whole again", () => {
    const base = scene()
    const cut = removeSilences(base, WORDS, {
      mediaId: "va-1",
      author: "agent",
      sourceDurationUs: secondsToUs(60),
    })
    const tightened = applyToScene(base, cut, "agent")
    const lost = sceneDurationUs(base) - sceneDurationUs(tightened)
    expect(lost).toBeGreaterThan(0)

    // The middle pause, at 8 s of the recording.
    const ops = restoreSpeech(tightened, {
      mediaId: "va-1",
      atUs: secondsToUs(8),
      sourceDurationUs: secondsToUs(60),
    })
    const restored = applyToScene(tightened, ops, "user")
    expect(sceneDurationUs(restored)).toBeGreaterThan(
      sceneDurationUs(tightened)
    )
    const spine = findMainTrack(restored)!
    expect(
      spine.elements.some(
        (clip) =>
          clip.kind === "video" &&
          clip.trimStartUs <= secondsToUs(8) &&
          clip.trimEndUs > secondsToUs(8)
      )
    ).toBe(true)
    expect(targetInScene(restored, ops[0].target!)).toBe(true)
  })

  it("does nothing where the recording still plays", () => {
    expect(
      restoreSpeech(scene(), {
        mediaId: "va-1",
        atUs: secondsToUs(3),
        sourceDurationUs: secondsToUs(60),
      })
    ).toEqual([])
  })

  it("rebuilds the captions so the restored words are on them", () => {
    const base = scene()
    const captioned = applyToScene(
      base,
      addCaptions(base, WORDS, { mediaId: "va-1", author: "user" }),
      "user"
    )
    const deleted = applyToScene(
      captioned,
      removeSilences(captioned, WORDS.slice(0, 2), {
        mediaId: "va-1",
        author: "user",
        sourceDurationUs: secondsToUs(60),
        silence: {
          minSilenceUs: us(350_000),
          paddingUs: us(0),
          trimHead: false,
          trimTail: true,
        },
      }),
      "user"
    )
    const words = (s: Scene) =>
      s.tracks.filter((t) => t.kind === "caption").flatMap((t) => t.elements)
        .length
    expect(words(deleted)).toBe(2)
    const back = applyToScene(
      deleted,
      restoreSpeech(deleted, {
        mediaId: "va-1",
        atUs: secondsToUs(11.2),
        sourceDurationUs: secondsToUs(60),
        words: WORDS,
      }),
      "user"
    )
    expect(words(back)).toBe(4)
  })

  it("keeps the caption settings that were asked for", () => {
    const base = scene()
    const ops = addCaptions(base, WORDS, {
      mediaId: "va-1",
      author: "user",
      wordsPerSegment: 4,
      showFillers: true,
    })
    const captioned = applyToScene(base, ops, "user")
    const caption = captioned.tracks
      .filter((t) => t.kind === "caption")
      .flatMap((t) => t.elements)[0] as CaptionElement
    expect(caption.style.wordsPerSegment).toBe(4)
    expect(caption.style.showFillers).toBe(true)
  })
})

describe("cutGapAround", () => {
  it("spans from the piece before to the piece after", () => {
    const pieces = [
      { trimStartUs: us(0), trimEndUs: us(10) },
      { trimStartUs: us(20), trimEndUs: us(30) },
    ] as VideoElement[]
    expect(cutGapAround(pieces, us(15), us(40))).toEqual({
      startUs: 10,
      endUs: 20,
    })
    expect(cutGapAround(pieces, us(35), us(40))).toEqual({
      startUs: 30,
      endUs: 40,
    })
    expect(cutGapAround(pieces, us(5), us(40))).toBeNull()
  })
})
