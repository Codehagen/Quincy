import { describe, expect, it } from "vitest"

import { createScene } from "./document"
import { applyEffect, fade, punchIn } from "./edits"
import {
  effectChips,
  effectLabel,
  effectLanding,
  effectRowCount,
  MIN_EFFECT_US,
  previewMove,
  previewResize,
  type EffectChip,
} from "./effect-lane"
import { applyOps, newElement } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import { UNLOCKED, type Scene, type Track, type VideoElement } from "./types"

/** Two ten-second clips, laid end to end. */
function scene(): Scene {
  const base = createScene({})
  const main = findMainTrack(base)!

  main.elements = [0, 1].map((index) =>
    newElement<VideoElement>(
      {
        kind: "video",
        name: `clip ${index}`,
        mediaId: "va-1",
        startUs: secondsToUs(index * 10),
        durationUs: secondsToUs(10),
        trimStartUs: secondsToUs(index * 10),
        trimEndUs: secondsToUs(index * 10 + 10),
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
    )
  )

  return base
}

function apply(base: Scene, ops: ReturnType<typeof punchIn>): Scene {
  const document = {
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
      background: { type: "color" as const, color: "#000" },
    },
    scenes: [base],
    currentSceneId: base.id,
  }

  return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
    author: "user",
  }).snapshot.document.scenes[0]
}

function spine(base: Scene): Track {
  return findMainTrack(base)!
}

