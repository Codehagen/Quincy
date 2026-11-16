import type {
  AnimationChannel,
  Animations,
  Effect,
  Keyframe,
  TimelineElement,
  Transform,
} from "./types"

/**
 * What an element looks like on one frame.
 *
 * The document stores intent — an effects array, a transform, and animation
 * channels that move them — and none of that is something a browser can draw.
 * This file is the one place that turns the intent into numbers, and both the
 * preview and the export read it, for the same reason they share a compositor:
 * a second evaluator is a second answer, and the one the user approved is the
 * one that has to render.
 *
 * It is deliberately not a React hook and imports nothing from Remotion. The
 * sampling is arithmetic over keyframes, so it runs in a test in node, in the
 * agent when it needs to describe what a clip is doing, and in the composition
 * on every frame — rather than only inside a component that has to be mounted
 * in a player to be asked a question.
 */

export type ResolvedVisual = {
  /** Multiplied into the clip's own scale. 1.0 is the untouched frame. */
  scale: number
  /** The point the zoom pushes into, in 0–1 of the frame. Centre is 0.5, 0.5. */
  originX: number
  originY: number
  /** Canvas pixels. */
  offsetX: number
  offsetY: number
  rotate: number
  /**
   * Which part of the source survives a crop, in 0–1. Animatable, which is what
   * makes a slow pan across a wide shot inside a vertical frame expressible —
   * two keyframes on `crop.x` rather than a second composition.
   */
  cropX: number
  cropY: number
  opacity: number
  blurPx: number
  brightness: number
  saturation: number
  contrast: number
  /** Degrees around the colour wheel. 0 and 360 are the same picture. */
  hueDeg: number
  /** 0–1, how far towards the effect. These three read as a look, not a level. */
  grayscale: number
  sepia: number
  invert: number
}

export const NEUTRAL_VISUAL: ResolvedVisual = {
  scale: 1,
  originX: 0.5,
  originY: 0.5,
  offsetX: 0,
  offsetY: 0,
  rotate: 0,
  cropX: 0.5,
  cropY: 0.5,
  opacity: 1,
  blurPx: 0,
  brightness: 1,
  saturation: 1,
  contrast: 1,
  hueDeg: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
}

/**
 * Every effect's parameters and the value that means "off".
 *
 * `params` is a bare `Record<string, number>` in the document, which is what
 * lets an effect gain a parameter without a migration — and what makes reading
 * one a guess unless the defaults live somewhere. A punch-in written by the
 * agent with only `scale` set still needs an origin, and it needs the same
 * origin the UI would have given it.
 *
 * `blur.intensity` rather than `blur.radius` because `types.ts` names that path
 * in the one worked example it gives, and a channel path is stored data.
 */
export const EFFECT_DEFAULTS = {
  zoom: { scale: 1, originX: 0.5, originY: 0.5 },
  blur: { intensity: 0 },
  brightness: { amount: 1 },
  saturation: { amount: 1 },
  contrast: { amount: 1 },
  hue: { degrees: 0 },
  grayscale: { amount: 0 },
  sepia: { amount: 0 },
  invert: { amount: 0 },
} as const satisfies Record<Effect["type"], Record<string, number>>

/**
 * Sample a channel at a time, in the element's own clock.
 *
 * Outside the keys it clamps rather than extrapolating. A punch-in written to
 * hold at 1.4 has one key at 1.4, and a curve that kept climbing past it would
 * turn every animation into a slow drift for the rest of the clip.
 */
export function sampleChannel(
  channel: AnimationChannel | undefined,
  timeUs: number
): number | null {
  const keys = channel?.keys
  if (!keys || keys.length === 0) return null
  if (keys.length === 1) return keys[0].value

  const first = keys[0]
  if (timeUs <= first.timeUs) return first.value

  const last = keys[keys.length - 1]
  if (timeUs >= last.timeUs) return last.value

  // Keys are kept ordered by the ops rather than sorted on read, which is what
  // makes this a walk instead of a sort on every frame of every channel.
  let index = 0
  while (index < keys.length - 2 && keys[index + 1].timeUs <= timeUs) index++

  const from = keys[index]
  const to = keys[index + 1]

  const span = to.timeUs - from.timeUs
  // Two keys on the same instant is a legal way to write a hard cut in a value.
  // Dividing by that span is NaN, and NaN in a transform blanks the frame.
  if (span <= 0) return to.value

  const progress = (timeUs - from.timeUs) / span

  return from.value + (to.value - from.value) * ease(from, progress)
}

