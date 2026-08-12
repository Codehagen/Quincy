import { describe, expect, it } from "vitest"

import {
  cssFilter,
  cssObjectPosition,
  cssTransform,
  cssTransformOrigin,
  cubicBezier,
  isNeutral,
  NEUTRAL_VISUAL,
  resolveVisual,
  sampleChannel,
} from "./effects"
import { us } from "./time"
import type { AnimationChannel, Effect, Keyframe, VideoElement } from "./types"

function key(
  timeUs: number,
  value: number,
  interpolation: Keyframe["interpolation"] = "linear",
  easing?: [number, number, number, number]
): Keyframe {
  return { id: `k-${timeUs}`, timeUs: us(timeUs), value, interpolation, easing }
}

function channel(path: string, keys: Keyframe[]): AnimationChannel {
  return { path, keys }
}

function clip(overrides: Partial<VideoElement> = {}): VideoElement {
  return {
    id: "ve-1",
    kind: "video",
    name: "clip",
    startUs: us(0),
    durationUs: us(4_000_000),
    mediaId: "va-1",
    trimStartUs: us(0),
    trimEndUs: us(4_000_000),
    sourceDurationUs: us(4_000_000),
    transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
    opacity: 1,
    blendMode: "normal",
    volume: 1,
    muted: false,
    effects: [],
    animations: { channels: {} },
    provenance: { createdBy: "user", lastEditedBy: "user", fields: {} },
    ...overrides,
  }
}

describe("sampleChannel", () => {
  it("has nothing to say without keys", () => {
    expect(sampleChannel(undefined, 0)).toBeNull()
    expect(sampleChannel(channel("opacity", []), 0)).toBeNull()
  })

  it("clamps outside the keys rather than extrapolating", () => {
    // A punch-in written to land at 1.4 has one key at 1.4. A curve that kept
    // climbing past it would turn the rest of the clip into a slow drift.
    const zoom = channel("scale", [key(0, 1), key(1_000_000, 1.4)])

    expect(sampleChannel(zoom, -50_000)).toBe(1)
    expect(sampleChannel(zoom, 9_000_000)).toBe(1.4)
  })

  it("interpolates linearly between two keys", () => {
    const zoom = channel("scale", [key(0, 1), key(1_000_000, 2)])

    expect(sampleChannel(zoom, 500_000)).toBeCloseTo(1.5, 6)
  })

  it("walks to the right segment with more than two keys", () => {
    const zoom = channel("scale", [
      key(0, 1),
      key(1_000_000, 2),
      key(2_000_000, 2),
      key(3_000_000, 1),
    ])

    expect(sampleChannel(zoom, 1_500_000)).toBe(2)
    expect(sampleChannel(zoom, 2_500_000)).toBeCloseTo(1.5, 6)
  })

  it("holds flat across step and hold segments", () => {
    for (const interpolation of ["step", "hold"] as const) {
      const held = channel("scale", [
        key(0, 1, interpolation),
        key(1_000_000, 2),
      ])

      expect(sampleChannel(held, 999_999)).toBe(1)
      expect(sampleChannel(held, 1_000_000)).toBe(2)
    }
  })

  it("survives two keys on the same instant", () => {
    // A legal way to write a hard cut in a value. Dividing by that span is NaN,
    // and NaN in a transform blanks the frame.
    const cut = channel("scale", [
      key(0, 1),
      key(1_000_000, 1),
      key(1_000_000, 2),
    ])

    expect(sampleChannel(cut, 1_000_000)).toBe(2)
    expect(Number.isNaN(sampleChannel(cut, 999_999) as number)).toBe(false)
  })

  it("eases along a bezier", () => {
    const eased = channel("scale", [
      key(0, 0, "bezier", [0.22, 1, 0.36, 1]),
      key(1_000_000, 1),
    ])

    const half = sampleChannel(eased, 500_000) as number

    // easeOutQuint is most of the way there by the midpoint. The exact number
    // matters less than the shape: front-loaded, and still inside the range.
    expect(half).toBeGreaterThan(0.8)
    expect(half).toBeLessThan(1)
  })
})

describe("cubicBezier", () => {
  it("pins the ends", () => {
    expect(cubicBezier([0.4, 0, 0.2, 1], 0)).toBe(0)
    expect(cubicBezier([0.4, 0, 0.2, 1], 1)).toBe(1)
  })

  it("is the identity for the linear curve", () => {
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(cubicBezier([0, 0, 1, 1], x)).toBeCloseTo(x, 4)
    }
  })

  it("rises monotonically for a normal ease", () => {
    let previous = -1
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const y = cubicBezier([0.4, 0, 0.2, 1], x)
      expect(y).toBeGreaterThanOrEqual(previous)
      previous = y
    }
  })
})

