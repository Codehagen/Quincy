import { describe, expect, it } from "vitest"

import { createScene } from "./document"
import { deleteSpeech } from "./edits"
import { applyToScene, newElement } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import { restoreSpeech } from "./tools"
import {
  cleanUpReview,
  cutAways,
  reviewCuts,
  reviewDefault,
} from "./transcript-edit"
import type { Word } from "./transcript"
import type { Scene, VideoElement } from "./types"

const s = secondsToUs

function take(): Scene {
  const base = createScene({})
  findMainTrack(base)!.elements = [
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "m",
        startUs: us(0),
        durationUs: s(10),
        trimStartUs: us(0),
        trimEndUs: s(10),
        sourceDurationUs: s(10),
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

/** One word a second: "w0" at 0–0.5 s, "w1" at 1–1.5 s, … */
function said(...texts: string[]): Word[] {
  return texts.map((text, i) => ({
    text,
    startUs: s(i),
    endUs: s(i + 0.5),
    confidence: 1,
  }))
}

describe("cutAways", () => {
  it("lists nothing on an uncut take", () => {
    expect(cutAways(take(), "m", said("a", "b", "c"), s(10))).toEqual([])
  })

  it("names the words a cut took, where the cut joins, and restores them", () => {
    const words = said("we", "we", "shipped", "it")
    let scene = take()
    scene = applyToScene(
      scene,
      deleteSpeech(scene, [
        { mediaId: "m", ranges: [{ startUs: s(0.9), endUs: s(1.9) }] },
      ]),
      "user"
    )
    const [cut, ...rest] = cutAways(scene, "m", words, s(10))
    expect(rest).toEqual([])
    expect(cut.text).toBe("we")
    expect(cut.atUs).toBe(s(0.9))

    const back = applyToScene(
      scene,
      restoreSpeech(scene, {
        mediaId: "m",
        atUs: cut.sourceUs,
        sourceDurationUs: s(10),
      }),
      "user"
    )
    expect(cutAways(back, "m", words, s(10))).toEqual([])
  })
})

describe("cleanUpReview", () => {
  it("never offers the only copy left after a hand edit", () => {
    const words = said("we", "we", "shipped")
    let scene = take()
    // The person took the second "we" by hand.
    scene = applyToScene(
      scene,
      deleteSpeech(scene, [
        { mediaId: "m", ranges: [{ startUs: s(0.9), endUs: s(1.6) }] },
      ]),
      "user"
    )
    expect(cleanUpReview(scene, "m", words)).toEqual([])
  })

  it("lists stumbles that still play, and cuts the ticked ones", () => {
    const words = said("we", "we", "shipped,", "like,", "fast")
    const scene = take()
    const items = cleanUpReview(scene, "m", words)
    expect(
      items.map((item) => [item.kind, item.phrase, reviewDefault(item)])
    ).toEqual([
      ["repetition", "we", true],
      ["discourse", "like,", false],
    ])

    const ranges = reviewCuts(items.filter(reviewDefault), words, s(10))
    const cut = applyToScene(
      scene,
      deleteSpeech(scene, [{ mediaId: "m", ranges }]),
      "user"
    )
    expect(cleanUpReview(cut, "m", words).map((item) => item.kind)).toEqual([
      "discourse",
    ])
  })
})