/**
 * The eased progress across one segment.
 *
 * `step` and `hold` both evaluate as flat across the segment, changing at the
 * next key. `types.ts` distinguishes them ("step jumps at the next key, hold
 * stays flat until it") and the two descriptions are the same behaviour, so
 * rather than invent a difference they are the same here. Worth settling before
 * anything authors a `step` key expecting it to be the other thing.
 */
function ease(from: Keyframe, progress: number): number {
  switch (from.interpolation) {
    case "linear":
      return progress
    case "step":
    case "hold":
      return 0
    case "bezier":
      return from.easing ? cubicBezier(from.easing, progress) : progress
  }
}

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` evaluated at x.
 *
 * The curve is parametric — the stored control points give x and y in terms of
 * t, and what we want is y in terms of x — so the x is solved for first. Newton
 * converges in a couple of steps on the curves anyone actually writes, and
 * bisection catches the ones with a near-flat region where its derivative is
 * useless.
 */
export function cubicBezier(
  [x1, y1, x2, y2]: [number, number, number, number],
  x: number
): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  let t = x

  for (let i = 0; i < 8; i++) {
    const error = bezierAt(x1, x2, t) - x
    if (Math.abs(error) < 1e-6) return bezierAt(y1, y2, t)

    const slope = bezierSlope(x1, x2, t)
    if (Math.abs(slope) < 1e-6) break

    t -= error / slope
  }

  let low = 0
  let high = 1
  t = x

  for (let i = 0; i < 24; i++) {
    const value = bezierAt(x1, x2, t)
    if (Math.abs(value - x) < 1e-6) break
    if (value < x) low = t
    else high = t
    t = (low + high) / 2
  }

  return bezierAt(y1, y2, t)
}

/** One axis of a cubic bezier with endpoints pinned at 0 and 1. */
function bezierAt(c1: number, c2: number, t: number): number {
  const inverse = 1 - t
  return 3 * inverse * inverse * t * c1 + 3 * inverse * t * t * c2 + t * t * t
}

function bezierSlope(c1: number, c2: number, t: number): number {
  const inverse = 1 - t
  return (
    3 * inverse * inverse * c1 +
    6 * inverse * t * (c2 - c1) +
    3 * t * t * (1 - c2)
  )
}

/**
 * A value that may be animated: the channel if there is one, else the stored
 * number. Channels win, because a channel is only written when something is
 * meant to move, and the static value is what the element had before it did.
 */
function valueAt(
  animations: Animations | undefined,
  path: string,
  fallback: number,
  timeUs: number
): number {
  const sampled = sampleChannel(animations?.channels[path], timeUs)
  return sampled ?? fallback
}

function paramAt(
  effect: Effect,
  key: string,
  fallback: number,
  animations: Animations | undefined,
  timeUs: number
): number {
  return valueAt(
    animations,
    `effects.${effect.id}.params.${key}`,
    effect.params[key] ?? fallback,
    timeUs
  )
}

/**
 * What to draw, for one element on one frame.
 *
 * `localUs` is time within the element, not the scene — the same clock the
 * keyframes are stored in, so that trimming a clip does not shift its curve.
 *
 * Effects compose rather than override: two zooms multiply, two blurs add. The
 * agent stacking a punch-in on a clip that already has one should push in
 * further, not silently replace the first.
 */
export function resolveVisual(
  element: TimelineElement,
  localUs: number
): ResolvedVisual {
  const animations = "animations" in element ? element.animations : undefined
  const transform: Transform | undefined =
    "transform" in element ? element.transform : undefined
  const effects: Effect[] = "effects" in element ? element.effects : []

  const visual: ResolvedVisual = {
    ...NEUTRAL_VISUAL,
    scale: transform
      ? // One number, not two. The document carries scaleX and scaleY
        // separately and CSS can stretch an axis, but a stretched frame is
        // never what a cut wants — so the wider deformation stays expressible
        // in the document and the compositor draws the uniform part of it.
        (valueAt(animations, "transform.scaleX", transform.scaleX, localUs) +
          valueAt(animations, "transform.scaleY", transform.scaleY, localUs)) /
        2
      : 1,
    offsetX: transform
      ? valueAt(
          animations,
          "transform.position.x",
          transform.position.x,
          localUs
        )
      : 0,
    offsetY: transform
      ? valueAt(
          animations,
          "transform.position.y",
          transform.position.y,
          localUs
        )
      : 0,
    rotate: transform
      ? valueAt(animations, "transform.rotate", transform.rotate, localUs)
      : 0,
    cropX: valueAt(
      animations,
      "crop.x",
      "crop" in element ? (element.crop?.x ?? 0.5) : 0.5,
      localUs
    ),
    cropY: valueAt(
      animations,
      "crop.y",
      "crop" in element ? (element.crop?.y ?? 0.5) : 0.5,
      localUs
    ),
    opacity:
      "opacity" in element
        ? valueAt(animations, "opacity", element.opacity, localUs)
        : valueAt(animations, "opacity", 1, localUs),
  }

  for (const effect of effects) {
    if (!effect.enabled) continue

    switch (effect.type) {
      case "zoom": {
        const defaults = EFFECT_DEFAULTS.zoom
        visual.scale *= paramAt(
          effect,
          "scale",
          defaults.scale,
          animations,
          localUs
        )
        // The last zoom on the stack owns the framing. Averaging two origins
        // would push into a point neither effect asked for.
        visual.originX = paramAt(
          effect,
          "originX",
          defaults.originX,
          animations,
          localUs
        )
        visual.originY = paramAt(
          effect,
          "originY",
          defaults.originY,
          animations,
          localUs
        )
        break
      }
      case "blur":
        visual.blurPx += paramAt(
          effect,
          "intensity",
          EFFECT_DEFAULTS.blur.intensity,
          animations,
          localUs
        )
        break
      case "brightness":
        visual.brightness *= paramAt(
          effect,
          "amount",
          EFFECT_DEFAULTS.brightness.amount,
          animations,
          localUs
        )
        break
      case "saturation":
        visual.saturation *= paramAt(
          effect,
          "amount",
          EFFECT_DEFAULTS.saturation.amount,
          animations,
          localUs
        )
        break
      case "contrast":
        visual.contrast *= paramAt(
          effect,
          "amount",
          EFFECT_DEFAULTS.contrast.amount,
          animations,
          localUs
        )
        break
      case "hue":
        // Added, not multiplied. Hue is an angle: two 180° shifts are the
        // original picture, and multiplying them would be 32400°.
        visual.hueDeg += paramAt(
          effect,
          "degrees",
          EFFECT_DEFAULTS.hue.degrees,
          animations,
          localUs
        )
        break
      /**
       * The three looks take the strongest of whatever is asked for rather
       * than adding.
       *
       * Two 60% black-and-whites are not 120% black-and-white — there is no
       * such thing, `grayscale(1.2)` clamps to 1 in every browser, and adding
       * would make a second one silently finish the first. The stronger request
       * wins and the weaker one is already inside it.
       */
      case "grayscale":
        visual.grayscale = Math.max(
          visual.grayscale,
          paramAt(
            effect,
            "amount",
            EFFECT_DEFAULTS.grayscale.amount,
            animations,
            localUs
          )
        )
        break
      case "sepia":
        visual.sepia = Math.max(
          visual.sepia,
          paramAt(
            effect,
            "amount",
            EFFECT_DEFAULTS.sepia.amount,
            animations,
            localUs
          )
        )
        break
      case "invert":
        visual.invert = Math.max(
          visual.invert,
          paramAt(
            effect,
            "amount",
            EFFECT_DEFAULTS.invert.amount,
            animations,
            localUs
          )
        )
        break
    }
  }

  // A negative scale mirrors the picture and a negative blur throws; both are
  // reachable from a curve that overshoots, which is what a bezier with a
  // control point outside 0–1 is for.
  visual.scale = Math.max(0, visual.scale)
  visual.blurPx = Math.max(0, visual.blurPx)
  visual.brightness = Math.max(0, visual.brightness)
  visual.saturation = Math.max(0, visual.saturation)
  visual.contrast = Math.max(0, visual.contrast)
  visual.opacity = clamp01(visual.opacity)
  // Wrapped rather than clamped: 400° is 40°, and a curve that sweeps the whole
  // wheel should come back round instead of parking on red at the top.
  visual.hueDeg = ((visual.hueDeg % 360) + 360) % 360
  visual.grayscale = clamp01(visual.grayscale)
  visual.sepia = clamp01(visual.sepia)
  visual.invert = clamp01(visual.invert)
  // Past the edges of the source there is nothing to show, so a pan that
  // overshoots would slide the picture off the frame and leave background.
  visual.cropX = clamp01(visual.cropX)
  visual.cropY = clamp01(visual.cropY)

  return visual
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** Whether anything about this differs from an untouched frame. */
export function isNeutral(visual: ResolvedVisual): boolean {
  return (
    visual.scale === 1 &&
    visual.offsetX === 0 &&
    visual.offsetY === 0 &&
    visual.rotate === 0 &&
    visual.cropX === 0.5 &&
    visual.cropY === 0.5 &&
    visual.opacity === 1 &&
    visual.blurPx === 0 &&
    visual.contrast === 1 &&
    visual.hueDeg === 0 &&
    visual.grayscale === 0 &&
    visual.sepia === 0 &&
    visual.invert === 0 &&
    visual.brightness === 1 &&
    visual.saturation === 1
  )
}

/**
 * Where the picture sits inside a frame it overflows.
 *
 * Only meaningful under `object-fit: cover`, where the source is bigger than
 * the frame in one axis and something has to choose which part is lost. Left
 * off when it is the centre, so the common case writes no style at all.
 */
export function cssObjectPosition(visual: ResolvedVisual): string | undefined {
  if (visual.cropX === 0.5 && visual.cropY === 0.5) return undefined

  return `${visual.cropX * 100}% ${visual.cropY * 100}%`
}

/**
 * The transform as CSS, or undefined when there is nothing to apply.
 *
 * Undefined rather than `scale(1)`: a transform of any kind promotes the
 * element to its own compositing layer, and on a clip that is a video decoder
 * being asked to rasterise through one for no reason.
 *
 * Order matters and this is the order the numbers mean: translate the frame,
 * then rotate it, then push into it. Written the other way, the offset would
 * be scaled by the zoom, so a punch-in would drag a positioned clip across the
 * canvas as it grew.
 */
export function cssTransform(visual: ResolvedVisual): string | undefined {
  const parts: string[] = []

  if (visual.offsetX !== 0 || visual.offsetY !== 0) {
    parts.push(`translate(${visual.offsetX}px, ${visual.offsetY}px)`)
  }
  if (visual.rotate !== 0) parts.push(`rotate(${visual.rotate}deg)`)
  if (visual.scale !== 1) parts.push(`scale(${visual.scale})`)

  return parts.length > 0 ? parts.join(" ") : undefined
}

/** Where the scale pushes from, as a CSS origin. */
export function cssTransformOrigin(visual: ResolvedVisual): string | undefined {
  if (visual.scale === 1) return undefined
  if (visual.originX === 0.5 && visual.originY === 0.5) return undefined

  return `${visual.originX * 100}% ${visual.originY * 100}%`
}

/**
 * The colour effects as a CSS filter.
 *
 * Undefined when there is nothing to do, and for a harder reason than the
 * transform: `filter: blur(0px)` still rasterises the layer through the filter
 * pipeline every frame, which costs the same as a real blur and shows nothing.
 */
export function cssFilter(visual: ResolvedVisual): string | undefined {
  const parts: string[] = []

  if (visual.blurPx > 0) parts.push(`blur(${visual.blurPx}px)`)
  if (visual.brightness !== 1) parts.push(`brightness(${visual.brightness})`)
  if (visual.contrast !== 1) parts.push(`contrast(${visual.contrast})`)
  if (visual.saturation !== 1) parts.push(`saturate(${visual.saturation})`)
  if (visual.hueDeg !== 0) parts.push(`hue-rotate(${visual.hueDeg}deg)`)
  // After the levels, before nothing. `filter` applies left to right, and
  // draining the colour first would make a saturation change on the same clip
  // do nothing at all — which reads as a broken slider rather than as an order
  // of operations.
  if (visual.grayscale > 0) parts.push(`grayscale(${visual.grayscale})`)
  if (visual.sepia > 0) parts.push(`sepia(${visual.sepia})`)
  if (visual.invert > 0) parts.push(`invert(${visual.invert})`)

  return parts.length > 0 ? parts.join(" ") : undefined
}
