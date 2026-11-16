"use client"

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { caveat, inter } from "../fonts"
import {
  accent as ACCENT,
  color,
  DESIGN_WIDTH,
  elevation,
  MONO_STACK,
  motion,
  radius,
  space,
  type,
  UNIT_FLOOR_PX,
  type Accent,
} from "./tokens"

/**
 * The round-2 kit. One grey stage, one white object, Quincy's pen in the
 * margin. Blocks have a closed set of props on purpose: when a piece needs a
 * look that is not here, it belongs in the kit (and KIT.md), not in a one-off.
 *
 * Everything sizes in design pixels through `u()`, drawn at 560 wide.
 */

// ── Units ────────────────────────────────────────────────────────────────

/** A design-pixel length. `u(14)` is 14px on a 560px frame. */
export const u = (n: number) => `calc(var(--k2-u) * ${n})`

// ── Motion preferences ───────────────────────────────────────────────────

const REDUCED = "(prefers-reduced-motion: reduce)"

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

/** True when the viewer asked for less motion. False on the server and first paint. */
export function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

/**
 * True once the element has been on screen (or while it is, with
 * `once: false`). Threshold 0.4 is a's; b's 0.35 fired on a sliver.
 */
export function useInView<T extends Element>({
  once = true,
  threshold = 0.4,
}: { once?: boolean; threshold?: number } = {}): [
  React.RefObject<T | null>,
  boolean,
] {
  const ref = React.useRef<T>(null)
  const [inView, setInView] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [once, threshold])
  return [ref, inView]
}

// ── Styles ───────────────────────────────────────────────────────────────

