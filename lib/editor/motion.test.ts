import { describe, expect, it } from "vitest"

import { createScene } from "./document"
import { moveEffect, punchIn } from "./edits"
import { resolveVisual } from "./effects"
import { DEFAULT_TEXT_MOTION, motionUs, textMotion, textPoseAt } from "./motion"
import { applyToScene, newElement, type EditOp } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import { addText, editText, textOpacity } from "./titles"
import type { Scene, TextElement, VideoElement } from "./types"
import { aimPoints, aimZoom, clearAim } from "./zoom-aim"
import { zoomKindOptions, zoomPeakUs } from "./zoom-kinds"

const CANVAS = { width: 1920, height: 1080 }
const TRANSFORM = { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 }

function clip(index: number): VideoElement {
  return newElement<VideoElement>(
    {
      kind: "video",
      name: `clip ${index}`,
      mediaId: "va-1",
      startUs: secondsToUs(index * 10),
      durationUs: secondsToUs(10),
      trimStartUs: secondsToUs(index * 10),
      trimEndUs: secondsToUs(index * 10 + 10),
      sourceDurationUs: secondsToUs(60),
      transform: TRANSFORM,
      opacity: 1,
      blendMode: "normal",
      volume: 1,
      muted: false,
      effects: [],
      animations: { channels: {} },
    },
    "user"
  )
}

function scene(): Scene {
  const base = createScene({})
  findMainTrack(base)!.elements = [0, 1].map((index) => clip(index))
  return base
}

const apply = (base: Scene, ops: EditOp[]) => applyToScene(base, ops, "user")
const clipAt = (base: Scene, index: number) =>
  findMainTrack(base)!.elements[index] as VideoElement

describe("text motion", () => {
  it("keeps the old fade for a text nobody chose a motion for", () => {
    const motion = textMotion(undefined)
    expect(motion).toEqual(DEFAULT_TEXT_MOTION)
    for (const at of [0, 100_000, 1_500_000, 2_900_000, 3_000_000]) {
      expect(textPoseAt(at, 3_000_000, motion, CANVAS).opacity).toBeCloseTo(
        textOpacity(at, 3_000_000)
      )
    }
  })

  it("rests exactly at its place between the entrance and the exit", () => {
    for (const move of ["fade", "rise", "pop", "slide", "blur"] as const) {
      const pose = textPoseAt(
        1_500_000,
        3_000_000,
        { move, feel: "smooth" },
        CANVAS
      )
      expect(pose).toEqual({ opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0 })
    }
  })

  it("starts each move away from its place and leaves the same way", () => {
    const rise = { move: "rise", feel: "smooth" } as const
    expect(textPoseAt(0, 3_000_000, rise, CANVAS).dy).toBeGreaterThan(0)
    expect(textPoseAt(3_000_000, 3_000_000, rise, CANVAS).dy).toBeCloseTo(
      textPoseAt(0, 3_000_000, rise, CANVAS).dy
    )
    expect(
      textPoseAt(0, 3_000_000, { move: "slide", feel: "smooth" }, CANVAS).dx
    ).toBeLessThan(0)
    expect(
      textPoseAt(0, 3_000_000, { move: "pop", feel: "smooth" }, CANVAS).scale
    ).toBeLessThan(1)
    expect(
      textPoseAt(0, 3_000_000, { move: "blur", feel: "smooth" }, CANVAS).blurPx
    ).toBeGreaterThan(0)
  })

  it("lets a pop overshoot a little on the way in, never a lot", () => {
    const pop = { move: "pop", feel: "smooth" } as const
    const scales = Array.from(
      { length: 40 },
      (_, i) => textPoseAt(i * 10_000, 3_000_000, pop, CANVAS).scale
    )
    expect(Math.max(...scales)).toBeGreaterThan(1)
    expect(Math.max(...scales)).toBeLessThan(1.05)
  })

  it("is quicker when snappy and absent when none", () => {
    expect(motionUs({ move: "rise", feel: "snappy" })).toBeLessThan(
      motionUs({ move: "rise", feel: "smooth" })
    )
    expect(
      textPoseAt(0, 3_000_000, { move: "none", feel: "smooth" }, CANVAS).opacity
    ).toBe(1)
  })

  it("never lets the entrance and exit overlap on a short text", () => {
    const rise = { move: "rise", feel: "smooth" } as const
    // 600ms: each end gets a third at most, so the middle still rests.
    expect(textPoseAt(300_000, 600_000, rise, CANVAS).opacity).toBe(1)
  })

  it("reads a damaged stored motion field by field", () => {
    expect(textMotion({ move: "spin", feel: "snappy" })).toEqual({
      move: "fade",
      feel: "snappy",
    })
  })

  it("is stored on a new text and changed on an existing one", () => {
    const base = scene()
    const added = apply(
      base,
      addText(base, {
        role: "title",
        content: "Hello",
        motion: { move: "pop", feel: "snappy" },
        author: "user",
      })
    )
    const text = added.tracks
      .flatMap((track) => track.elements)
      .find((element): element is TextElement => element.kind === "text")!
    expect(text.motion).toEqual({ move: "pop", feel: "snappy" })

    const changed = apply(
      added,
      editText(added, text.id, { motion: { move: "rise", feel: "snappy" } })
    )
    const after = changed.tracks
      .flatMap((track) => track.elements)
      .find((element) => element.id === text.id) as TextElement
    expect(after.motion).toEqual({ move: "rise", feel: "snappy" })

    // The same motion again is not an edit.
    expect(
      editText(changed, text.id, { motion: { move: "rise", feel: "snappy" } })
    ).toEqual([])
  })
})

