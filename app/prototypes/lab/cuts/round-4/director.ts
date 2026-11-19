"use client"

/*
 * The director: turns tool parts into a person's gestures, compressed.
 *
 * The contract holds: every gesture belongs to one tool part. A part in
 * `input-available` starts the approach (glide, the hover in its last 40 ms,
 * the drag-select for a pause, the "um" or the strong line); the part's
 * `output-available` is the press (or ⌫) and the change. The press never
 * comes before the output; if the output comes first, the press waits for
 * the gesture to finish, so the change always lands with the press.
 *
 * One async timeline per run, cancelled by bumping a generation: Replay,
 * Stop, Undo and unmount all cancel every pending wait, so nothing stacks.
 * The cursor's position is written to its style (a transition on
 * `translate`, so a new target, or the park, retargets mid-glide).
 *
 * Reduced motion: no glide and no drag; the presses come in order, 60 ms
 * apart, each with an opacity-only highlight.
 */

import * as React from "react"

import { useReducedMotion } from "@/components/kit"

import { measure } from "../round-2/cursor"

export type Beat = { id: string; target: string; started: boolean; landed: boolean }
export type Kind = "delete" | "button" | "zoom" | "look" | "click"

export function kindOf(target: string): Kind {
  const k = target.split(":").pop() ?? ""
  if (/^(p\d|um|s\d)$/.test(k)) return "delete"
  if (k === "captions") return "button"
  if (k === "hook") return "zoom"
  if (k === "preview") return "look"
  return "click"
}

export const zoomButton = (target: string) => target.replace(/hook$/, "zoom-btn")

export type Visual = {
  /** Beat ids the cursor has pressed: what the lanes show. */
  pressed: string[]
  hover: string | null
  drag: { target: string; ms: number } | null
  /** The strong line whose Zoom control is up. */
  toolbar: string | null
  /** A real control in its pressed state (scale 0.96, 120 ms). */
  button: string | null
  hot: string | null
  presses: number
  /** The ⌫ cap's key: bumps on every delete. */
  cap: number
  running: boolean
  /** Bumps when the lanes jump without the cursor (Undo, Redo, Replay): one crossfade. */
  revision: number
}

const IDLE: Visual = {
  pressed: [],
  hover: null,
  drag: null,
  toolbar: null,
  button: null,
  hot: null,
  presses: 0,
  cap: 0,
  running: false,
  revision: 0,
}

/**
 * Live timing, read at every use, so a tune panel can change it mid-run
 * without re-rendering anything. `speed` divides every duration.
 */
export type Tune = {
  speed: number
  glideMin: number
  glideMax: number
  press: number
  gapFirst: number
  gapLast: number
  tone: "ink" | "highlight"
  ring: boolean
}

export const DEFAULT_TUNE: Tune = {
  speed: 1,
  glideMin: 110,
  glideMax: 220,
  press: 90,
  gapFirst: 140,
  gapLast: 60,
  tone: "ink",
  ring: true,
}

class Cancelled extends Error {}

const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Left and right edge of a target, mid-height, in the root's own pixels. */
function edges(root: HTMLElement, id: string) {
  const t = root.querySelector<HTMLElement>(`[data-q="${CSS.escape(id)}"]`)
  if (!t) return null
  const r = root.getBoundingClientRect()
  const s = r.width / root.offsetWidth || 1
  const b = t.getBoundingClientRect()
  return { x0: (b.left - r.left) / s + 1, x1: (b.right - r.left) / s - 1, y: (b.top + b.height / 2 - r.top) / s }
}

export type Director = ReturnType<typeof useDirector>