const css = `
@property --k2-u { syntax: "<length>"; inherits: true; initial-value: 1px; }

.k2-frame {
  position: absolute; inset: 0; overflow: hidden;
  container-type: inline-size;
  background: ${color.stage}; color: ${color.ink};
}
.k2-stage {
  --k2-u: max(${UNIT_FLOOR_PX.toFixed(4)}px, calc(100cqw / ${DESIGN_WIDTH}));
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  padding: ${u(space.gutter)} ${u(space.gutter)} 0;
  font-family: var(--lab-inter), system-ui, sans-serif;
  font-size: ${u(type.body.size)};
  line-height: ${type.body.lineHeight};
  font-weight: ${type.body.weight};
  letter-spacing: ${type.body.tracking};
  font-feature-settings: "cv11", "ss01";
  -webkit-font-smoothing: antialiased;
}
/* Resets sit in :where() so any single kit class beats them. */
:where(.k2-stage) :where(p, h2, h3) { margin: 0; font: inherit; }
:where(.k2-stage) :where(button) { font: inherit; color: inherit; touch-action: manipulation; }
:where(.k2-stage) :focus-visible { outline: 2px solid ${color.ink}; outline-offset: 2px; }

.k2-head { flex: none; max-width: ${u(space.leadMeasure)}; text-wrap: pretty; }
.k2-floor {
  position: relative; flex: 1; min-height: 0;
  margin-top: ${u(space.leadToObject)};
  display: flex; flex-direction: column; align-items: flex-start;
  gap: ${u(space.stack)};
}

.k2-card {
  --k2-pad: ${u(space.objectPad)};
  position: relative; flex: none; box-sizing: border-box;
  background: ${color.surface};
  border-radius: ${u(radius.object)};
  box-shadow: ${elevation.object};
  padding: var(--k2-pad);
}
.k2-card[data-inset="none"] { padding: 0; }
.k2-card[data-fill] { align-self: stretch; }
.k2-card[data-crop="bottom"], .k2-card[data-crop="corner"] {
  flex: 1 0 auto; margin-bottom: calc(-1 * ${u(space.bleed)});
}
.k2-card[data-crop="corner"][data-fill] {
  align-self: flex-start;
  width: calc(100% + ${u(space.gutter + space.bleed)});
}

.k2-chrome {
  display: flex; align-items: center; gap: ${u(14)};
  height: ${u(36)}; padding: 0 ${u(14)};
  border-bottom: 1px solid ${color.hairline};
}
.k2-dots { display: flex; gap: ${u(6)}; }
.k2-dots > span { width: ${u(9)}; height: ${u(9)}; border-radius: 50%; background: ${color.chromeDot}; }
.k2-window-body { padding: var(--k2-pad); }

.k2-text-small { font-size: ${u(type.small.size)}; line-height: ${type.small.lineHeight}; }
.k2-text-figure {
  display: block;
  font-size: ${u(type.figure.size)}; line-height: ${type.figure.lineHeight};
  font-weight: ${type.figure.weight}; letter-spacing: ${type.figure.tracking};
  font-variant-numeric: tabular-nums;
}
.k2-strong { font-weight: ${type.strongWeight}; }
.k2-mono {
  font-family: ${MONO_STACK};
  font-size: ${u(type.mono.size)}; letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.k2-skel { display: block; height: ${u(7)}; border-radius: 999px; background: ${color.skeleton}; }
.k2-skel-lines { display: flex; flex-direction: column; gap: ${u(space.skeletonGap)}; }

.k2-rule {
  border: 0; height: 1px; background: ${color.hairline};
  margin: ${u(12)} calc(-1 * var(--k2-pad, 0px));
}

.k2-avatar {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: ${u(24)}; height: ${u(24)}; border-radius: 50%;
  background: ${color.avatar}; color: ${color.muted};
  font-size: ${u(10)}; font-weight: ${type.strongWeight}; letter-spacing: 0;
}

.k2-hl {
  color: inherit; background-color: transparent;
  background-image: linear-gradient(${color.highlight}, ${color.highlight});
  background-repeat: no-repeat;
  background-position: 0 58%;
  background-size: 0% 82%;
  padding: 0 ${u(2)}; margin: 0 calc(-1 * ${u(2)});
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
  transition-property: background-size;
  transition-duration: ${motion.sweep}ms;
  transition-timing-function: ${motion.easeOut};
}
.k2-hl[data-on] { background-size: 100% 82%; }

.k2-hand {
  display: inline-block;
  font-family: var(--lab-caveat), cursive;
  font-size: ${u(type.hand.size)}; line-height: ${type.hand.lineHeight};
  font-weight: ${type.hand.weight}; letter-spacing: 0;
  rotate: ${type.hand.rotate};
  color: ${color.graphite};
}
.k2-hand[data-tone="accent"] { color: var(--k2-accent); }

.k2-annotated { position: relative; }
.k2-margin {
  position: absolute; top: ${u(-2)}; bottom: ${u(-2)};
  left: calc(100% + var(--k2-pad, 0px) + ${u(space.marginGap)});
  width: ${u(space.marginWidth)};
  display: flex; align-items: center; gap: ${u(8)};
}
.k2-margin[data-wait] {
  opacity: 0; translate: calc(-1 * ${u(4)}) 0;
  transition-property: opacity, translate;
  transition-duration: ${motion.enter}ms;
  transition-timing-function: ${motion.easeOut};
}
.k2-margin[data-wait][data-on] { opacity: 1; translate: 0 0; transition-delay: ${motion.noteDelay}ms; }
.k2-bracket { position: relative; align-self: stretch; flex: none; width: ${u(9)}; }
.k2-bracket svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }

.k2-beat > .k2-beat-line, .k2-beat > .k2-margin {
  transition-property: opacity;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.k2-beat[data-dim] > .k2-beat-line { opacity: 0.26; }
.k2-beat[data-dim] > .k2-margin { opacity: 0.3; }

.k2-action, .k2-quiet {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center; gap: ${u(6)};
  height: ${u(34)}; padding: 0 ${u(14)};
  border: 0; border-radius: ${u(radius.control)};
  font-weight: ${type.strongWeight}; white-space: nowrap;
  cursor: pointer;
}
.k2-action {
  background: var(--k2-accent); color: ${color.onAccent};
  transition-property: transform, background-color;
  transition-duration: ${motion.press}ms, ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.k2-action:active:not(:disabled) { transform: scale(0.97); }
.k2-action:disabled { cursor: default; background: color-mix(in oklch, var(--k2-accent), ${color.surface} 40%); }
.k2-action:focus-visible { outline-color: var(--k2-accent); }
.k2-quiet {
  background: transparent; padding: 0 ${u(10)};
  font-weight: ${type.body.weight};
  color: ${color.muted};
  transition-property: color, transform;
  transition-duration: ${motion.state}ms, ${motion.press}ms;
  transition-timing-function: ${motion.easeOut};
}
.k2-quiet:active:not(:disabled) { transform: scale(0.97); }
@media (hover: hover) {
  .k2-action:hover:not(:disabled) { background: color-mix(in oklch, var(--k2-accent), ${color.surface} 12%); }
  .k2-quiet:hover:not(:disabled) { color: ${color.ink}; }
}
.k2-icon { width: ${u(16)}; height: ${u(16)}; flex: none; }
@media (pointer: coarse) {
  .k2-action::after, .k2-quiet::after {
    content: ""; position: absolute; left: 0; right: 0; top: 50%;
    height: 44px; translate: 0 -50%;
  }
}

.k2-arrive {
  display: grid; grid-template-rows: 0fr;
  opacity: 0; translate: 0 calc(-1 * ${u(8)});
  transition-property: grid-template-rows, opacity, translate;
  transition-duration: ${motion.enter}ms;
  transition-timing-function: ${motion.easeOut};
}
.k2-arrive[data-from="below"] { translate: 0 ${u(12)}; }
.k2-arrive[data-on] { grid-template-rows: 1fr; opacity: 1; translate: 0 0; }
.k2-arrive > div { min-height: 0; overflow: clip; overflow-clip-margin: ${u(32)}; }

@media (prefers-reduced-motion: reduce) {
  .k2-hl, .k2-margin[data-wait], .k2-margin[data-wait][data-on],
  .k2-beat > .k2-beat-line, .k2-beat > .k2-margin,
  .k2-action, .k2-quiet, .k2-arrive {
    transition-duration: 0ms; transition-delay: 0ms;
  }
  .k2-action:active:not(:disabled), .k2-quiet:active:not(:disabled) { transform: none; }
}
`

