/**
 * Pixel friend — the engine. docs/design/mascot.md.
 *
 * No framework and no clock. `sample(state, t)` is a pure function of the
 * time spent in a state, so the same call always gives the same bitmap. That
 * is what makes `frozenAt`, the frozen board at /prototypes/mascot, the
 * exports and the DOM-less tests possible. Never read `Date.now()` or keep
 * state in this file: a clock belongs to whoever renders it.
 *
 * The character is pixel art, so a state is a list of whole frames on the
 * 16×16 grid, each held for a number of milliseconds. Nothing is
 * interpolated: a frame cuts to the next one.
 *
 * Bitmap characters, as in the lab's round 2 (`pixels.tsx`):
 *   `.`  empty (an eye is a hole: it shows the ground)
 *   `#`  ink, painted `currentColor` so it follows the text colour
 *   `y`  the highlighter yellow of the sash, the same on both grounds
 *   `k`  ink that stays ink on both grounds (a mark drawn on the yellow)
 */

export type Bitmap = readonly string[]

export type MascotState =
  | "idle"
  | "listening"
  | "reading"
  | "found"
  | "writing"
  | "waiting"
  | "sent"
  | "resting"
  | "stuck"

export type Frame = { readonly bitmap: Bitmap; readonly hold: number }

export type StateDef = {
  readonly frames: readonly Frame[]
  /**
   * `loop` repeats. `once` plays through and hands over to `then` (or, with
   * no `then`, holds its last frame for good).
   */
  readonly play: "loop" | "once"
  readonly then?: MascotState
}

export const GRID = 16

/* ── The body. Never moves: idle life is eyes only, never a bob. ─────────── */

const BODY: Bitmap = [
  "................",
  "...##########...",
  "..############..",
  "..############..",
  "..############..",
  "..############..",
  "..############..",
  "..############..",
  "..############..",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "..############..",
  "..############..",
  "...##########...",
  "................",
]

/** The sash rows. */
export const SASH_ROWS = [9, 10, 11] as const

/* ── Eye glyphs, drawn on the grid. `o` is a hole, a space leaves ink. ──── */

type Glyph = readonly string[]

/** The mark's own eye: a 2×3 hole. */
const OPEN: Glyph = ["oo", "oo", "oo"]
/** The lid one pixel down. */
const HALF: Glyph = ["  ", "oo", "oo"]
/** Shut: the lid line at the bottom of the eye. */
const SHUT: Glyph = ["  ", "  ", "oo"]
/** Widened by one pixel upward: placed one row higher than OPEN. */
const WIDE: Glyph = ["oo", "oo", "oo", "oo"]
/** Looking down at something close (reading, writing). */
const LOW: Glyph = ["oo", "oo"]
/** Happy, closed: a caret, three wide. */
const HAPPY: Glyph = [" o ", "o o"]

/** Where the left eye's top-left sits with no gaze; the right eye is 4 over. */
const EYE_X = 5
const EYE_Y = 4
const EYE_GAP = 4

type Eyes = {
  glyph: Glyph
  /** Gaze, in whole pixels. */
  dx?: number
  dy?: number
}

type Sash =
  | { kind: "full" }
  /** The flash in `found`: the sash goes to keep-ink for a frame. */
  | { kind: "dark" }
  /** Resting's breath: both tails pulled in one pixel. */
  | { kind: "in" }
  /** Writing: the pen nib at `pen` (rows 9–10), the line written up to it on row 10. */
  | { kind: "pen"; pen: number | null; written: number }

/** What the pen writes along the sash's middle row: words and gaps. */
export const WORDS = ".kkk.kkkk.kk.kk."

function compose(eyes: Eyes, sash: Sash = { kind: "full" }): Bitmap {
  const rows = BODY.map((r) => r.split(""))
  const dx = eyes.dx ?? 0
  const dy = eyes.dy ?? 0
  const glyph = eyes.glyph
  const wide = glyph[0].length === 3
  // A three-wide glyph cannot sit symmetrically on the two-wide eye's
  // columns, so the caret is centred on the left eye's left column and the
  // right eye's right one (5 and 10): symmetric about the body's axis, 7.5.
  const lefts = wide ? [EYE_X - 1, EYE_X + EYE_GAP] : [EYE_X, EYE_X + EYE_GAP]
  // WIDE grows upward, so it starts a row above the open eye.
  const top = EYE_Y + dy - (glyph.length === 4 ? 1 : 0)
  for (const left of lefts) {
    glyph.forEach((line, gy) => {
      for (let gx = 0; gx < line.length; gx++) {
        if (line[gx] === "o") rows[top + gy][left + dx + gx] = "."
      }
    })
  }
  if (sash.kind === "dark") {
    for (const y of SASH_ROWS) rows[y] = rows[y].map(() => "k")
  } else if (sash.kind === "in") {
    for (const y of SASH_ROWS) {
      rows[y][0] = "."
      rows[y][GRID - 1] = "."
    }
  } else if (sash.kind === "pen") {
    for (let x = 0; x < sash.written; x++) rows[10][x] = WORDS[x] === "k" ? "k" : "y"
    if (sash.pen !== null) {
      rows[9][sash.pen] = "k"
      rows[10][sash.pen] = "k"
    }
  }
  return rows.map((r) => r.join(""))
}

