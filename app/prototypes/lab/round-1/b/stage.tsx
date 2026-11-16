"use client"

import * as React from "react"

import { caveat, inter } from "./fonts"

/**
 * Shared parts for group b. Every piece is drawn on a 500 × 375 canvas and
 * scaled by the frame: `--u` is one canvas pixel, so a 560px frame and a 360px
 * frame show the same composition rather than two reflowed layouts.
 */

export const CANVAS = 500

/** A canvas length. `u(14)` is 14px at 500 wide. */
export const u = (n: number) => `calc(var(--u) * ${n})`

export const INK = "#111111"
export const GREY = "rgba(17, 17, 17, 0.48)"
export const FAINT = "rgba(17, 17, 17, 0.32)"
export const SKELETON = "#ECECEA"
export const MONO = `ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace`

/** White object on the grey stage: hairline ring and a very soft fall. */
export const OBJECT_SHADOW =
  "0 0 0 1px rgba(17,17,17,0.06), 0 1px 2px rgba(17,17,17,0.04), 0 10px 28px -10px rgba(17,17,17,0.12)"

const REDUCED = "(prefers-reduced-motion: reduce)"

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

export function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

/**
 * A looping demo timeline. `durations[i]` is how long phase `i` holds before
 * the next one. It only runs while the piece is on screen, and under reduced
 * motion it does not run at all: the piece shows `rest` (its finished state)
 * until the person acts on it themselves.
 */
export function useSequence(
  durations: number[],
  rootRef: React.RefObject<HTMLElement | null>,
  rest: number,
  paused = false,
) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = React.useState(0)
  const [visible, setVisible] = React.useState(false)
  const [touched, setTouched] = React.useState(false)

  React.useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootRef])

  React.useEffect(() => {
    if (reduced || !visible || paused) return
    const id = window.setTimeout(
      () => setPhase((p) => (p + 1) % durations.length),
      durations[phase],
    )
    return () => window.clearTimeout(id)
  }, [phase, visible, reduced, paused, durations])

  const jump = React.useCallback((p: number) => {
    setTouched(true)
    setPhase(p)
  }, [])

  const shown = reduced && !touched ? rest : phase
  return { phase: shown, jump, reduced }
}

type Point = { x: number; y: number }
type Target = React.RefObject<HTMLElement | null> | Point

/**
 * The demo's hand. It glides to the centre of a target element (or a canvas
 * point), and `pressed` squeezes it for a click. Positioning is written
 * straight to the DOM so a resize re-measures without a render.
 */
export function Cursor({
  stageRef,
  target,
  pressed = false,
  hidden = false,
  at = [0.5, 0.55],
  duration = 900,
}: {
  stageRef: React.RefObject<HTMLElement | null>
  target: Target
  pressed?: boolean
  hidden?: boolean
  /** Where on the target the tip lands, as fractions of its box. */
  at?: [number, number]
  duration?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [fx, fy] = at

  React.useEffect(() => {
    const stage = stageRef.current
    const el = ref.current
    if (!stage || !el) return
    const place = () => {
      const s = stage.getBoundingClientRect()
      if (s.width === 0) return
      const scale = s.width / CANVAS
      let p: Point
      if ("current" in target) {
        const t = target.current
        if (!t) return
        const r = t.getBoundingClientRect()
        p = {
          x: (r.left + r.width * fx - s.left) / scale,
          y: (r.top + r.height * fy - s.top) / scale,
        }
      } else {
        p = target
      }
      el.style.transform = `translate(${u(p.x)}, ${u(p.y)})`
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [stageRef, target, fx, fy])

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        zIndex: 30,
        pointerEvents: "none",
        opacity: hidden ? 0 : 1,
        transitionProperty: "transform, opacity",
        transitionDuration: reduced ? "0ms" : `${duration}ms, 200ms`,
        transitionTimingFunction: "cubic-bezier(0.45, 0, 0.2, 1)",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        style={{
          width: u(20),
          height: u(20),
          display: "block",
          transformOrigin: "3px 2px",
          transform: pressed ? "scale(0.84)" : "scale(1)",
          transition: reduced ? "none" : "transform 120ms ease-out",
          filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))",
        }}
      >
        <path
          d="M3.5 2.2 L3.5 19.6 L8.1 15.3 L11 21.6 L13.9 20.4 L11.1 14.2 L17.4 14.2 Z"
          fill={INK}
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

/** The stage: grey ground, Inter, and the canvas unit. */
export function Stage({
  stageRef,
  children,
  label,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
  label: string
}) {
  return (
    <div
      className={`${inter.variable} ${caveat.variable}`}
      style={{
        position: "absolute",
        inset: 0,
        containerType: "inline-size",
        background: "#F2F2F1",
      }}
    >
      <div
        ref={stageRef}
        role="group"
        aria-label={label}
        style={
          {
            "--u": `calc(100cqw / ${CANVAS})`,
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            fontFamily: "var(--lab-inter), system-ui, sans-serif",
            fontSize: u(14),
            lineHeight: u(20),
            letterSpacing: u(-0.09),
            fontWeight: 460,
            color: INK,
            WebkitFontSmoothing: "antialiased",
            fontFeatureSettings: '"cv11", "ss01"',
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  )
}

/** "Bold lead sentence. Grey continuation." — top left of the tile. */
export function Lead({
  bold,
  rest,
  width = 330,
}: {
  bold: string
  rest: string
  width?: number
}) {
  return (
    <p
      style={{
        position: "absolute",
        left: u(28),
        top: u(26),
        width: u(width),
        margin: 0,
        textWrap: "pretty",
      }}
    >
      <span style={{ fontWeight: 560 }}>{bold}</span>{" "}
      <span style={{ color: GREY }}>{rest}</span>
    </p>
  )
}

/** A grey rounded line standing in for content the viewer doesn't need. */
export function Bar({
  w,
  h = 8,
  tone = SKELETON,
  style,
}: {
  w: number | string
  h?: number
  tone?: string
  style?: React.CSSProperties
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: typeof w === "number" ? u(w) : w,
        height: u(h),
        borderRadius: u(h),
        background: tone,
        ...style,
      }}
    />
  )
}

/** Window chrome — used at most once in a composition. */
export function Chrome({ address }: { address: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: u(14),
        height: u(36),
        padding: `0 ${u(14)}`,
        borderBottom: "1px solid rgba(17,17,17,0.06)",
      }}
    >
      <div style={{ display: "flex", gap: u(6) }} aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: u(9),
              height: u(9),
              borderRadius: "50%",
              background: "#E2E2E0",
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontFamily: MONO,
          fontSize: u(11.5),
          color: FAINT,
          letterSpacing: 0,
        }}
      >
        {address}
      </span>
    </div>
  )
}

export function Avatar({ size = 24, initials = "CH" }: { size?: number; initials?: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: u(size),
        height: u(size),
        borderRadius: "50%",
        background: "#E6E6E3",
        color: GREY,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: u(size * 0.42),
        fontWeight: 560,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  )
}

/** Keyframes shared by the pieces. Loops only; interactive state uses transitions. */
export function SharedStyles() {
  return (
    <style>{`
@keyframes b-rec { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
@keyframes b-caret { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
@media (prefers-reduced-motion: reduce) {
  .b-loop { animation: none !important; }
}
`}</style>
  )
}