/** Hoisted and de-duplicated by React 19, so many stages ship one sheet. */
function KitStyles() {
  return (
    <style href="lab-round-2-kit" precedence="default">
      {css}
    </style>
  )
}

// ── Stage ────────────────────────────────────────────────────────────────

/**
 * The grey frame. Owns the scaling unit, the fonts, the accent and the lead
 * copy ("**Bold lead.** grey continuation"). Children are the object(s) under
 * the lead: normally one Card or Window.
 */
export function Stage({
  lead,
  rest,
  accent = "blue",
  label,
  children,
}: {
  /** The bold sentence. One sentence, first person or about the person. */
  lead: string
  /** The grey continuation. */
  rest?: string
  /** The piece's one accent. Every accent-coloured block reads it. */
  accent?: Accent
  /** Accessible name for the composition, when the lead alone does not say it. */
  label?: string
  children: React.ReactNode
}) {
  return (
    <div className={`${inter.variable} ${caveat.variable} k2-frame`}>
      <KitStyles />
      <div
        className="k2-stage"
        role={label ? "group" : undefined}
        aria-label={label}
        style={{ "--k2-accent": ACCENT[accent] } as React.CSSProperties}
      >
        <div className="k2-head">
          <Lead bold={lead} rest={rest} />
        </div>
        <div className="k2-floor">{children}</div>
      </div>
    </div>
  )
}

/**
 * "**Bold lead.** grey continuation." Stage renders the stage's own; use this
 * directly only for the same pattern inside an object (an empty state).
 */
export function Lead({ bold, rest }: { bold: string; rest?: string }) {
  return (
    <p>
      <span className="k2-strong">{bold}</span>
      {rest ? (
        <>
          {" "}
          <Muted>{rest}</Muted>
        </>
      ) : null}
    </p>
  )
}

// ── Objects ──────────────────────────────────────────────────────────────

type Crop = "bottom" | "corner" | "none"

type CardProps = {
  children: React.ReactNode
  /**
   * Where the stage edge cuts it. `bottom` (default) runs it off the bottom,
   * `corner` off the bottom and right, `none` keeps it whole.
   */
  crop?: Crop
  /** Width in design px. Omit to span the stage (or run past it, for `corner`). */
  width?: number
  /** `none` drops the padding, for an object that lays out its own rows. */
  inset?: "normal" | "none"
  ref?: React.Ref<HTMLDivElement>
}

/** The white object: hairline ring, very soft fall, sits low on the stage. */
export function Card({
  children,
  crop = "bottom",
  width,
  inset = "normal",
  ref,
}: CardProps) {
  return (
    <div
      ref={ref}
      className="k2-card"
      data-crop={crop}
      data-inset={inset}
      data-fill={width === undefined || undefined}
      style={width === undefined ? undefined : { width: u(width) }}
    >
      {children}
    </div>
  )
}

const InWindow = React.createContext(false)

/** A Card with window chrome. At most one per piece; a window inside a window throws. */
export function Window({
  address,
  children,
  crop = "bottom",
  width,
  ref,
}: Omit<CardProps, "inset"> & {
  /** Mono path in the chrome, e.g. "hirequincy.com/lineup". */
  address: string
}) {
  if (React.useContext(InWindow)) {
    throw new Error("kit: a Window inside a Window. Chrome appears at most once.")
  }
  return (
    <InWindow value={true}>
      <Card crop={crop} width={width} inset="none" ref={ref}>
        <div className="k2-chrome">
          <span className="k2-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <Mono tone="faint">{address}</Mono>
        </div>
        <div className="k2-window-body">{children}</div>
      </Card>
    </InWindow>
  )
}