const f = (bitmap: Bitmap, hold: number): Frame => ({ bitmap, hold })

/* ── The states. Each one means one thing in the product (mascot.md). ──── */

const open = (dx = 0, dy = 0) => compose({ glyph: OPEN, dx, dy })
const blink = (dx = 0, dy = 0): Frame[] => [
  f(compose({ glyph: HALF, dx, dy }), 60),
  f(compose({ glyph: SHUT, dx, dy }), 80),
  f(compose({ glyph: HALF, dx, dy }), 60),
]

/** Nothing is happening. A blink every few seconds and a small drift of gaze. */
const idle: StateDef = {
  play: "loop",
  frames: [
    f(open(), 2800),
    ...blink(),
    f(open(), 2000),
    f(open(-1), 1400),
    f(open(), 1800),
    ...blink(),
    f(open(), 2400),
    f(open(1), 1200),
    f(open(), 600),
  ],
}

/** Recording: eyes up, on the person talking. Blinks, nothing else. */
const listening: StateDef = {
  play: "loop",
  frames: [f(open(0, -1), 2600), ...blink(0, -1), f(open(0, -1), 1800)],
}

/** Quincy at work on the material: eyes scan three lines left to right. */
const reading: StateDef = {
  play: "loop",
  frames: [
    ...[-1, 0, 1].flatMap((line) =>
      [-1, 0, 1].map((dx) =>
        f(compose({ glyph: LOW, dx, dy: line }), dx === 1 ? 320 : 240),
      ),
    ),
    // End of the page: a blink, then back to the top line.
    f(compose({ glyph: SHUT }), 100),
  ],
}

/** An idea found: eyes widen, the sash flashes twice, then back to idle. */
const found: StateDef = {
  play: "once",
  then: "idle",
  frames: [
    f(compose({ glyph: WIDE }), 90),
    f(compose({ glyph: WIDE }, { kind: "dark" }), 70),
    f(compose({ glyph: WIDE }), 90),
    f(compose({ glyph: WIDE }, { kind: "dark" }), 70),
    f(compose({ glyph: WIDE }), 700),
  ],
}

/**
 * A draft being written: a pen nib travels along the sash and leaves a line
 * of words behind it. The eyes look down and follow the nib.
 */
const writing: StateDef = {
  play: "loop",
  frames: [
    ...Array.from({ length: GRID - 2 }, (_, i) => {
      const pen = i + 1
      const gaze = pen <= 5 ? -1 : pen <= 10 ? 0 : 1
      // The pen lifts over a gap between words, so a gap holds a little longer.
      const hold = WORDS[pen] === "." ? 160 : 90
      return f(compose({ glyph: LOW, dx: gaze, dy: 1 }, { kind: "pen", pen, written: pen }), hold)
    }),
    // The line is done: the nib lifts and the line is read once.
    f(compose({ glyph: LOW, dx: 0, dy: 1 }, { kind: "pen", pen: null, written: GRID }), 600),
    // A fresh line.
    f(compose({ glyph: LOW, dx: -1, dy: 1 }), 200),
  ],
}

/**
 * A draft waits for Approve: a glance down and to the right, toward where the
 * button sits, and back.
 */
const waiting: StateDef = {
  play: "loop",
  frames: [
    f(open(), 1600),
    f(open(1, 1), 90),
    f(open(2, 1), 900),
    f(open(1, 1), 90),
    f(open(), 1400),
    ...blink(),
    f(open(), 600),
  ],
}

/** Approved: a happy, closed-eye squeeze, then back to idle. */
const sent: StateDef = {
  play: "once",
  then: "idle",
  frames: [
    f(compose({ glyph: HAPPY }), 1000),
    f(compose({ glyph: SHUT }), 60),
    f(compose({ glyph: HALF }), 60),
  ],
}

/** Quiet hours: eyes shut; the sash's tails draw in and out, slowly. */
const resting: StateDef = {
  play: "loop",
  frames: [
    f(compose({ glyph: SHUT }), 2600),
    f(compose({ glyph: SHUT }, { kind: "in" }), 2200),
  ],
}

/** Something failed: eyes low and off to one side. One frame, held. */
const stuck: StateDef = {
  play: "once",
  frames: [f(compose({ glyph: HALF, dx: -2, dy: 1 }), 1000)],
}

export const STATES: Readonly<Record<MascotState, StateDef>> = {
  idle,
  listening,
  reading,
  found,
  writing,
  waiting,
  sent,
  resting,
  stuck,
}

export const STATE_NAMES = Object.keys(STATES) as MascotState[]

/** The friend at rest: the mark itself, as drawn in the lab (round 2, 31). */
export const MARK: Bitmap = idle.frames[0].bitmap

/** One pass through a state's frames, in ms. */
export function duration(state: MascotState): number {
  return STATES[state].frames.reduce((sum, fr) => sum + fr.hold, 0)
}

