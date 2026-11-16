"use client"

import * as React from "react"

import { useReducedMotion } from "@/components/kit/use-reduced-motion"

import type { MascotState } from "./engine"
import {
  NIB_STROKE,
  SMOOTH,
  type SmoothPose,
  WORD_STROKE,
  blendPose,
  bodyPath,
  eyePath,
  locateSmooth,
  nibPath,
  sampleSmooth,
  sashPath,
  smoothDuration,
  stillPose,
  wordsPath,
} from "./smooth"

export type SmoothFriendProps = {
  /** What Quincy is doing. docs/design/mascot.md says which state means what. */
  state?: MascotState
  /** The box, in CSS px. The drawing is vector and fills it at any size. */
  size?: number
  /** Stop the clock where it is. */
  paused?: boolean
  /** Show the pose `frozenAt` ms into the state, with no clock at all. */
  frozenAt?: number
  /** Playback rate of the clock. 1 is real time. For the state board only. */
  speed?: number
  /** The friend's accessible name. Without one it is decorative. */
  label?: string
  className?: string
}

/** The longest a single animation frame may advance the clock, in ms. */
const MAX_STEP = 250
/** How fast a new state takes over from the pose on screen. */
const BLEND_TAU = 90

const BODY_D = bodyPath()

type Parts = {
  svg: SVGSVGElement | null
  left: SVGPathElement | null
  right: SVGPathElement | null
  sash: SVGPathElement | null
  flash: SVGPathElement | null
  words: SVGPathElement | null
  nib: SVGPathElement | null
}

function draw(p: SmoothPose) {
  return {
    left: eyePath(p.eyes[0]),
    right: eyePath(p.eyes[1]),
    sash: sashPath(p.sash),
    flash: p.sash.flash,
    words: wordsPath(p.sash),
    wordsOpacity: p.sash.words,
    nib: nibPath(p.sash),
  }
}

function apply(parts: Parts, p: SmoothPose, state: MascotState) {
  const d = draw(p)
  parts.svg?.setAttribute("data-state", state)
  parts.left?.setAttribute("d", d.left)
  parts.right?.setAttribute("d", d.right)
  parts.sash?.setAttribute("d", d.sash)
  parts.flash?.setAttribute("d", d.sash)
  parts.flash?.setAttribute("opacity", String(d.flash))
  parts.words?.setAttribute("d", d.words)
  parts.words?.setAttribute("opacity", String(d.wordsOpacity))
  parts.nib?.setAttribute("d", d.nib)
}

/**
 * Smooth friend: the mascot at large sizes (components/mascot/smooth.ts).
 * One filled body path with the eyes cut out of it by a mask, so an eye is
 * always a hole showing the ground; the sash, the flash, the words and the
 * pen are drawn on top. Ink is currentColor; the sash is `--kit-mascot-sash`
 * and the pen `--kit-mascot-keep` on both grounds.
 *
 * The clock is requestAnimationFrame and it writes the paths straight to the
 * DOM, so a moving friend does not re-render React sixty times a second. A
 * change of state blends from the pose on screen with an exponential
 * ease-out, so it never jumps.
 *
 * Under `prefers-reduced-motion` it holds each state's representative pose
 * (`stillPose`). A one-shot (found, sent) still hands over to idle once, when
 * it would have ended.
 */
export function SmoothFriend({
  state = "idle",
  size = 32,
  paused = false,
  frozenAt,
  speed = 1,
  label,
  className,
}: SmoothFriendProps) {
  const reduced = useReducedMotion()
  const frozen = frozenAt !== undefined
  const mask = `qf-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  // The pose React paints for a live friend: fixed at mount, so a re-render
  // never overwrites what the clock has drawn.
  const [mountPose] = React.useState(() => sampleSmooth(state, 0))
  const [handedOver, setHandedOver] = React.useState<MascotState | null>(null)
  const [entered, setEntered] = React.useState(state)
  if (entered !== state) {
    setEntered(state)
    setHandedOver(null)
  }

  const parts = React.useRef<Parts>({ svg: null, left: null, right: null, sash: null, flash: null, words: null, nib: null })
  const elapsed = React.useRef(0)
  const shown = React.useRef<SmoothPose>(mountPose)
  const from = React.useRef<SmoothPose | null>(null)
  const speedRef = React.useRef(speed)

  React.useEffect(() => {
    speedRef.current = speed
  }, [speed])

  // A new state starts from its own beginning, blending from what is on screen.
  const first = React.useRef(true)
  React.useEffect(() => {
    elapsed.current = 0
    from.current = first.current ? null : shown.current
    first.current = false
  }, [state])

  // The clock.
  React.useEffect(() => {
    if (frozen || paused || reduced) return
    let raf = 0
    let prev: number | null = null
    const tick = (now: number) => {
      const dt = prev === null ? 0 : Math.min(now - prev, MAX_STEP)
      prev = now
      elapsed.current += dt * speedRef.current
      const t = elapsed.current
      const target = sampleSmooth(state, t)
      const p = from.current ? 1 - Math.exp(-t / BLEND_TAU) : 1
      if (p > 0.999) from.current = null
      const pose = from.current ? blendPose(from.current, target, p) : target
      shown.current = pose
      apply(parts.current, pose, locateSmooth(state, t).state)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state, frozen, paused, reduced])

  // Reduced motion: the held pose. A one-shot cuts to its `then` once.
  React.useEffect(() => {
    const then = SMOOTH[state].then
    if (frozen || !reduced || !then || paused) return
    const id = window.setTimeout(
      () => setHandedOver(state),
      smoothDuration(state) / Math.max(speedRef.current, 0.01),
    )
    return () => window.clearTimeout(id)
  }, [state, frozen, reduced, paused])

  const then = SMOOTH[state].then
  const heldState = handedOver === state && then ? then : state
  const pose = frozen ? sampleSmooth(state, frozenAt) : reduced ? stillPose(heldState) : mountPose
  const shownState = frozen ? locateSmooth(state, frozenAt).state : reduced ? heldState : state
  const d = draw(pose)

  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const)

  return (
    <svg
      {...a11y}
      ref={(el) => {
        parts.current.svg = el
      }}
      data-slot="smooth-friend"
      data-state={shownState}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      focusable="false"
    >
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
          <path d={BODY_D} fill="white" />
          <path ref={(el) => { parts.current.left = el }} d={d.left} fill="black" />
          <path ref={(el) => { parts.current.right = el }} d={d.right} fill="black" />
        </mask>
      </defs>
      <path d={BODY_D} fill="currentColor" mask={`url(#${mask})`} />
      <path ref={(el) => { parts.current.sash = el }} d={d.sash} fill="var(--kit-mascot-sash)" />
      <path
        ref={(el) => { parts.current.flash = el }}
        d={d.sash}
        fill="var(--kit-mascot-keep)"
        opacity={d.flash}
      />
      <path
        ref={(el) => { parts.current.words = el }}
        d={d.words}
        fill="none"
        stroke="var(--kit-mascot-keep)"
        strokeWidth={WORD_STROKE}
        strokeLinecap="round"
        opacity={d.wordsOpacity}
      />
      <path
        ref={(el) => { parts.current.nib = el }}
        d={d.nib}
        fill="none"
        stroke="var(--kit-mascot-keep)"
        strokeWidth={NIB_STROKE}
        strokeLinecap="round"
      />
    </svg>
  )
}