/** A hairline across the object, edge to edge. */
export function Rule() {
  return <hr className="k2-rule" />
}

/** Initials in a neutral disc. No photos, no invented faces. */
export function Avatar({ initials }: { initials: string }) {
  return (
    <span className="k2-avatar" aria-hidden>
      {initials}
    </span>
  )
}

// ── Type ─────────────────────────────────────────────────────────────────

type Tone = "ink" | "muted" | "faint"
const TONE: Record<Tone, string> = {
  ink: color.ink,
  muted: color.muted,
  faint: color.faint,
}

/**
 * All copy. `figure` is the number on its own line and is always a block.
 * Hierarchy is weight and grey, never a bigger size for a heading.
 */
export function Text({
  children,
  size = "body",
  tone = "ink",
  weight = "regular",
  as: As = "p",
}: {
  children: React.ReactNode
  size?: "body" | "small" | "figure"
  tone?: Tone
  weight?: "regular" | "strong"
  as?: "p" | "span" | "div" | "h2" | "h3"
}) {
  const cls = [
    size === "small" && "k2-text-small",
    size === "figure" && "k2-text-figure",
    weight === "strong" && size !== "figure" && "k2-strong",
  ]
    .filter(Boolean)
    .join(" ")
  return (
    <As className={cls || undefined} style={tone === "ink" ? undefined : { color: TONE[tone] }}>
      {children}
    </As>
  )
}

/** The grey continuation, inline. */
export function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: color.muted }}>{children}</span>
}

/** Mono, only for times, file names and counts. Tabular, untracked. */
export function Mono({
  children,
  tone = "muted",
}: {
  children: React.ReactNode
  tone?: Tone
}) {
  return (
    <span className="k2-mono" style={{ color: TONE[tone] }}>
      {children}
    </span>
  )
}

type Width = number | `${number}%`
const w = (x: Width) => (typeof x === "number" ? u(x) : x)

/** One grey bar standing in for content the viewer does not need to read. */
export function Skeleton({ width }: { width: Width }) {
  return <span aria-hidden className="k2-skel" style={{ width: w(width) }} />
}

/** A paragraph of bars. Vary the widths; equal bars read as a table. */
export function SkeletonLines({ widths }: { widths: readonly Width[] }) {
  return (
    <span aria-hidden className="k2-skel-lines">
      {widths.map((x, i) => (
        <span key={i} className="k2-skel" style={{ width: w(x) }} />
      ))}
    </span>
  )
}

/**
 * A number that counts to its new value instead of swapping, so the change
 * reads as caused. From 19. Snaps under reduced motion.
 */
export function Count({
  value,
  format = (n: number) => Math.round(n).toLocaleString("en-US"),
}: {
  value: number
  format?: (n: number) => string
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(value)
  const from = React.useRef(value)

  React.useEffect(() => {
    if (reduced) {
      from.current = value
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / motion.enter)
      const v = a + (value - a) * (1 - Math.pow(1 - p, 3))
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced])

  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {format(reduced ? value : shown)}
    </span>
  )
}

// ── The editor's marks ───────────────────────────────────────────────────

/**
 * The yellow highlighter on the one sentence that matters. Sweeps once the
 * first time it is seen; pass `active` to drive it yourself (a tab swap).
 * Under reduced motion it is simply there.
 */
export function Highlight({
  children,
  active,
}: {
  children: React.ReactNode
  active?: boolean
}) {
  const [ref, seen] = useInView<HTMLElement>()
  const on = active ?? seen
  return (
    <mark ref={ref} className="k2-hl" data-on={on || undefined}>
      {children}
    </mark>
  )
}

/** Quincy's handwriting, free-standing. Inside a margin, use MarginNote. */
export function Hand({
  children,
  tone = "graphite",
}: {
  children: React.ReactNode
  /** `accent` is the pen that names beats; graphite is everything else. */
  tone?: "graphite" | "accent"
}) {
  return (
    <span className="k2-hand" data-tone={tone}>
      {children}
    </span>
  )
}

