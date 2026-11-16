import type { EffectType } from "./types"

/**
 * What you can put on a clip, in the words you would use for it.
 *
 * One table, read by the panel, the tuning controls, the lane chips and the
 * agent's tool description. Those four had drifted before this existed: the
 * chip formatted a zoom as `×1.30` and the toolbar stepped it by 0.05, and
 * nothing said the two belonged to the same effect except that they happened to
 * agree. Adding contrast meant editing four files and remembering all four.
 *
 * The names are the user's, not the engine's. `hue` is the param and the CSS
 * function; "Colour shift" is what it does to your video. `grayscale` is a
 * filter; "Black and white" is a look somebody asks for. The one place the
 * engine's name survives is the chip label, because a chip is 40px wide.
 */

export type EffectKind = "movement" | "look"

export type EffectSpec = {
  type: EffectType
  /** Sentence case, the user's word for it. */
  label: string
  /** One line, what it does to the picture rather than what it does in CSS. */
  description: string
  kind: EffectKind
  /** The parameter a card writes and a stepper changes. */
  param: string
  /** What the parameter means when the effect is doing nothing. */
  neutral: number
  /** What a card applies on the first click. Visible, not subtle. */
  initial: number
  min: number
  max: number
  step: number
  /** How the number reads on a chip and in the toolbar. */
  format: (value: number) => string
}

const times = (value: number) => `×${value.toFixed(2)}`
const percent = (value: number) => `${Math.round(value * 100)}%`

/**
 * Ordered as the panel lists them: the one that moves first, then the looks
 * from most reached-for to least. Brightness and contrast lead because they are
 * what "it looks a bit flat" means nine times out of ten.
 */
export const EFFECTS: EffectSpec[] = [
  {
    type: "zoom",
    label: "Zoom",
    description: "Push in on a moment, and ease back out",
    kind: "movement",
    param: "scale",
    neutral: 1,
    initial: 1.3,
    min: 1,
    max: 3,
    step: 0.05,
    format: times,
  },
  {
    type: "brightness",
    label: "Brightness",
    description: "Lift a dark take, or pull back a blown-out one",
    kind: "look",
    param: "amount",
    neutral: 1,
    initial: 1.15,
    min: 0,
    max: 2,
    step: 0.05,
    format: times,
  },
  {
    type: "contrast",
    label: "Contrast",
    description: "Push the blacks and whites apart",
    kind: "look",
    param: "amount",
    neutral: 1,
    initial: 1.2,
    min: 0,
    max: 2,
    step: 0.05,
    format: times,
  },
  {
    type: "saturation",
    label: "Saturation",
    description: "How much colour the picture carries",
    kind: "look",
    param: "amount",
    neutral: 1,
    initial: 1.25,
    min: 0,
    max: 2,
    step: 0.05,
    format: times,
  },
  {
    type: "blur",
    label: "Blur",
    description: "Soften the picture, for a background or a reveal",
    kind: "look",
    param: "intensity",
    neutral: 0,
    initial: 6,
    min: 0,
    max: 40,
    step: 1,
    // Whole pixels. A blur of 6.25px is not a thing anyone can see the
    // difference of, and the decimal makes the readout jitter as you step.
    format: (value) => `${Math.round(value)}px`,
  },
  {
    type: "hue",
    label: "Colour shift",
    description: "Turn every colour round the wheel",
    kind: "look",
    param: "degrees",
    neutral: 0,
    initial: 30,
    min: 0,
    max: 360,
    // 15° a press. Fine enough to warm a skin tone, coarse enough to get all
    // the way round in a sitting.
    step: 15,
    format: (value) => `${Math.round(value)}°`,
  },
  {
    type: "grayscale",
    label: "Black and white",
    description: "Drain the colour out",
    kind: "look",
    param: "amount",
    neutral: 0,
    // All the way, because a half black-and-white is a thing you arrive at
    // rather than a thing you ask for.
    initial: 1,
    min: 0,
    max: 1,
    step: 0.1,
    format: percent,
  },
  {
    type: "sepia",
    label: "Sepia",
    description: "Warm and faded, like old footage",
    kind: "look",
    param: "amount",
    neutral: 0,
    initial: 1,
    min: 0,
    max: 1,
    step: 0.1,
    format: percent,
  },
  {
    type: "invert",
    label: "Invert",
    description: "Flip every colour to its opposite",
    kind: "look",
    param: "amount",
    neutral: 0,
    initial: 1,
    min: 0,
    max: 1,
    step: 0.1,
    format: percent,
  },
]

const BY_TYPE = new Map(EFFECTS.map((spec) => [spec.type, spec]))

export function effectSpec(type: EffectType): EffectSpec {
  const spec = BY_TYPE.get(type)
  // Every EffectType has a spec, and the type system says so — this throws
  // rather than returning a default because a missing spec means somebody added
  // an effect the panel cannot show and the toolbar cannot tune, and silently
  // handing back a zoom's numbers would hide that until someone tried to use it.
  if (!spec) throw new Error(`No spec for effect type: ${type}`)
  return spec
}

/** The panel's sections, in order, skipping any that would be empty. */
export function effectGroups(): {
  kind: EffectKind
  title: string
  effects: EffectSpec[]
}[] {
  return [
    { kind: "movement" as const, title: "Movement" },
    { kind: "look" as const, title: "Look" },
  ]
    .map((group) => ({
      ...group,
      effects: EFFECTS.filter((spec) => spec.kind === group.kind),
    }))
    .filter((group) => group.effects.length > 0)
}

/**
 * The value one step away, kept inside the effect's range and off the floating
 * point fuzz that turns 1.2 into 1.2000000000000002 on a chip.
 */
export function stepAmount(
  type: EffectType,
  from: number,
  direction: 1 | -1
): number {
  const spec = effectSpec(type)
  const next = from + spec.step * direction
  const clamped = Math.min(spec.max, Math.max(spec.min, next))

  return Math.round(clamped * 1000) / 1000
}