describe("resolveVisual", () => {
  it("leaves an untouched clip neutral", () => {
    expect(isNeutral(resolveVisual(clip(), 0))).toBe(true)
  })

  it("draws a keyframed zoom", () => {
    const effect: Effect = {
      id: "vfx-1",
      type: "zoom",
      enabled: true,
      params: { scale: 1.4, originX: 0.5, originY: 0.5 },
    }

    const element = clip({
      effects: [effect],
      animations: {
        channels: {
          "effects.vfx-1.params.scale": channel("effects.vfx-1.params.scale", [
            key(0, 1),
            key(1_000_000, 1.4),
          ]),
        },
      },
    })

    expect(resolveVisual(element, 0).scale).toBe(1)
    expect(resolveVisual(element, 500_000).scale).toBeCloseTo(1.2, 6)
    expect(resolveVisual(element, 1_000_000).scale).toBeCloseTo(1.4, 6)
  })

  it("falls back to the stored param when nothing animates it", () => {
    const element = clip({
      effects: [
        { id: "vfx-1", type: "zoom", enabled: true, params: { scale: 1.25 } },
      ],
    })

    const visual = resolveVisual(element, 0)

    expect(visual.scale).toBe(1.25)
    // The origin was never written. Centre is the default, not zero — a missing
    // origin that read as 0,0 would punch into the top-left corner.
    expect(visual.originX).toBe(0.5)
    expect(visual.originY).toBe(0.5)
  })

  it("ignores a disabled effect", () => {
    const element = clip({
      effects: [
        { id: "vfx-1", type: "zoom", enabled: false, params: { scale: 2 } },
      ],
    })

    expect(resolveVisual(element, 0).scale).toBe(1)
  })

  it("composes two effects rather than letting the last one win", () => {
    const element = clip({
      effects: [
        { id: "vfx-1", type: "zoom", enabled: true, params: { scale: 1.2 } },
        { id: "vfx-2", type: "zoom", enabled: true, params: { scale: 1.5 } },
        { id: "vfx-3", type: "blur", enabled: true, params: { intensity: 4 } },
        { id: "vfx-4", type: "blur", enabled: true, params: { intensity: 2 } },
      ],
    })

    const visual = resolveVisual(element, 0)

    expect(visual.scale).toBeCloseTo(1.8, 6)
    expect(visual.blurPx).toBe(6)
  })

  it("multiplies the element's own transform into the zoom", () => {
    const element = clip({
      transform: {
        position: { x: 20, y: -10 },
        scaleX: 1.1,
        scaleY: 1.1,
        rotate: 3,
      },
      effects: [
        { id: "vfx-1", type: "zoom", enabled: true, params: { scale: 2 } },
      ],
    })

    const visual = resolveVisual(element, 0)

    expect(visual.scale).toBeCloseTo(2.2, 6)
    expect(visual.offsetX).toBe(20)
    expect(visual.offsetY).toBe(-10)
    expect(visual.rotate).toBe(3)
  })

  it("animates opacity for a fade", () => {
    const element = clip({
      animations: {
        channels: {
          opacity: channel("opacity", [key(0, 0), key(500_000, 1)]),
        },
      },
    })

    expect(resolveVisual(element, 0).opacity).toBe(0)
    expect(resolveVisual(element, 250_000).opacity).toBeCloseTo(0.5, 6)
    expect(resolveVisual(element, 2_000_000).opacity).toBe(1)
  })

  it("refuses values that would blank or mirror the frame", () => {
    // Reachable from a bezier whose control points sit outside 0–1, which is
    // what an overshoot curve is.
    const element = clip({
      effects: [
        { id: "vfx-1", type: "zoom", enabled: true, params: { scale: -0.5 } },
        { id: "vfx-2", type: "blur", enabled: true, params: { intensity: -8 } },
      ],
      opacity: 4,
    })

    const visual = resolveVisual(element, 0)

    expect(visual.scale).toBe(0)
    expect(visual.blurPx).toBe(0)
    expect(visual.opacity).toBe(1)
  })
})

