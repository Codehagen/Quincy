"use client"

import * as React from "react"

import { useReducedMotion } from "@/components/kit/use-reduced-motion"

import { useOnScreen } from "./use-on-screen"

import {
  type Cursor,
  type MascotState,
  GRID,
  INKS,
  STATES,
  duration,
  locate,
  paths,
} from "./engine"

export type PixelFriendProps = {
  /** What Quincy is doing. docs/design/mascot.md says which state means what. */
  state?: MascotState
  /**
   * The box, in CSS px. The drawing snaps to the largest whole multiple of
   * 16 that fits and is centred in the box, so every grid pixel lands on
   * whole device pixels: at 20 the friend is drawn at 16 with 2px around it.
   */
  size?: number
  /** Stop the clock where it is. */
  paused?: boolean
  /** Show the frame `frozenAt` ms into the state, with no clock at all. */
  frozenAt?: number
  /** Playback rate of the clock. 1 is real time. For the state board only. */
  speed?: number
  /**
   * The friend's accessible name. Without one it is decorative
   * (`aria-hidden`), which is right beside a visible "Quincy".
   */
  label?: string
  className?: string
}

const FILL = {
  "#": "currentColor",
  y: "var(--kit-mascot-sash)",
  k: "var(--kit-mascot-keep)",
} as const

/** The longest a single animation frame may advance the clock, in ms. */
const MAX_STEP = 250

function same(a: Cursor, b: Cursor) {
  return a.state === b.state && a.index === b.index
}

/**
 * Pixel friend, Quincy's mascot. A 16×16 bitmap whose state is a list of
 * whole frames (components/mascot/engine.ts). The clock is
 * requestAnimationFrame, and it only re-renders when the frame changes.
 *
 * Under `prefers-reduced-motion` it shows the state's first frame and holds
 * it. A one-shot (found, sent) still hands over to idle when it would have
 * ended, as a single cut, so the meaning does not stick.
 */
export function PixelFriend({
  state = "idle",
  size = 32,
  paused = false,
  frozenAt,
  speed = 1,
  label,
  className,
}: PixelFriendProps) {
  const reduced = useReducedMotion()
  const frozen = frozenAt !== undefined
  const [cursor, setCursor] = React.useState<Cursor>(() => locate(state, frozenAt ?? 0))
  const [entered, setEntered] = React.useState(state)
  // Reduced motion only: the one-shot whose time ran out (see below).
  const [handedOver, setHandedOver] = React.useState<MascotState | null>(null)
  const elapsed = React.useRef(0)
  const speedRef = React.useRef(speed)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const onScreen = useOnScreen(svgRef)

  // A new state starts from its own beginning (state derived during render,
  // so the first frame of the new state paints with the change).
  if (entered !== state) {
    setEntered(state)
    setHandedOver(null)
    setCursor(locate(state, frozenAt ?? 0))
  }

  React.useEffect(() => {
    speedRef.current = speed
  }, [speed])

  React.useEffect(() => {
    elapsed.current = 0
  }, [state])

  // The clock: only while the friend is on screen (useOnScreen).
  React.useEffect(() => {
    if (frozen || paused || reduced || !onScreen) return
    let raf = 0
    let prev: number | null = null
    const tick = (now: number) => {
      const dt = prev === null ? 0 : Math.min(now - prev, MAX_STEP)
      prev = now
      elapsed.current += dt * speedRef.current
      const next = locate(state, elapsed.current)
      setCursor((c) => (same(c, next) ? c : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state, frozen, paused, reduced, onScreen])

  // Reduced motion: the first frame, held. A one-shot cuts to its `then`
  // once, when it would have ended.
  React.useEffect(() => {
    const then = STATES[state].then
    if (frozen || !reduced || !then || paused) return
    const id = window.setTimeout(
      () => setHandedOver(state),
      duration(state) / Math.max(speedRef.current, 0.01),
    )
    return () => window.clearTimeout(id)
  }, [state, frozen, reduced, paused])

  const then = STATES[state].then
  const shown: Cursor = frozen
    ? locate(state, frozenAt)
    : reduced
      ? { state: handedOver === state && then ? then : state, index: 0 }
      : cursor
  const bitmap = STATES[shown.state].frames[shown.index].bitmap
  const d = paths(bitmap)

  const drawn = size >= GRID ? Math.floor(size / GRID) * GRID : size
  const view = (size / drawn) * GRID
  const pad = (view - GRID) / 2

  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const)

  return (
    <svg
      {...a11y}
      ref={svgRef}
      data-slot="pixel-friend"
      data-state={shown.state}
      data-frame={shown.index}
      width={size}
      height={size}
      viewBox={`${-pad} ${-pad} ${view} ${view}`}
      shapeRendering="crispEdges"
      className={className}
      focusable="false"
    >
      {INKS.map((c) => (d[c] ? <path key={c} d={d[c]} fill={FILL[c]} /> : null))}
    </svg>
  )
}
