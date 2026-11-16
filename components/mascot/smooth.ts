/**
 * Smooth friend — the engine for large sizes. docs/design/mascot.md.
 *
 * The same character and the same nine states as the pixel engine
 * (engine.ts), drawn as vectors instead of a 16×16 bitmap: the soft-cornered
 * page from the lab (round 1, piece 20), two eyes cut out of it, and the
 * highlighter sash across its middle. Coordinates are the pixel grid's own
 * (a 16-unit box), so the two drawings line up when you swap one for the
 * other.
 *
 * No framework and no clock. `sampleSmooth(state, t)` is a pure function of
 * the time spent in a state. Never read `Date.now()` or keep state here.
 *
 * A state is a list of keys. A key says, from time `at`, which channels
 * (an eye's x, its openness, the sash's lift…) head for which value, and how:
 * an exponential ease-out with time constant `tau` (0 is a cut), or a linear
 * move over `linear` ms (the pen). Each channel moves on its own, so an eye
 * can blink while it is still travelling. A channel always leaves from where
 * it actually is, so a key that lands mid-move never jumps.
 *
 * The beats are the pixel engine's: a state lasts exactly as long, and every
 * blink, glance and flash starts at the time the pixel frame does. Switching
 * size never changes what a state says or when it says it.
 *
 * The body never moves. Life is the eyes (gaze, blinks) and the sash.
 */

import { type MascotState, STATE_NAMES, duration } from "./engine"

export { type MascotState } from "./engine"

/* ── The pose ─────────────────────────────────────────────────────────── */

/** The page. One rounded rectangle, the mark's silhouette. */
export type BodyPose = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly r: number }

/**
 * One eye, a hole in the body. `x`, `y` are its centre with the lid open,
 * `w`, `h` its open size. `open` lowers the lid from the top (1 open, 0 a
 * shut line); the bottom edge stays put, as the pixel lid does. `arch` bends
 * the eye up into the happy caret (0 none, 1 full).
 */
export type EyePose = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly open: number
  readonly arch: number
}

/**
 * The sash. `lift` moves it up (negative is up), `angle` tilts it in degrees
 * about its centre, `h` is its height, `inset` draws both tails in from the
 * box's edges. `flash` (0–1) lays keep-ink over it. `pen` is the nib's x,
 * `penOn` how much of the nib is there, `penLift` the nib raised over a gap;
 * `written` is how far the words reach and `words` how much they show.
 */
export type SashPose = {
  readonly lift: number
  readonly angle: number
  readonly h: number
  readonly inset: number
  readonly flash: number
  readonly pen: number
  readonly penOn: number
  readonly penLift: number
  readonly written: number
  readonly words: number
}

export type SmoothPose = {
  readonly body: BodyPose
  readonly eyes: readonly [EyePose, EyePose]
  readonly sash: SashPose
}

/** The page from piece 20: x 2–14, y 1–15, corners of 3. It never changes. */
export const BODY: BodyPose = { x: 2, y: 1, w: 12, h: 14, r: 3 }

/** The sash's top edge and its centre line at rest (rows 9–11 of the grid). */
export const SASH_TOP = 9
export const SASH_H = 3

/**
 * Where an eye may go: one unit inside the body on every side and above the
 * sash. The same box the pixel test holds its holes to.
 */
export const EYE_BOX = { x0: 3, x1: 13, y0: 2, y1: 8 } as const

/* ── Channels ─────────────────────────────────────────────────────────── */

const CHANNELS = [
  "lx", "ly", "lw", "lh", "lo", "la",
  "rx", "ry", "rw", "rh", "ro", "ra",
  "lift", "angle", "sashH", "inset", "flash",
  "pen", "penOn", "penLift", "written", "words",
] as const

type Channel = (typeof CHANNELS)[number]
type Channels = Record<Channel, number>
type Targets = Partial<Channels>

/** The mark at rest: piece 20's eyes, x 5–7 and 9–11, y 4–7. */
const REST: Channels = {
  lx: 6, ly: 5.5, lw: 2, lh: 3, lo: 1, la: 0,
  rx: 10, ry: 5.5, rw: 2, rh: 3, ro: 1, ra: 0,
  lift: 0, angle: 0, sashH: SASH_H, inset: 0, flash: 0,
  pen: 0, penOn: 0, penLift: 0, written: 0, words: 0,
}

/** Gaze, in grid units: both eyes move together. */
const gaze = (dx: number, dy: number): Targets => ({
  lx: REST.lx + dx,
  rx: REST.rx + dx,
  ly: REST.ly + dy,
  ry: REST.ry + dy,
})