describe("css output", () => {
  it("says nothing when there is nothing to do", () => {
    const neutral = resolveVisual(clip(), 0)

    // Not "scale(1)" and not "blur(0px)": either one promotes the clip to its
    // own compositing layer and rasterises a video decoder through it for no
    // visible reason.
    expect(cssTransform(neutral)).toBeUndefined()
    expect(cssTransformOrigin(neutral)).toBeUndefined()
    expect(cssFilter(neutral)).toBeUndefined()
  })

  it("translates before it scales", () => {
    const element = clip({
      transform: { position: { x: 40, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
      effects: [
        { id: "vfx-1", type: "zoom", enabled: true, params: { scale: 2 } },
      ],
    })

    // The other order would scale the offset, so a punch-in would drag a
    // positioned clip across the canvas as it grew.
    expect(cssTransform(resolveVisual(element, 0))).toBe(
      "translate(40px, 0px) scale(2)"
    )
  })

  it("only names an origin that is not the centre", () => {
    const centred = clip({
      effects: [
        { id: "vfx-1", type: "zoom", enabled: true, params: { scale: 1.4 } },
      ],
    })
    const offset = clip({
      effects: [
        {
          id: "vfx-1",
          type: "zoom",
          enabled: true,
          params: { scale: 1.4, originX: 0.3, originY: 0.25 },
        },
      ],
    })

    expect(cssTransformOrigin(resolveVisual(centred, 0))).toBeUndefined()
    expect(cssTransformOrigin(resolveVisual(offset, 0))).toBe("30% 25%")
  })

  it("writes the colour effects as one filter", () => {
    const element = clip({
      effects: [
        { id: "vfx-1", type: "blur", enabled: true, params: { intensity: 3 } },
        {
          id: "vfx-2",
          type: "brightness",
          enabled: true,
          params: { amount: 1.2 },
        },
        {
          id: "vfx-3",
          type: "saturation",
          enabled: true,
          params: { amount: 0 },
        },
      ],
    })

    expect(cssFilter(resolveVisual(element, 0))).toBe(
      "blur(3px) brightness(1.2) saturate(0)"
    )
  })
})

describe("crop", () => {
  it("centres what is kept unless told otherwise", () => {
    const visual = resolveVisual(clip(), 0)

    expect(visual.cropX).toBe(0.5)
    expect(visual.cropY).toBe(0.5)
    // The common case writes no style at all.
    expect(cssObjectPosition(visual)).toBeUndefined()
  })

  it("keeps the part the element names", () => {
    const element = clip({ crop: { x: 0.15, y: 0.5 } })

    expect(cssObjectPosition(resolveVisual(element, 0))).toBe("15% 50%")
  })

  it("pans when the crop is keyframed", () => {
    // Two keys on crop.x is a slow move across a wide shot inside a vertical
    // frame, which is otherwise a second composition.
    const element = clip({
      crop: { x: 0.2, y: 0.5 },
      animations: {
        channels: {
          "crop.x": channel("crop.x", [key(0, 0.2), key(2_000_000, 0.8)]),
        },
      },
    })

    expect(resolveVisual(element, 0).cropX).toBeCloseTo(0.2, 6)
    expect(resolveVisual(element, 1_000_000).cropX).toBeCloseTo(0.5, 6)
    expect(resolveVisual(element, 2_000_000).cropX).toBeCloseTo(0.8, 6)
  })

  it("stays inside the source", () => {
    // Past the edges there is nothing to show, so an overshooting pan would
    // slide the picture off the frame and leave background behind it.
    const element = clip({
      animations: {
        channels: { "crop.x": channel("crop.x", [key(0, -2), key(1_000, 4)]) },
      },
    })

    expect(resolveVisual(element, 0).cropX).toBe(0)
    expect(resolveVisual(element, 1_000).cropX).toBe(1)
  })

  it("counts a moved crop as something to draw", () => {
    expect(
      isNeutral(resolveVisual(clip({ crop: { x: 0.2, y: 0.5 } }), 0))
    ).toBe(false)
  })
})

describe("the looks", () => {
  it("emits every filter it was given, in the order they apply", () => {
    // grayscale before saturate would make a saturation change on the same clip
    // do nothing at all, which reads as a broken control rather than as an
    // order of operations.
    const visual = {
      ...NEUTRAL_VISUAL,
      brightness: 1.2,
      contrast: 1.1,
      saturation: 0.8,
      hueDeg: 30,
      grayscale: 0.5,
    }

    expect(cssFilter(visual)).toBe(
      "brightness(1.2) contrast(1.1) saturate(0.8) hue-rotate(30deg) grayscale(0.5)"
    )
  })

  it("writes nothing for a picture nobody touched", () => {
    expect(cssFilter(NEUTRAL_VISUAL)).toBeUndefined()
  })

  it("takes the strongest look rather than adding them up", () => {
    // Two 60% black-and-whites are not 120%. Adding would make a second one
    // silently finish the first.
    const element = clip({
      effects: [
        { id: "a", type: "grayscale", enabled: true, params: { amount: 0.6 } },
        { id: "b", type: "grayscale", enabled: true, params: { amount: 0.4 } },
      ],
    })

    expect(resolveVisual(element, 0).grayscale).toBe(0.6)
  })

  it("adds hue shifts and wraps them round the wheel", () => {
    // Two 200° turns is 40°, not 400°. Clamping would park it on red.
    const element = clip({
      effects: [
        { id: "a", type: "hue", enabled: true, params: { degrees: 200 } },
        { id: "b", type: "hue", enabled: true, params: { degrees: 200 } },
      ],
    })

    expect(resolveVisual(element, 0).hueDeg).toBe(40)
  })

  it("multiplies contrast the way it multiplies brightness", () => {
    const element = clip({
      effects: [
        { id: "a", type: "contrast", enabled: true, params: { amount: 1.5 } },
        { id: "b", type: "contrast", enabled: true, params: { amount: 2 } },
      ],
    })

    expect(resolveVisual(element, 0).contrast).toBe(3)
  })

  it("counts a look as something to draw", () => {
    expect(isNeutral({ ...NEUTRAL_VISUAL, sepia: 0.3 })).toBe(false)
    expect(isNeutral({ ...NEUTRAL_VISUAL, contrast: 1.2 })).toBe(false)
    expect(isNeutral({ ...NEUTRAL_VISUAL, hueDeg: 15 })).toBe(false)
  })
})