export function useDirector(
  beats: readonly Beat[],
  {
    root,
    active,
    pace = 1,
    delay = 0,
    tune,
  }: {
    root: React.RefObject<HTMLElement | null>
    /** The stream is running. A beat that has not landed when it stops is skipped. */
    active: boolean
    /** Multiplies every duration; under 1 is faster. */
    pace?: number
    /** Before the first beat: so several cursors never move in lockstep. */
    delay?: number
    /** Live timing (a tune panel). Read at every use, never as state. */
    tune?: React.RefObject<Tune>
  },
) {
  const reduced = useReducedMotion()
  const [v, setV] = React.useState<Visual>(IDLE)
  const set = React.useCallback(
    (patch: Partial<Visual> | ((prev: Visual) => Partial<Visual>)) =>
      setV((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) })),
    [],
  )

  const cursor = React.useRef<HTMLDivElement | null>(null)
  const pos = React.useRef<{ x: number; y: number } | null>(null)
  const gen = React.useRef(0)
  const looping = React.useRef(false)
  const next = React.useRef(0)
  const beatsRef = React.useRef(beats)
  const activeRef = React.useRef(active)
  const wake = React.useRef<(() => void) | null>(null)

  /* ------------------------------------------------------------ primitives */

  const wait = (ms: number, g: number) =>
    new Promise<void>((resolve, reject) => {
      window.setTimeout(() => (g === gen.current ? resolve() : reject(new Cancelled())), Math.max(0, ms))
    })

  const until = async (cond: () => boolean, g: number) => {
    while (!cond()) {
      await new Promise<void>((r) => {
        wake.current = r
      })
      if (g !== gen.current) throw new Cancelled()
    }
  }

  const move = (p: { x: number; y: number }, ms: number) => {
    const node = cursor.current
    if (!node) return
    if (!pos.current) {
      node.style.transitionDuration = "0ms"
      node.style.translate = `${p.x}px ${p.y}px`
      void node.offsetWidth
    }
    node.style.transitionDuration = `${pos.current ? ms : 0}ms`
    node.style.translate = `${p.x}px ${p.y}px`
    node.dataset.shown = ""
    delete node.dataset.parked
    pos.current = p
  }

  const t = () => tune?.current ?? DEFAULT_TUNE
  /** Every duration goes through here: the piece's pace over the live speed. */
  const k = () => pace / t().speed

  const glideTo = (p: { x: number; y: number }) => {
    const from = pos.current
    const dist = from ? Math.hypot(p.x - from.x, p.y - from.y) : 0
    const ms = reduced || !from ? 0 : clamp(t().glideMin, dist / 4, t().glideMax) * k()
    move(p, ms)
    return ms
  }

  const park = () => {
    const node = cursor.current
    if (node && pos.current) {
      node.style.transitionDuration = ""
      node.style.translate = `${pos.current.x + 24}px ${pos.current.y}px`
      node.dataset.parked = ""
    }
    pos.current = null
    set({ running: false, hover: null, drag: null, toolbar: null })
  }

  const cancel = () => {
    gen.current++
    looping.current = false
    wake.current?.()
  }

  /* ---------------------------------------------------------- one gesture */

  const perform = async (i: number, b: Beat, g: number) => {
    const box = root.current
    const kind = kindOf(b.target)

    if (box && !reduced) {
      const e = edges(box, b.target)
      const drags = kind === "delete" || kind === "zoom"
      const land = e && drags ? { x: e.x0, y: e.y } : measure(box, b.target)
      if (land) {
        const ms = glideTo(land)
        await wait(ms - 40, g)
        set({ hover: b.target })
        await wait(Math.min(40, ms), g)
      }
      if (e && drags) {
        // The selection grows with the cursor, same duration, same curve.
        const ms = clamp(90, (e.x1 - e.x0) / 2, 160) * k()
        set({ hover: null, drag: { target: b.target, ms } })
        move({ x: e.x1, y: e.y }, ms)
        await wait(ms, g)
      }
      if (kind === "zoom") {
        set({ toolbar: b.target })
        await wait(40, g)
        const z = measure(box, zoomButton(b.target))
        if (z) {
          const ms = glideTo(z)
          await wait(ms - 40, g)
          set({ hover: zoomButton(b.target) })
          await wait(Math.min(40, ms), g)
        }
      }
    }

    // The press waits for the op. If the stream stopped first, the beat is skipped.
    await until(() => Boolean(beatsRef.current[i]?.landed) || !activeRef.current, g)
    if (!beatsRef.current[i]?.landed) return false

    const pressedButton = kind === "button" ? b.target : kind === "zoom" ? zoomButton(b.target) : null
    set((prev) => ({
      pressed: [...prev.pressed, b.id],
      presses: prev.presses + 1,
      cap: kind === "delete" ? prev.cap + 1 : prev.cap,
      hot: b.target,
      button: pressedButton,
      hover: null,
      drag: null,
    }))
    if (pressedButton) {
      window.setTimeout(() => {
        if (g === gen.current) set({ button: null, toolbar: null })
      }, 120)
    }

    // Captions are a wave: the chips come in left to right and the cursor
    // rides above the leading chip, 25 ms a chip, 300 ms at most.
    if (kind === "button" && box && !reduced) {
      await wait(16, g)
      const end = measure(box, `${b.target}-end`)
      const chips = box.querySelectorAll(`[data-wave="${CSS.escape(b.target)}"]`).length || 10
      const ms = Math.min(300, chips * 25)
      if (end) move(end, ms)
      await wait(ms, g)
    }
    return true
  }

  /* ----------------------------------------------------------------- loop */

  const loop = async (g: number) => {
    looping.current = true
    set({ running: true })
    try {
      if (delay && !reduced) await wait(delay * k(), g)
      const first = next.current
      for (let i = first; ; i++) {
        await until(() => Boolean(beatsRef.current[i]?.started) || !activeRef.current, g)
        const b = beatsRef.current[i]
        if (!b?.started) break
        const landed = await perform(i, b, g)
        next.current = i + 1
        if (!landed) {
          next.current = beatsRef.current.length
          break
        }
        // Gaps shrink through the run: ~140 ms after the first press, 60 at the end.
        const { gapFirst, gapLast } = t()
        await wait(reduced ? 60 : Math.max(gapLast, gapFirst - (i - first) * ((gapFirst - gapLast) / 4)) * k(), g)
      }
      park()
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e
    } finally {
      if (g === gen.current) looping.current = false
    }
  }

  /** The lanes jump to what has landed, with no cursor (Undo, Redo, Replay). */
  const settle = () => {
    const all = beatsRef.current
    next.current = all.length
    pos.current = null
    const node = cursor.current
    if (node) {
      delete node.dataset.shown
      delete node.dataset.parked
    }
    set((prev) => ({
      ...IDLE,
      pressed: all.filter((b) => b.landed).map((b) => b.id),
      presses: prev.presses,
      cap: prev.cap,
      revision: prev.revision + 1,
    }))
  }

  /* ------------------------------------------------------------- reacting */

  const key = beats.map((b) => `${b.id}${b.started ? 1 : 0}${b.landed ? 1 : 0}`).join("|")

  React.useEffect(() => {
    beatsRef.current = beats
    activeRef.current = active
  })

  React.useEffect(() => {
    beatsRef.current = beats
    activeRef.current = active
    const all = beats
    if (all.length < next.current) {
      // The conversation went back (Undo, Replay): cancel, and show what is left.
      cancel()
      settle()
      return
    }
    if (!looping.current && all.length > next.current) {
      if (active) {
        cancel()
        void loop(gen.current)
      } else if (all.slice(next.current).every((b) => b.landed)) {
        settle()
      }
    }
    wake.current?.()
    // `key` stands for `beats`: a new array every render, the same beats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active])

  React.useEffect(() => () => cancel(), [])

  return { v, cursor, reduced }
}