/** Open eyes of the mark's own shape, looking `dx`, `dy`. */
const eyes = (dx = 0, dy = 0): Targets => ({
  ...gaze(dx, dy),
  lw: 2, rw: 2, lh: 3, rh: 3, lo: 1, ro: 1, la: 0, ra: 0,
})

/** Looking down at something close: a shorter eye, top edge kept (LOW). */
const low = (dx: number, line: number): Targets => ({
  ...eyes(dx, 0),
  ly: 5 + line,
  ry: 5 + line,
  lh: 2,
  rh: 2,
})

/** Every eye channel at rest plus overrides; the sash at rest. */
const pose = (s: Targets = {}): Targets => {
  const out: Targets = {}
  for (const c of CHANNELS) {
    if (c === "pen" || c === "written" || c === "words" || c === "penOn" || c === "penLift") continue
    out[c] = REST[c]
  }
  return { ...out, ...s }
}

/* ── Keys and states ──────────────────────────────────────────────────── */

type Key = {
  readonly at: number
  /** Exponential ease-out time constant, ms. 0 cuts. Ignored with `linear`. */
  readonly tau: number
  /** A linear move over this many ms instead (the pen). */
  readonly linear?: number
  readonly set: Targets
}

export type SmoothDef = {
  readonly play: "loop" | "once"
  readonly then?: MascotState
  /** Where a one-shot starts from when entered cold. Defaults to its first key. */
  readonly from?: Targets
  /** The representative pose for reduced motion: ms into the state. */
  readonly still: number
  readonly keys: readonly Key[]
}

/** Lid closing: fast. Lid opening: a little slower. Saccade, glance, settle. */
const CLOSE = 22
const REOPEN = 40
const SACCADE = 45
const GLANCE = 70
const SETTLE = 120

const k = (at: number, tau: number, set: Targets): Key => ({ at, tau, set })

/** The pixel blink is 200ms (half, shut, half). Shut by ~60, open by ~200. */
const blink = (at: number): Key[] => [
  k(at, CLOSE, { lo: 0, ro: 0 }),
  k(at + 120, REOPEN, { lo: 1, ro: 1 }),
]

/** Nothing is running. Blinks at 2.8s and 8.2s, the gaze to each side. */
const idle: SmoothDef = {
  play: "loop",
  still: 0,
  keys: [
    k(0, SETTLE, pose(eyes())),
    ...blink(2800),
    k(5000, GLANCE, gaze(-1, 0)),
    k(6400, GLANCE, gaze(0, 0)),
    ...blink(8200),
    k(10800, GLANCE, gaze(1, 0)),
    k(12000, GLANCE, gaze(0, 0)),
  ],
}

/** Recording: eyes up, on the person talking. One blink. */
const listening: SmoothDef = {
  play: "loop",
  still: 0,
  keys: [k(0, SETTLE, pose(eyes(0, -1))), ...blink(2600)],
}

/** Three lines, three saccades each (240, 240, 320ms), a blink at the page's end. */
const reading: SmoothDef = {
  play: "loop",
  still: 0,
  keys: [
    k(0, GLANCE, pose(low(-1, -1))),
    ...[-1, 0, 1].flatMap((line, li) =>
      [-1, 0, 1].map((dx, di) =>
        k(li * 800 + [0, 240, 480][di], di === 0 ? GLANCE : SACCADE, low(dx, line)),
      ),
    ).slice(1),
    k(2400, CLOSE, { lo: 0, ro: 0 }),
  ],
}

/** An idea: eyes widen upward, the sash lifts a little and flashes twice. */
const found: SmoothDef = {
  play: "once",
  then: "idle",
  from: pose(eyes()),
  still: 500,
  keys: [
    // WIDE: four tall, grown upward (bottom edge kept at 7).
    k(0, SACCADE, pose({ ...eyes(), lh: 4, rh: 4, ly: 5, ry: 5, lift: -0.5, angle: -2 })),
    k(90, 12, { flash: 1 }),
    k(160, 12, { flash: 0 }),
    k(250, 12, { flash: 1 }),
    k(320, 12, { flash: 0 }),
    k(600, 160, { lift: 0, angle: 0 }),
  ],
}

/** What the pen writes along the sash, column by column: words and gaps. */
export const WORDS = ".kkk.kkkk.kk.kk."

/**
 * A draft: the nib travels the sash and leaves words; the eyes look down and
 * follow it in three steps. The pixel holds each column 90ms, a gap 160ms.
 */
