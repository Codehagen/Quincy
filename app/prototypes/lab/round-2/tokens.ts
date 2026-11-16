/**
 * Round-2 tokens: the values the eight kept round-1 pieces (01, 02, 05, 07,
 * 08, 13, 17, 19) share, with one value chosen wherever they drifted. Names are
 * roles, not looks, because this file is the seed of the design system.
 *
 * Every length is in design pixels on a 560px-wide frame and is emitted
 * through `u()` in kit.tsx, so a piece is one picture that scales as a whole.
 * KIT.md has the table with the reason for each value.
 */

/** The frame width the numbers below are drawn at. */
export const DESIGN_WIDTH = 560

/**
 * The smallest a design pixel may get, so body text never drops below 10px.
 * Under ~390px frames the picture grows past the right and bottom edges
 * instead, which is why objects anchor top-left and crop at the far edges.
 */
export const UNIT_FLOOR_PX = 10 / 14

export const color = {
  /** The grey stage. All four kits agreed. */
  stage: "#F2F2F1",
  /** The white object on the stage. */
  surface: "#FFFFFF",
  /** Primary text. All four kits agreed. */
  ink: "#111111",
  /** The grey continuation, secondary text. b, c, d agreed (a used 0.46). */
  muted: "rgba(18, 18, 18, 0.48)",
  /** Timestamps and addresses: things you could delete without losing meaning. */
  faint: "rgba(18, 18, 18, 0.30)",
  /** Quincy's handwriting. b/c's 0.62 over a's ink. */
  graphite: "rgba(18, 18, 18, 0.62)",
  /** Skeleton bars. The median of a (0.075), c (0.08), d (0.07). */
  skeleton: "rgba(18, 18, 18, 0.075)",
  /** Dividers and grid lines inside an object. b and c agreed. */
  hairline: "rgba(18, 18, 18, 0.06)",
  /** Window traffic-light dots. c's alpha, which on white equals b's #E2E2E0. */
  chromeDot: "rgba(18, 18, 18, 0.12)",
  /** A recess inside a card (a booked slot). 19 used the stage grey for it. */
  well: "#F2F2F1",
  /** Avatar disc. */
  avatar: "rgba(18, 18, 18, 0.09)",
  /** The highlighter. 01's yellow, a little cooler than 13's #FFD43B. */
  highlight: "oklch(0.91 0.165 99)",
  /** Text on an accent fill. */
  onAccent: "#FFFFFF",
} as const

/**
 * The one accent per piece. The stage picks one; every accent-coloured part
 * reads it, so a piece cannot carry two. White text on each one passes 4.5:1.
 */
export const accent = {
  /**
   * The action and the editor's pen. Hue and chroma from 07's Approve blue
   * (#1F6BFF, 4.56:1), L moved to 0.55 (5.1:1). That sits between 07 and 02's
   * darker pen (L 0.53), so the pen and the button are one blue.
   */
  blue: "oklch(0.55 0.232 262)",
  /** Recording. 17's #E5383B with L moved 0.608 → 0.59 for 4.5:1. 08's vermilion folds into this. */
  red: "oklch(0.59 0.209 25.3)",
  /**
   * 19's draft chip #0F9F6E. White text on it was 3.4:1. At L 0.54 the old chroma
   * falls outside sRGB, so chroma drops to the gamut ceiling (0.115). This is
   * the one place where a change was forced off "move L only".
   */
  green: "oklch(0.54 0.115 162)",
} as const

export type Accent = keyof typeof accent

export const elevation = {
  /** The white object at rest. a, b, c agreed (d's lift was softer). Ring is b/c/d's 0.06. */
  object:
    "0 0 0 1px rgba(18, 18, 18, 0.06), 0 1px 2px rgba(18, 18, 18, 0.04), 0 10px 28px -10px rgba(18, 18, 18, 0.12)",
  /** An object in the hand (08's riff mid-drag). */
  lifted:
    "0 0 0 1px rgba(18, 18, 18, 0.08), 0 12px 28px -8px rgba(18, 18, 18, 0.28)",
  /** A secondary object inside the main one (08's riff tray). Ring only. */
  inset: "0 0 0 1px rgba(18, 18, 18, 0.08)",
} as const

/** Design pixels. */
export const radius = {
  /** The card or window. c and d measured 12; a and b came to 13.4 at 560. */
  object: 12,
  /** Buttons and slot cells. 07's 8 (at its 500 canvas). */
  control: 8,
  /** Chips inside a cell. 19's 0.45em ≈ 6. */
  chip: 6,
} as const

/** Design pixels. */
export const space = {
  /** Stage edge to lead, left and top. a (30) and b (31/29) agreed. */
  gutter: 30,
  /** Lead width. a 347, b 370, c 330, d 322 → 340. */
  leadMeasure: 340,
  /** Lead to the object. b and d both landed at 27–29. */
  leadToObject: 28,
  /** How far a cropped object runs past the stage edge. a used 40. */
  bleed: 40,
  /** Inside the object. a and b both 18 (c 16/20, d 15–17). */
  objectPad: 18,
  /** Between two stacked objects on the stage. 17. */
  stack: 14,
  /** Between skeleton bars. a and c measured 7. */
  skeletonGap: 7,
  /** Line to its margin note. */
  marginGap: 10,
  /** The margin note's column width. a's 26cqw ≈ 146 plus the bracket. */
  marginWidth: 170,
} as const

/** Design pixels, except weights and unitless line-heights. */
export const type = {
  /** 14/20 at 460, -0.006em. Every kit landed here. */
  body: { size: 14, lineHeight: 20 / 14, weight: 460, tracking: "-0.006em" },
  /** a, b, d used 560 (c 580). */
  strongWeight: 560,
  /** Dense rows and grids. c's 12.5/18. */
  small: { size: 12.5, lineHeight: 18 / 12.5 },
  /** The number on its own line. 02's 18.5 at 600, -0.02em, rounded to 18. */
  figure: { size: 18, lineHeight: 22 / 18, weight: 600, tracking: "-0.02em" },
  /** Times, file names, counts. a/c ~10.5, b/d ~12.5–13 → 12. */
  mono: { size: 12 },
  /** Caveat for margin notes. 01/02/05 came to ~21. */
  hand: { size: 21, lineHeight: 0.95, weight: 500, rotate: "-2deg" },
} as const

export const MONO_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

/** Milliseconds and curves. Every one has a reduced-motion path in kit.tsx. */
export const motion = {
  /** Press feedback. d's 140 over 07's 120. */
  press: 140,
  /** Colour and opacity state (dim, tab swap, hover). 02 and 13 both used 200. */
  state: 200,
  /** Something arrives (a row, a riff card). d 320, a 360, 05 420 → 320. */
  enter: 320,
  /** An object crosses the surface (draft into its slot). 07's 520. */
  travel: 520,
  /** The highlighter sweep. 01's 700. */
  sweep: 700,
  /** A margin note waits for the sweep under it. 01's 620. */
  noteDelay: 620,
  /** Settle: enters, sweeps, presses. The shared shape of a/b/c/d's out curves. */
  easeOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  /** An object that travels: slow start, soft landing. 08's carry. */
  easeMove: "cubic-bezier(0.45, 0, 0.2, 1)",
} as const