function Bracket({ tone }: { tone: "graphite" | "accent" }) {
  return (
    <span className="k2-bracket" aria-hidden>
      <svg viewBox="0 0 10 100" preserveAspectRatio="none">
        <path
          d="M1 1.5 C 5 1.5, 6 3, 6 8 L 6.4 44 C 6.5 48, 7.5 50, 10 50 C 7.5 50, 6.5 52, 6.4 56 L 6 92 C 6 97, 5 98.5, 1 98.5"
          fill="none"
          stroke={tone === "accent" ? "var(--k2-accent)" : color.graphite}
          strokeWidth={1.3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  )
}

/**
 * A handwritten note in the margin beside the line(s) it wraps, with a
 * bracket spanning them. The wrapped block must reach the object's content
 * edge, and the object needs ~180 design px of stage to its right.
 */
export function MarginNote({
  note,
  children,
  timing = "at-rest",
}: {
  note: React.ReactNode
  children: React.ReactNode
  /** `after-highlight` waits on view for the sweep beneath it, then writes in. */
  timing?: "at-rest" | "after-highlight"
}) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const wait = timing === "after-highlight"
  return (
    <div ref={ref} className="k2-annotated">
      {children}
      <span
        className="k2-margin"
        data-wait={wait || undefined}
        data-on={(wait && seen) || undefined}
      >
        <Bracket tone="graphite" />
        <Hand>{note}</Hand>
      </span>
    </div>
  )
}

export type Beat = "did" | "happened" | "meant"

const BEAT_LABEL: Record<Beat, string> = {
  did: "what I did",
  happened: "what happened",
  meant: "what it meant",
}

const BeatFocus = React.createContext<{
  active: Beat | null
  set: (b: Beat | null) => void
} | null>(null)

/**
 * Optional wrapper around a draft's three BeatBrackets. Pointing at one beat
 * quiets the other two. Mouse only: hover enhances, all three read at rest.
 */
export function Beats({ children }: { children: React.ReactNode }) {
  const [active, set] = React.useState<Beat | null>(null)
  const value = React.useMemo(() => ({ active, set }), [active])
  return (
    <BeatFocus value={value}>
      <div onPointerLeave={() => set(null)}>{children}</div>
    </BeatFocus>
  )
}

/** The blue-pen bracket naming one beat: what I did / what happened / what it meant. */
export function BeatBracket({
  beat,
  children,
}: {
  beat: Beat
  children: React.ReactNode
}) {
  const focus = React.useContext(BeatFocus)
  const dim = focus?.active != null && focus.active !== beat
  return (
    <div
      className="k2-annotated k2-beat"
      data-dim={dim || undefined}
      onPointerEnter={(e) => {
        if (focus && e.pointerType === "mouse") focus.set(beat)
      }}
    >
      <div className="k2-beat-line">{children}</div>
      <span className="k2-margin">
        <Bracket tone="accent" />
        <Hand tone="accent">{BEAT_LABEL[beat]}</Hand>
      </span>
    </div>
  )
}

// ── Actions ──────────────────────────────────────────────────────────────

type ButtonBase = {
  children: React.ReactNode
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  type?: "button" | "submit"
  disabled?: boolean
  /** Leading hugeicon, decorative beside the label. */
  icon?: IconSvgElement
  ref?: React.Ref<HTMLButtonElement>
}

/**
 * The one accent action (Approve). Press scales to 0.97; hover mixes toward
 * the surface, never an alpha. While `pending` it disables and shows
 * `pendingLabel`.
 */
export function ActionButton({
  children,
  onClick,
  type: buttonType = "button",
  disabled = false,
  pending = false,
  pendingLabel,
  icon,
  ref,
}: ButtonBase & { pending?: boolean; pendingLabel?: string }) {
  return (
    <button
      ref={ref}
      type={buttonType}
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className="k2-action"
    >
      {icon ? (
        <HugeiconsIcon icon={icon} strokeWidth={2} className="k2-icon" aria-hidden />
      ) : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}

/** The secondary action beside it (Edit, Undo). Grey text that inks on hover. */
export function QuietButton({
  children,
  onClick,
  type: buttonType = "button",
  disabled = false,
  icon,
  ref,
}: ButtonBase) {
  return (
    <button
      ref={ref}
      type={buttonType}
      onClick={onClick}
      disabled={disabled}
      className="k2-quiet"
    >
      {icon ? (
        <HugeiconsIcon icon={icon} strokeWidth={2} className="k2-icon" aria-hidden />
      ) : null}
      {children}
    </button>
  )
}

// ── Arrival ──────────────────────────────────────────────────────────────

/**
 * Something the person caused arrives: a rule slides into the brain, a riff
 * card under the recorder. A transition, not a keyframe, so flipping `show`
 * back retargets instead of restarting. Hidden content is inert.
 */
export function Arrive({
  show,
  from = "above",
  children,
}: {
  show: boolean
  /** `above` for a row joining a list, `below` for an object rising into place. */
  from?: "above" | "below"
  children: React.ReactNode
}) {
  return (
    <div
      className="k2-arrive"
      data-on={show || undefined}
      data-from={from}
      aria-hidden={!show || undefined}
      inert={!show}
    >
      <div>{children}</div>
    </div>
  )
}