const writing: SmoothDef = (() => {
  // The eyes stay low on the sash; only their x follows the nib.
  const follow = (dx: number): Targets => ({ lx: REST.lx + dx, rx: REST.rx + dx })
  const keys: Key[] = [
    k(0, GLANCE, pose(low(-1, 1))),
    k(0, 0, { pen: 1, written: 1, words: 1, penLift: 0 }),
    k(0, 60, { penOn: 1 }),
  ]
  let at = 0
  for (let pen = 1; pen <= 14; pen++) {
    const gap = WORDS[pen] === "."
    const hold = gap ? 160 : 90
    keys.push({ at, tau: 0, linear: hold, set: { pen: pen + 1, written: pen + 1 } })
    keys.push(k(at, 30, { penLift: gap ? 1 : 0 }))
    if (pen === 6) keys.push(k(at, GLANCE, follow(0)))
    if (pen === 11) keys.push(k(at, GLANCE, follow(1)))
    at += hold
  }
  // at = 1470: the line is done. The nib lifts; the line is read once.
  keys.push(k(at, 80, { penOn: 0, penLift: 0 }))
  keys.push({ at, tau: 0, linear: 100, set: { written: 16 } })
  keys.push(k(at, GLANCE, follow(0)))
  // 2070: a fresh line. The words clear, the eyes go back to its start.
  keys.push(k(at + 600, 50, { words: 0 }))
  keys.push(k(at + 600, GLANCE, follow(-1)))
  return { play: "loop", still: 1300, keys }
})()

/** A draft waits for Approve: at 1.6s a glance down-right, toward the button. */
const waiting: SmoothDef = {
  play: "loop",
  still: 2200,
  keys: [
    k(0, SETTLE, pose(eyes())),
    k(1600, GLANCE, gaze(2, 1)),
    k(2590, 90, gaze(0, 0)),
    ...blink(4080),
  ],
}

/** Approved: the eyes squeeze into two happy carets, then a blink out to idle. */
const sent: SmoothDef = {
  play: "once",
  then: "idle",
  from: pose(eyes()),
  still: 500,
  keys: [
    k(0, 50, pose({ ...eyes(), lx: 5.5, rx: 10.5, lw: 3, rw: 3, lh: 1, rh: 1, la: 1, ra: 1 })),
    k(1000, 30, { ...eyes(), lo: 0, ro: 0 }),
    k(1060, REOPEN, { lo: 2 / 3, ro: 2 / 3 }),
  ],
}

/** Quiet hours: eyes shut; the tails draw in at 2.6s and out at 4.8s, slowly. */
const resting: SmoothDef = {
  play: "loop",
  still: 0,
  keys: [k(0, 500, pose({ ...eyes(), lo: 0, ro: 0 })), k(2600, 500, { inset: 1 })],
}

/** Something failed: eyes lidded, low and to the left. No motion at all. */
const stuck: SmoothDef = {
  play: "once",
  still: 0,
  keys: [k(0, 0, pose({ ...eyes(-2, 1), lo: 2 / 3, ro: 2 / 3 }))],
}