describe("zoom kinds", () => {
  function scaleKeys(kind: "push" | "punch" | "drift") {
    const base = scene()
    const target = clipAt(base, 0)
    const after = apply(
      base,
      punchIn(base, target.id, {
        fromUs: us(1_000_000),
        toUs: us(3_000_000),
        ...zoomKindOptions(kind),
      })
    )
    const element = clipAt(after, 0)
    const effect = element.effects[0]
    return {
      element,
      keys: element.animations.channels[`effects.${effect.id}.params.scale`]
        .keys,
    }
  }

  it("punches in within a frame and comes back", () => {
    const { keys } = scaleKeys("punch")
    expect(keys[1].timeUs - keys[0].timeUs).toBeLessThanOrEqual(34_000)
    expect(keys.at(-1)!.value).toBe(1)
  })

  it("drifts in across the whole window and cuts back at its end", () => {
    const { element, keys } = scaleKeys("drift")
    expect(keys.map((key) => key.value)).toEqual([1, 1.08, 1])
    // Still creeping in half-way through, not landed.
    const middle = resolveVisual(element, 2_000_000).scale
    expect(middle).toBeGreaterThan(1)
    expect(middle).toBeLessThan(1.08)
    // Back to the full frame right after the window.
    expect(resolveVisual(element, 3_000_000).scale).toBe(1)
  })

  it("parks the playhead where each kind is furthest in", () => {
    expect(zoomPeakUs("push", 0, 2_000_000, 600_000)).toBe(600_000)
    expect(zoomPeakUs("drift", 0, 2_000_000, 600_000)).toBe(1_900_000)
    expect(zoomPeakUs("punch", 0, 2_000_000, 600_000)).toBeLessThan(100_000)
  })
})

describe("a close-up that follows a point", () => {
  function zoomed() {
    const base = scene()
    const after = apply(
      base,
      punchIn(base, clipAt(base, 0).id, {
        fromUs: us(1_000_000),
        toUs: us(5_000_000),
      })
    )
    const element = clipAt(after, 0)
    return { scene: after, element, effectId: element.effects[0].id }
  }

  it("aims the whole zoom at one point", () => {
    const { scene: base, element, effectId } = zoomed()
    const after = apply(
      base,
      aimZoom(base, element.id, effectId, 2_000_000, { x: 0.2, y: 0.3 })
    )
    const visual = resolveVisual(clipAt(after, 0), 1_600_000)
    expect(visual.originX).toBeCloseTo(0.2)
    expect(visual.originY).toBeCloseTo(0.3)
  })

  it("glides between two points and holds the last", () => {
    const { scene: base, element, effectId } = zoomed()
    const one = apply(
      base,
      aimZoom(base, element.id, effectId, 1_500_000, { x: 0.2, y: 0.5 })
    )
    const two = apply(
      one,
      aimZoom(one, element.id, effectId, 3_500_000, { x: 0.8, y: 0.5 })
    )
    const at = (localUs: number) =>
      resolveVisual(clipAt(two, 0), localUs).originX
    expect(at(1_500_000)).toBeCloseTo(0.2)
    expect(at(2_500_000)).toBeCloseTo(0.5)
    expect(at(3_500_000)).toBeCloseTo(0.8)
    expect(at(4_000_000)).toBeCloseTo(0.8)
    expect(aimPoints(two, element.id, effectId).map((p) => p.x)).toEqual([
      0.2, 0.8,
    ])
  })

  it("moves a point clicked again a moment later instead of adding one", () => {
    const { scene: base, element, effectId } = zoomed()
    const one = apply(
      base,
      aimZoom(base, element.id, effectId, 2_000_000, { x: 0.2, y: 0.5 })
    )
    const two = apply(
      one,
      aimZoom(one, element.id, effectId, 2_100_000, { x: 0.25, y: 0.5 })
    )
    expect(aimPoints(two, element.id, effectId)).toHaveLength(1)
    expect(aimPoints(two, element.id, effectId)[0].x).toBe(0.25)
  })

  it("keeps a point inside the frame", () => {
    const { scene: base, element, effectId } = zoomed()
    const after = apply(
      base,
      aimZoom(base, element.id, effectId, 2_000_000, { x: 1.4, y: -0.2 })
    )
    expect(aimPoints(after, element.id, effectId)[0]).toMatchObject({
      x: 1,
      y: 0,
    })
  })

  it("clears back to the plain push", () => {
    const { scene: base, element, effectId } = zoomed()
    const aimed = apply(
      base,
      aimZoom(base, element.id, effectId, 2_000_000, { x: 0.2, y: 0.3 })
    )
    const cleared = apply(aimed, clearAim(aimed, element.id, effectId))
    expect(aimPoints(cleared, element.id, effectId)).toEqual([])
  })

  it("brings its points along when the zoom is moved", () => {
    const { scene: base, element, effectId } = zoomed()
    const aimed = apply(
      base,
      aimZoom(base, element.id, effectId, 2_000_000, { x: 0.2, y: 0.3 })
    )
    const moved = apply(
      aimed,
      moveEffect(aimed, element.id, effectId, 1_000_000)
    )
    expect(aimPoints(moved, element.id, effectId)[0].timeUs).toBe(3_000_000)
  })

  it("does nothing for a zoom that is not there", () => {
    const { scene: base, element } = zoomed()
    expect(
      aimZoom(base, element.id, "nope", 2_000_000, { x: 0.2, y: 0.3 })
    ).toEqual([])
  })
})
