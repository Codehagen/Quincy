import { describe, expect, it } from "vitest"

import {
  EFFECTS,
  effectGroups,
  effectSpec,
  stepAmount,
} from "./effect-catalogue"
import { EFFECT_DEFAULTS } from "./effects"
import type { EffectType } from "./types"

describe("the catalogue", () => {
  it("covers every effect the engine can draw", () => {
    // The panel lists this table. An effect missing from it renders but cannot
    // be reached, which is exactly the state blur, brightness and saturation
    // were in before any of this.
    const engine = Object.keys(EFFECT_DEFAULTS).sort()
    const catalogue = EFFECTS.map((spec) => spec.type).sort()

    expect(catalogue).toEqual(engine)
  })

  it("names a parameter the engine actually reads", () => {
    for (const spec of EFFECTS) {
      const params = EFFECT_DEFAULTS[spec.type] as Record<string, number>
      expect(Object.keys(params)).toContain(spec.param)
    }
  })

  it("agrees with the engine about what off means", () => {
    // A card writes `initial` and the neutral value is what removing it returns
    // to. If these disagreed, an effect set back to its neutral would leave a
    // chip on the lane that changes nothing.
    for (const spec of EFFECTS) {
      const params = EFFECT_DEFAULTS[spec.type] as Record<string, number>
      expect(spec.neutral).toBe(params[spec.param])
    }
  })

  it("starts every effect somewhere you can see", () => {
    // A card that applies the neutral value looks broken: you click Contrast,
    // a chip appears, and the picture is identical.
    for (const spec of EFFECTS) {
      expect(spec.initial).not.toBe(spec.neutral)
      expect(spec.initial).toBeGreaterThanOrEqual(spec.min)
      expect(spec.initial).toBeLessThanOrEqual(spec.max)
    }
  })

  it("groups every effect exactly once", () => {
    const grouped = effectGroups().flatMap((group) => group.effects)

    expect(grouped).toHaveLength(EFFECTS.length)
    expect(new Set(grouped.map((s) => s.type)).size).toBe(EFFECTS.length)
  })

  it("throws for an effect nobody wrote a spec for", () => {
    expect(() => effectSpec("nonsense" as EffectType)).toThrow()
  })
})

describe("stepAmount", () => {
  it("moves by the effect's own step", () => {
    expect(stepAmount("zoom", 1.3, 1)).toBe(1.35)
    expect(stepAmount("hue", 30, 1)).toBe(45)
    expect(stepAmount("blur", 6, -1)).toBe(5)
  })

  it("stops at the ends rather than running past them", () => {
    // A blur of -1 throws in CSS and a zoom of 0.95 mirrors nothing but reads
    // as a bug: the picture shrinks when you asked it to push in.
    expect(stepAmount("blur", 0, -1)).toBe(0)
    expect(stepAmount("zoom", 3, 1)).toBe(3)
    expect(stepAmount("grayscale", 1, 1)).toBe(1)
  })

  it("lands on the number the chip shows", () => {
    // 1.2 + 0.05 is 1.2500000000000002 in binary floating point, and a chip
    // that says ×1.25 next to a document holding that is a chip that lies.
    expect(stepAmount("zoom", 1.2, 1)).toBe(1.25)
    expect(stepAmount("brightness", 1.15, -1)).toBe(1.1)
  })
})