export const SMOOTH: Readonly<Record<MascotState, SmoothDef>> = {
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

/** One pass through a state, in ms: the pixel engine's, by construction. */
export const smoothDuration = (state: MascotState): number => duration(state)

/* ── Sampling ─────────────────────────────────────────────────────────── */

type Seg = { start: number; from: number; to: number; tau: number; linear?: number }

function evalSeg(seg: Seg | null, v0: number, t: number): number {
  if (!seg) return v0
  const dt = t - seg.start
  if (seg.linear !== undefined) {
    const p = seg.linear <= 0 ? 1 : Math.min(1, Math.max(0, dt / seg.linear))
    return seg.from + (seg.to - seg.from) * p
  }
  if (seg.tau <= 0) return seg.to
  return seg.to + (seg.from - seg.to) * Math.exp(-dt / seg.tau)
}

/** Channels `t` ms into one pass of `def`, starting from `init`. */
function run(def: SmoothDef, init: Channels, t: number): Channels {
  const out = {} as Channels
  for (const c of CHANNELS) {
    let seg: Seg | null = null
    for (const key of def.keys) {
      const to = key.set[c]
      if (to === undefined) continue
      if (key.at > t) break
      seg = { start: key.at, from: evalSeg(seg, init[c], key.at), to, tau: key.tau, linear: key.linear }
    }
    out[c] = evalSeg(seg, init[c], t)
  }
  return out
}

/** The channels a pass settles to if nothing else were happening. */
function settled(def: SmoothDef): Channels {
  const out = { ...REST }
  for (const key of def.keys) Object.assign(out, key.set)
  return out
}

/** Where each state starts. A loop starts where its own pass ends. */
const START: Readonly<Record<MascotState, Channels>> = Object.fromEntries(
  STATE_NAMES.map((s) => {
    const def = SMOOTH[s]
    if (def.play === "once") {
      return [s, { ...REST, ...(def.from ?? def.keys.filter((key) => key.at === 0).reduce<Targets>((a, key) => ({ ...a, ...key.set }), {})) }]
    }
    let init = settled(def)
    for (let i = 0; i < 3; i++) init = run(def, init, duration(s))
    return [s, init]
  }),
) as Record<MascotState, Channels>

export type SmoothCursor = { readonly state: MascotState; readonly local: number }

/**
 * Which state is on screen `t` ms after entering `state`, and how far into
 * it. A one-shot with a `then` hands over at its end, as the pixel engine's
 * `locate` does, and the time carries on.
 */
export function locateSmooth(state: MascotState, t: number): SmoothCursor {
  let s = state
  let local = Number.isFinite(t) && t > 0 ? t : 0
  for (let hops = 0; hops < STATE_NAMES.length; hops++) {
    const def = SMOOTH[s]
    const total = duration(s)
    if (def.play === "loop") return { state: s, local: local % total }
    if (local < total || !def.then) return { state: s, local: Math.min(local, total) }
    local -= total
    s = def.then
  }
  return { state: s, local }
}

function channelsAt(state: MascotState, t: number): Channels {
  let s = state
  let local = Number.isFinite(t) && t > 0 ? t : 0
  let init = START[s]
  for (let hops = 0; hops < STATE_NAMES.length; hops++) {
    const def = SMOOTH[s]
    const total = duration(s)
    if (def.play === "loop") {
      // The first pass after a hand-over leaves from the pose handed over;
      // every later pass from the loop's own start, which it has settled to.
      return local < total ? run(def, init, local) : run(def, START[s], local % total)
    }
    if (local < total || !def.then) return run(def, init, Math.min(local, total))
    init = run(def, init, total)
    local -= total
    s = def.then
  }
  return init
}

function toPose(c: Channels): SmoothPose {
  return {
    body: BODY,
    eyes: [
      { x: c.lx, y: c.ly, w: c.lw, h: c.lh, open: c.lo, arch: c.la },
      { x: c.rx, y: c.ry, w: c.rw, h: c.rh, open: c.ro, arch: c.ra },
    ],
    sash: {
      lift: c.lift,
      angle: c.angle,
      h: c.sashH,
      inset: c.inset,
      flash: c.flash,
      pen: c.pen,
      penOn: c.penOn,
      penLift: c.penLift,
      written: c.written,
      words: c.words,
    },
  }
}

/** The pose `t` ms into `state`. Pure: it reads nothing but its arguments. */
export function sampleSmooth(state: MascotState, t: number): SmoothPose {
  return toPose(channelsAt(state, t))
}

/** The held pose for reduced motion: each state's most telling moment. */
export function stillPose(state: MascotState): SmoothPose {
  return sampleSmooth(state, SMOOTH[state].still)
}

const mix = (a: number, b: number, p: number) => a + (b - a) * p

/**
 * `a` blended toward `b` by `p` (0–1), channel by channel. The renderer uses
 * it when the state changes mid-move, so the new state leaves from what is on
 * screen rather than jumping to its own start.
 */
export function blendPose(a: SmoothPose, b: SmoothPose, p: number): SmoothPose {
  const eye = (x: EyePose, y: EyePose): EyePose => ({
    x: mix(x.x, y.x, p),
    y: mix(x.y, y.y, p),
    w: mix(x.w, y.w, p),
    h: mix(x.h, y.h, p),
    open: mix(x.open, y.open, p),
    arch: mix(x.arch, y.arch, p),
  })
  const s = a.sash
  const t = b.sash
  return {
    body: BODY,
    eyes: [eye(a.eyes[0], b.eyes[0]), eye(a.eyes[1], b.eyes[1])],
    sash: {
      lift: mix(s.lift, t.lift, p),
      angle: mix(s.angle, t.angle, p),
      h: mix(s.h, t.h, p),
      inset: mix(s.inset, t.inset, p),
      flash: mix(s.flash, t.flash, p),
      // The pen and its words are not blended: they cut with the state.
      pen: t.pen,
      penOn: mix(s.penOn, t.penOn, p),
      penLift: t.penLift,
      written: t.written,
      words: mix(s.words, t.words, p),
    },
  }
}

/* ── Drawing. Shared by the component and the tests. ──────────────────── */

const n = (v: number) => (Math.round(v * 1000) / 1000).toString()
const pt = (x: number, y: number) => `${n(x)} ${n(y)}`

/** The page: one rounded rectangle. */
export function bodyPath(b: BodyPose = BODY): string {
  const { x, y, w, h, r } = b
  return (
    `M${pt(x + r, y)}H${n(x + w - r)}A${r} ${r} 0 0 1 ${pt(x + w, y + r)}` +
    `V${n(y + h - r)}A${r} ${r} 0 0 1 ${pt(x + w - r, y + h)}` +
    `H${n(x + r)}A${r} ${r} 0 0 1 ${pt(x, y + h - r)}` +
    `V${n(y + r)}A${r} ${r} 0 0 1 ${pt(x + r, y)}Z`
  )
}

/** The shut lid's line, in grid units. */
const LID = 0.55
/** How high a full arch lifts the eye's middle. */
const ARCH = 1
/** Squareness of the eye: a superellipse exponent. 2 is a lens, ∞ a rectangle. */
const SQUARE = 5
const STEPS = 20

/** One eye's outline as a list of points, top edge then bottom edge. */
export function eyePoints(e: EyePose): Array<[number, number]> {
  const open = Math.min(1, Math.max(0, e.open))
  const vis = Math.max(LID, e.h * open)
  const bottom = e.y + e.h / 2
  const mid = bottom - vis / 2
  const top: Array<[number, number]> = []
  const bot: Array<[number, number]> = []
  for (let i = 0; i <= STEPS; i++) {
    // Denser near the ends, where the outline turns.
    const u = Math.sin(-Math.PI / 2 + (Math.PI * i) / STEPS)
    const s = Math.pow(Math.max(0, 1 - Math.abs(u) ** SQUARE), 1 / SQUARE)
    const bend = e.arch * ARCH * (1 - u * u)
    const x = e.x + (u * e.w) / 2
    const half = (vis / 2) * s
    top.push([x, mid - bend - half])
    bot.push([x, mid - bend + half])
  }
  return [...top, ...bot.reverse()]
}

export function eyePath(e: EyePose): string {
  const p = eyePoints(e)
  return `M${p.map(([x, y]) => pt(x, y)).join("L")}Z`
}

function rotate(s: SashPose) {
  const cy = SASH_TOP + s.lift + s.h / 2
  const a = (s.angle * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return (x: number, y: number): [number, number] => {
    const dx = x - 8
    const dy = y - cy
    return [8 + dx * cos - dy * sin, cy + dx * sin + dy * cos]
  }
}

/** The sash: a straight band across the box, past both sides of the body. */
export function sashPath(s: SashPose): string {
  const r = rotate(s)
  const y0 = SASH_TOP + s.lift
  const y1 = y0 + s.h
  const x0 = s.inset
  const x1 = 16 - s.inset
  const p = [r(x0, y0), r(x1, y0), r(x1, y1), r(x0, y1)]
  return `M${p.map(([x, y]) => pt(x, y)).join("L")}Z`
}

/** The words the pen has left: one stroke per word, up to `written`. */
export function wordsPath(s: SashPose): string {
  const r = rotate(s)
  const y = SASH_TOP + s.lift + s.h / 2
  let d = ""
  let x = 0
  while (x < WORDS.length) {
    if (WORDS[x] !== "k") {
      x++
      continue
    }
    let end = x
    while (end < WORDS.length && WORDS[end] === "k") end++
    // Inset by the stroke's round caps, so a word fills its columns.
    const a = x + 0.4
    const b = Math.min(end - 0.4, s.written - 0.4)
    if (b > a) d += `M${pt(...r(a, y))}L${pt(...r(b, y))}`
    x = end
  }
  return d
}

/** The nib: a short upright stroke at `pen`, its foot on the line of words. */
export function nibPath(s: SashPose): string {
  if (s.penOn < 0.01) return ""
  const r = rotate(s)
  const foot = SASH_TOP + s.lift + s.h / 2 - s.penLift * 0.6
  const len = 1.05 * s.penOn
  return `M${pt(...r(s.pen, foot - len))}L${pt(...r(s.pen, foot))}`
}

/** Stroke widths for the words and the nib, in grid units. */
export const WORD_STROKE = 0.8
export const NIB_STROKE = 0.9