export type Cursor = { readonly state: MascotState; readonly index: number }

/**
 * Which frame is on screen `t` ms after entering `state`. A `once` state with
 * a `then` hands over at its end and the time carries on in the next state.
 * Pure: it reads nothing but its arguments.
 */
export function locate(state: MascotState, t: number): Cursor {
  let s = state
  let local = Number.isFinite(t) && t > 0 ? t : 0
  // A chain of hand-overs is short (found → idle); the guard stops a cycle.
  for (let hops = 0; hops < STATE_NAMES.length; hops++) {
    const def = STATES[s]
    const total = duration(s)
    if (def.play === "loop") {
      local %= total
      break
    }
    if (local < total) break
    if (!def.then) return { state: s, index: def.frames.length - 1 }
    local -= total
    s = def.then
  }
  const frames = STATES[s].frames
  for (let i = 0; i < frames.length; i++) {
    if (local < frames[i].hold) return { state: s, index: i }
    local -= frames[i].hold
  }
  return { state: s, index: frames.length - 1 }
}

/** The bitmap `t` ms into `state`. */
export function sample(state: MascotState, t: number): Bitmap {
  const c = locate(state, t)
  return STATES[c.state].frames[c.index].bitmap
}

/* ── Drawing. Shared by the React component, the exports and the icons. ── */

export type Ink = "#" | "y" | "k"
/** Drawn in this order, so a later colour wins where runs touch. */
export const INKS: readonly Ink[] = ["#", "y", "k"]

/**
 * Hex values for the places that cannot read a CSS variable (an exported
 * file, the favicon, a canvas). Each is the sRGB value of the kit primitive
 * named beside it; if a primitive moves in app/globals.css, it moves here.
 */
export const HEX = {
  ink: "#111110", // --kit-gray-178, the lab's ink
  inkOnDark: "#F2F2F1", // --kit-gray-961, the dark-mode ink
  sash: "#FDE24B", // --kit-yellow-910
  paper: "#FDFDFC", // --kit-gray-994, the ground
  darkGround: "#111110", // --kit-gray-178, the dark ground
} as const

/** One path per colour, each a set of whole-pixel horizontal runs. */
export function paths(bitmap: Bitmap): Record<Ink, string> {
  const d: Record<Ink, string> = { "#": "", y: "", k: "" }
  bitmap.forEach((row, y) => {
    let x = 0
    while (x < GRID) {
      const c = row[x]
      if (c !== "#" && c !== "y" && c !== "k") {
        x++
        continue
      }
      let end = x
      while (end < GRID && row[end] === c) end++
      d[c] += `M${x} ${y}h${end - x}v1h${x - end}Z`
      x = end
    }
  })
  return d
}

/**
 * A stand-alone SVG file of one frame. `ink` is the colour of `#` (a file has
 * no currentColor to inherit); the default is the light-ground ink.
 */
export function toSvg(
  bitmap: Bitmap,
  { ink = HEX.ink, size = 256 }: { ink?: string; size?: number } = {},
): string {
  const d = paths(bitmap)
  const fill: Record<Ink, string> = { "#": ink, y: HEX.sash, k: HEX.ink }
  const body = INKS.filter((c) => d[c])
    .map((c) => `<path fill="${fill[c]}" d="${d[c]}"/>`)
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges">${body}</svg>\n`
}

/**
 * The favicon (app/icon.svg). A tab has no currentColor, so the ink is set by
 * the tab's own colour scheme: ink on a light tab, the dark-mode ink on a
 * dark one. The eyes stay holes either way, and the yellow stays yellow.
 * Regenerate with `pnpm tsx scripts/mascot-icons.ts`; a test fails if the
 * file drifts from this function.
 */
export function iconSvg(bitmap: Bitmap = MARK): string {
  const d = paths(bitmap)
  const cls: Record<Ink, string> = { "#": "i", y: "y", k: "k" }
  const body = INKS.filter((c) => d[c])
    .map((c) => `<path class="${cls[c]}" d="${d[c]}"/>`)
    .join("")
  const style =
    `.i{fill:${HEX.ink}}.y{fill:${HEX.sash}}.k{fill:${HEX.ink}}` +
    `@media (prefers-color-scheme:dark){.i{fill:${HEX.inkOnDark}}}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><style>${style}</style>${body}</svg>\n`
}

/**
 * The frame as palette indices, `scale` device pixels per grid pixel, for the
 * raster encoders (GIF, PNG). 0 is the background (transparent, or `ground`
 * when the caller paints one), 1 ink, 2 sash, 3 keep-ink.
 */
export function toIndices(bitmap: Bitmap, scale: number): Uint8Array {
  const w = GRID * scale
  const out = new Uint8Array(w * w)
  const map: Record<string, number> = { ".": 0, "#": 1, y: 2, k: 3 }
  for (let y = 0; y < w; y++) {
    const row = bitmap[Math.floor(y / scale)]
    for (let x = 0; x < w; x++) out[y * w + x] = map[row[Math.floor(x / scale)]] ?? 0
  }
  return out
}
