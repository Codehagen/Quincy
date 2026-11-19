import { describe, expect, it } from "vitest"

import { createScene } from "./document"
import { applyToScene, newElement, targetInScene } from "./ops"
import {
  checkTag,
  checkTagPrefix,
  checkTimes,
  fixSteps,
  MAX_CHECK_FRAMES,
  moveCaptions,
  needsCheck,
} from "./self-check"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import { addCaptions } from "./tools"
import type { Word } from "./transcript"
import type { CaptionElement, Scene, VideoElement } from "./types"

const WORDS: Word[] = [
  ["Hello.", 1, 1.5],
  ["This", 2, 2.3],
  ["works.", 2.3, 2.8],
].map(([text, start, end]) => ({
  text: text as string,
  startUs: secondsToUs(start as number),
  endUs: secondsToUs(end as number),
  confidence: 0.99,
}))

function scene(): Scene {
  const base = createScene({})
  findMainTrack(base)!.elements = [
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "va-1",
        startUs: us(0),
        durationUs: secondsToUs(10),
        trimStartUs: us(0),
        trimEndUs: secondsToUs(10),
        sourceDurationUs: secondsToUs(10),
        transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
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

function captioned(): Scene {
  const base = scene()
  return applyToScene(base, addCaptions(base, WORDS, { mediaId: "va-1", author: "agent" }), "agent")
}

function captionYs(s: Scene): number[] {
  return s.tracks
    .filter((t) => t.kind === "caption")
    .flatMap((t) => t.elements)
    .map((e) => (e as CaptionElement).transform.position.y)
}

describe("needsCheck: only a run that changed picture or captions", () => {
  it("checks after captions, a reframe, a crop, a push-in or a look", () => {
    for (const tool of ["add_captions", "reframe", "crop", "punch_in", "apply_look"]) {
      expect(needsCheck([tool])).toBe(true)
    }
  })

  it("does not check after cuts alone, or a read", () => {
    expect(needsCheck(["remove_silences", "delete_clip", "split_clip"])).toBe(false)
    expect(needsCheck(["describe_timeline"])).toBe(false)
    expect(needsCheck([])).toBe(false)
  })

  it("checks when one of several tools changed the picture", () => {
    expect(needsCheck(new Set(["remove_silences", "add_captions"]))).toBe(true)
  })
})

describe("checkTimes: the ceiling on frames", () => {
  it("never asks for more than three frames", () => {
    const s = scene()
    const track = findMainTrack(s)!
    const spans = Array.from({ length: 8 }, (_, i) => ({
      startUs: secondsToUs(i),
      endUs: secondsToUs(i + 0.5),
    }))
    const times = checkTimes(s, [{ action: "cut", kind: "range", trackId: track.id, spans }])
    expect(times.length).toBe(MAX_CHECK_FRAMES)
  })

  it("spreads across the cut for a change to a whole lane", () => {
    const s = scene()
    const times = checkTimes(s, [{ action: "press", kind: "control", control: "captions" }])
    expect(times).toEqual([secondsToUs(2), secondsToUs(5), secondsToUs(8)])
  })

  it("has nothing to look at in an empty cut", () => {
    expect(checkTimes(createScene({}), [null])).toEqual([])
  })
})

describe("moveCaptions and fixSteps", () => {
  it("lifts every caption by one step, as one press on the caption lane", () => {
    const s = captioned()
    const ops = moveCaptions(s, "up", 1920)
    expect(ops).toHaveLength(1)
    expect(ops[0].target && targetInScene(s, ops[0].target)).toBe(true)
    const after = applyToScene(s, ops, "agent")
    expect(captionYs(after).every((y) => y === -192)).toBe(true)
  })

  it("never pushes captions below where the style puts them", () => {
    expect(moveCaptions(captioned(), "down", 1920)).toEqual([])
  })

  it("stops lifting at half the frame", () => {
    let s = captioned()
    for (let i = 0; i < 8; i++) s = applyToScene(s, moveCaptions(s, "up", 1000), "agent")
    expect(Math.min(...captionYs(s))).toBe(-500)
  })

  it("asks for nothing when the verdict is clear", () => {
    expect(fixSteps(captioned(), { captions: null, keep: null }, 1920)).toEqual([])
  })

  it("builds one step per fix, captions first", () => {
    const steps = fixSteps(captioned(), { captions: "up", keep: "left" }, 1920)
    expect(steps.map((s) => s.toolName)).toEqual(["move_captions", "crop"])
  })
})

describe("checkTag", () => {
  it("names the run and the frames, and the prefix finds it", () => {
    expect(checkTag("run-abc", 3)).toBe("check:run-abc:3f")
    expect(checkTag("run-abc", 3).startsWith(checkTagPrefix("run-abc"))).toBe(true)
  })
})