describe("effectChips", () => {
  it("has nothing to show on a cut with no effects", () => {
    expect(effectChips(spine(scene()))).toEqual([])
    expect(effectRowCount([])).toBe(0)
  })

  it("puts a punch-in where it happens in scene time", () => {
    const base = scene()
    // The second clip starts ten seconds in, and the curve on it is stored in
    // the clip's own clock. A chip drawn at the keyframe's raw time would sit
    // ten seconds to the left of the footage it applies to.
    const target = spine(base).elements[1]

    const after = apply(
      base,
      punchIn(base, target.id, {
        fromUs: secondsToUs(12),
        toUs: secondsToUs(16),
      })
    )

    const [chip] = effectChips(spine(after))

    expect(chip.kind).toBe("zoom")
    expect(chip.elementId).toBe(target.id)
    expect(chip.startUs).toBe(secondsToUs(12))
    expect(chip.durationUs).toBe(secondsToUs(4))
  })

  it("reports the peak, which is what the zoom is for", () => {
    const base = scene()
    const target = spine(base).elements[0]

    const after = apply(base, punchIn(base, target.id, { scale: 1.45 }))
    const [chip] = effectChips(spine(after))

    // The curve starts and ends at 1. Reading the first key would describe
    // every punch-in ever made as a zoom of exactly 1.
    expect(chip.amount).toBeCloseTo(1.45, 6)
    expect(effectLabel(chip)).toBe("Zoom ×1.45")
  })

  it("spans the clip for an effect with no curve", () => {
    const base = scene()
    const clip = spine(base).elements[0] as VideoElement

    const withStatic: Scene = {
      ...base,
      tracks: base.tracks.map((track) =>
        track.id === spine(base).id
          ? {
              ...track,
              elements: track.elements.map((element) =>
                element.id === clip.id
                  ? {
                      ...clip,
                      effects: [
                        {
                          id: "vfx-1",
                          type: "blur" as const,
                          enabled: true,
                          params: { intensity: 6 },
                        },
                      ],
                    }
                  : element
              ),
            }
          : track
      ),
    }

    const [chip] = effectChips(spine(withStatic))

    // A zero-width chip would hide every effect somebody set once and never
    // animated, which is most of them.
    expect(chip.startUs).toBe(0)
    expect(chip.durationUs).toBe(secondsToUs(10))
    // Units come from the catalogue now, so a blur reads in pixels rather than
    // as a bare number the chip gave no way to interpret.
    expect(effectLabel(chip)).toBe("Blur 6px")
  })

  it("draws a fade at each end and nothing in between", () => {
    const base = scene()
    const target = spine(base).elements[0]

    const after = apply(
      base,
      fade(base, target.id, { inUs: secondsToUs(1), outUs: secondsToUs(2) })
    )

    const chips = effectChips(spine(after))

    // One opacity channel holds both. Drawn as a single chip it would be a bar
    // across the whole clip, which is not what a fade is.
    expect(chips.map((chip) => chip.kind)).toEqual(["fade-in", "fade-out"])
    expect(chips[0].startUs).toBe(0)
    expect(chips[0].durationUs).toBe(secondsToUs(1))
    expect(chips[1].startUs).toBe(secondsToUs(8))
    expect(chips[1].durationUs).toBe(secondsToUs(2))
  })

  it("keeps effects that do not overlap on one row", () => {
    const base = scene()
    const [first, second] = spine(base).elements

    const once = apply(
      base,
      punchIn(base, first.id, { fromUs: us(0), toUs: secondsToUs(4) })
    )
    const twice = apply(
      once,
      punchIn(once, second.id, {
        fromUs: secondsToUs(12),
        toUs: secondsToUs(16),
      })
    )

    const chips = effectChips(spine(twice))

    expect(chips).toHaveLength(2)
    expect(effectRowCount(chips)).toBe(1)
  })

  it("adds a row only when two effects share a moment", () => {
    const base = scene()
    const target = spine(base).elements[0]

    // A zoom over the whole clip, and a fade at its head — the same seconds
    // twice, which one row cannot draw.
    const zoomed = apply(base, punchIn(base, target.id))
    const faded = apply(
      zoomed,
      fade(zoomed, target.id, { inUs: secondsToUs(1) })
    )

    const chips = effectChips(spine(faded))

    expect(effectRowCount(chips)).toBe(2)
    expect(new Set(chips.map((chip) => chip.row)).size).toBe(2)
  })

  it("treats touching as fitting, not colliding", () => {
    const base = scene()
    const target = spine(base).elements[0]

    const first = apply(
      base,
      punchIn(base, target.id, { fromUs: us(0), toUs: secondsToUs(4) })
    )
    // The second clip's push starts exactly where the first one's ends after
    // the ripple — a normal cut, not a conflict, so it stays on one row.
    const second = apply(
      first,
      punchIn(first, spine(first).elements[1].id, {
        fromUs: secondsToUs(10),
        toUs: secondsToUs(14),
      })
    )

    expect(effectRowCount(effectChips(spine(second)))).toBe(1)
  })

  it("gives every chip a stable id of its own", () => {
    const base = scene()
    const target = spine(base).elements[0]

    const zoomed = apply(base, punchIn(base, target.id))
    const faded = apply(
      zoomed,
      fade(zoomed, target.id, { inUs: secondsToUs(1), outUs: secondsToUs(1) })
    )

    const ids = effectChips(spine(faded)).map((chip) => chip.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("the drag preview", () => {
  /** A two-second effect sitting one second into a ten-second clip. */
  function chip(overrides: Partial<EffectChip> = {}): EffectChip {
    return {
      id: "ve-1:vfx-1",
      elementId: "ve-1",
      effectId: "vfx-1",
      kind: "zoom",
      startUs: secondsToUs(1),
      durationUs: secondsToUs(2),
      amount: 1.3,
      windowed: true,
      elementStartUs: 0,
      elementDurationUs: secondsToUs(10),
      row: 0,
      ...overrides,
    }
  }

  /** One ten-second clip, which is what chip() sits on. */
  const oneClip = [{ id: "ve-1", startUs: 0, durationUs: secondsToUs(10) }]

  it("follows the cursor while there is room", () => {
    expect(previewMove(chip(), secondsToUs(3), oneClip)).toEqual({
      startUs: secondsToUs(4),
      durationUs: secondsToUs(2),
    })
  })

  it("stops at the end of the clip rather than showing a place it cannot go", () => {
    // The bug this exists to prevent: an unclamped preview followed the cursor
    // past the clip, the op clamped on commit, and the drag snapped back with
    // nothing to say why.
    expect(previewMove(chip(), secondsToUs(60), oneClip).startUs).toBe(
      secondsToUs(8)
    )
    expect(previewMove(chip(), -secondsToUs(60), oneClip).startUs).toBe(0)
  })

  it("does not move an effect that already fills its clip", () => {
    // The range is empty here, and an unguarded clamp would return the upper
    // bound and slide a chip that has nowhere to go.
    const full = chip({ startUs: 0, durationUs: secondsToUs(10) })

    expect(previewMove(full, secondsToUs(5), oneClip).startUs).toBe(0)
    expect(previewMove(full, -secondsToUs(5), oneClip).startUs).toBe(0)
  })

  it("moves one edge and leaves the other", () => {
    expect(previewResize(chip(), "end", secondsToUs(1))).toEqual({
      startUs: secondsToUs(1),
      durationUs: secondsToUs(3),
    })
    expect(previewResize(chip(), "start", -secondsToUs(1))).toEqual({
      startUs: 0,
      durationUs: secondsToUs(3),
    })
  })

  it("stops both edges at the clip", () => {
    expect(previewResize(chip(), "end", secondsToUs(60)).durationUs).toBe(
      secondsToUs(9)
    )
    expect(previewResize(chip(), "start", -secondsToUs(60)).startUs).toBe(0)
  })

  it("never previews an effect shorter than the op allows", () => {
    expect(previewResize(chip(), "end", -secondsToUs(60)).durationUs).toBe(
      MIN_EFFECT_US
    )

    const squeezed = previewResize(chip(), "start", secondsToUs(60))
    expect(squeezed.durationUs).toBe(MIN_EFFECT_US)
    expect(squeezed.startUs + squeezed.durationUs).toBe(secondsToUs(3))
  })
})

describe("what can be dragged", () => {
  it("marks an effect with a curve as windowed", () => {
    const base = scene()
    const after = apply(
      base,
      punchIn(base, spine(base).elements[0].id, {
        fromUs: us(0),
        toUs: secondsToUs(4),
      })
    )

    expect(effectChips(spine(after))[0].windowed).toBe(true)
  })

  it("marks a look as not windowed", () => {
    // A look is a decision about the whole shot. There is no start to drag and
    // nothing between two ends, and both ops answer it with no ops at all — so
    // a chip that offered the gesture drew a drag the document refused.
    const base = scene()
    const after = apply(
      base,
      applyEffect(base, spine(base).elements[0].id, "brightness")
    )

    expect(effectChips(spine(after))[0].windowed).toBe(false)
  })

  it("carries the clip's span so the lane can clamp to it", () => {
    const base = scene()
    // The second clip: ten seconds in, ten seconds long.
    const after = apply(
      base,
      punchIn(base, spine(base).elements[1].id, {
        fromUs: secondsToUs(12),
        toUs: secondsToUs(14),
      })
    )

    const [chip] = effectChips(spine(after))

    expect(chip.elementStartUs).toBe(secondsToUs(10))
    expect(chip.elementDurationUs).toBe(secondsToUs(10))
  })
})

describe("effectLanding", () => {
  /** Three ten-second clips, the shape a split leaves behind. */
  const spineHosts = [
    { id: "a", startUs: 0, durationUs: secondsToUs(10) },
    { id: "b", startUs: secondsToUs(10), durationUs: secondsToUs(10) },
    { id: "c", startUs: secondsToUs(20), durationUs: secondsToUs(10) },
  ]

  const span = { startUs: secondsToUs(6), durationUs: secondsToUs(2) }

  it("stays on the same clip while the start does", () => {
    expect(effectLanding(spineHosts, span, secondsToUs(1))).toEqual({
      elementId: "a",
      startUs: secondsToUs(7),
      durationUs: secondsToUs(2),
    })
  })

  it("crosses a cut onto the clip holding the new start", () => {
    expect(effectLanding(spineHosts, span, secondsToUs(8))).toEqual({
      elementId: "b",
      startUs: secondsToUs(14),
      durationUs: secondsToUs(2),
    })
  })

  it("stops at the end of the track", () => {
    expect(effectLanding(spineHosts, span, secondsToUs(300))).toEqual({
      elementId: "c",
      startUs: secondsToUs(28),
      durationUs: secondsToUs(2),
    })
  })

  it("stops at the start of the track", () => {
    expect(effectLanding(spineHosts, span, -secondsToUs(300))).toEqual({
      elementId: "a",
      startUs: 0,
      durationUs: secondsToUs(2),
    })
  })

  it("truncates an effect longer than the clip it lands on", () => {
    // An effect is one entry on one element, so there is nowhere to store half
    // of it. Shrinking it here is what lets the preview show the truth.
    const long = { startUs: 0, durationUs: secondsToUs(8) }
    const short = [
      { id: "a", startUs: 0, durationUs: secondsToUs(10) },
      { id: "b", startUs: secondsToUs(10), durationUs: secondsToUs(3) },
    ]

    expect(effectLanding(short, long, secondsToUs(11))).toEqual({
      elementId: "b",
      startUs: secondsToUs(10),
      durationUs: secondsToUs(3),
    })
  })

  it("has nowhere to put an effect on an empty track", () => {
    expect(effectLanding([], span, 1000)).toBeNull()
  })
})
