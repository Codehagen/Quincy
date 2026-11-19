/**
 * How a text arrives and leaves, picked from a grid rather than drawn on a
 * curve.
 *
 * A curve editor answers a question nobody making a talking-head cut is
 * asking. What they want to choose is the kind of entrance (does it fade, rise
 * into place, pop) and whether it is gentle or quick. So a text carries two
 * words, a move and a feel, and the numbers live here, once, for the preview
 * and the export alike (they share the compositor).
 *
 * The leave mirrors the entrance: a text that rose in sinks out, one that
 * popped in shrinks away. One choice, not two, because a different exit from
 * the entrance reads as a mistake far more often than as a decision.
 */

export const TEXT_MOVES = [
  "fade",
  "rise",
  "pop",
  "slide",
  "blur",
  "none",
] as const
export type TextMove = (typeof TEXT_MOVES)[number]

export const TEXT_FEELS = ["smooth", "snappy"] as const
export type TextFeel = (typeof TEXT_FEELS)[number]

export type TextMotion = { move: TextMove; feel: TextFeel }

/** What a text has when nobody chose: the short fade every text had before. */
export const DEFAULT_TEXT_MOTION: TextMotion = { move: "fade", feel: "smooth" }

export const TEXT_MOVE_LABEL: Record<TextMove, string> = {
  fade: "Fade",
  rise: "Rise",
  pop: "Pop",
  slide: "Slide",
  blur: "Focus",
  none: "None",
}

export const TEXT_MOVE_HINT: Record<TextMove, string> = {
  fade: "Comes up and goes down",
  rise: "Lifts into place",
  pop: "Grows in with a little give",
  slide: "Arrives from the left",
  blur: "Sharpens out of a blur",
  none: "On and off on the cut",
}

/**
 * How long the entrance takes. Smooth is the old fade's length plus a little,
 * because a move covers distance and a fade does not; snappy is short enough
 * to land on the beat of a word.
 */
const ENTER_US: Record<TextFeel, number> = { smooth: 400_000, snappy: 200_000 }

/** The plain fade keeps its original length, so old cuts look as they did. */
const FADE_US = 250_000

/** How far a rise travels, as a share of the frame's height. */
const RISE = 0.04
/** How far a slide travels, as a share of the frame's width. */
const SLIDE = 0.05
/** Where a pop starts. Below 0.8 it reads as a zoom, not a pop. */
const POP_FROM = 0.86
/** How soft the first frame of a focus is, in canvas pixels. */
const BLUR_FROM = 14

/** The state of a text at one instant: what the compositor applies. */
export type TextPose = {
  opacity: number
  /** Canvas pixels. */
  dx: number
  dy: number
  scale: number
  /** Canvas pixels. */
  blurPx: number
}

const REST: TextPose = { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0 }

/** Read a stored motion, falling back field by field. */
export function textMotion(value: unknown): TextMotion {
  const raw = (value ?? {}) as Partial<Record<keyof TextMotion, unknown>>
  return {
    move: TEXT_MOVES.includes(raw.move as TextMove)
      ? (raw.move as TextMove)
      : DEFAULT_TEXT_MOTION.move,
    feel: TEXT_FEELS.includes(raw.feel as TextFeel)
      ? (raw.feel as TextFeel)
      : DEFAULT_TEXT_MOTION.feel,
  }
}

/** The length of the entrance (and the exit) for a motion. */
export function motionUs(motion: TextMotion): number {
  if (motion.move === "none") return 0
  if (motion.move === "fade" && motion.feel === "smooth") return FADE_US
  return ENTER_US[motion.feel]
}

/**
 * Where a text is at a point inside it.
 *
 * `progress` runs 0 → 1 across the entrance and 1 → 0 across the exit, so the
 * exit is the entrance played backwards and the two can never disagree.
 */
export function textPoseAt(
  elementUs: number,
  durationUs: number,
  motion: TextMotion,
  canvas: { width: number; height: number }
): TextPose {
  const length = Math.min(motionUs(motion), durationUs / 3)
  if (length <= 0) return REST

  const linear =
    elementUs < length
      ? elementUs / length
      : elementUs > durationUs - length
        ? (durationUs - elementUs) / length
        : 1
  const t = Math.min(1, Math.max(0, linear))
  if (t >= 1) return REST

  const eased = motion.feel === "snappy" ? easeOutQuint(t) : easeOutCubic(t)
  const away = 1 - eased

  switch (motion.move) {
    case "fade":
      // Linear, as the original fade was: opacity eased reads as a pop of light.
      return { ...REST, opacity: t }
    case "rise":
      return { ...REST, opacity: t, dy: away * RISE * canvas.height }
    case "slide":
      return { ...REST, opacity: t, dx: -away * SLIDE * canvas.width }
    case "pop":
      return {
        ...REST,
        opacity: Math.min(1, t * 2),
        scale: POP_FROM + (1 - POP_FROM) * easeOutBack(t),
      }
    case "blur":
      return { ...REST, opacity: t, blurPx: away * BLUR_FROM }
    case "none":
      return REST
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5
}

/** Overshoots by about 6% and settles: the "give" in a pop. */
function easeOutBack(t: number): number {
  const c1 = 1.2
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
