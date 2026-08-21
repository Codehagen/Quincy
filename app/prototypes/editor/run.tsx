"use client"

import * as React from "react"

import { SPINE } from "./data"

/**
 * An agent run, at the granularity the server actually has.
 *
 * The earlier version played twenty-two cuts arriving one at a time. That is
 * not what happens: `remove_silences` is one tool call that computes every cut
 * and applies them as a single revision, on purpose — lib/editor/ops.ts batches
 * precisely so the client never renders a half-cut timeline. Animating the
 * half-cut timeline was a progress bar for work that had already finished.
 *
 * What is real is the tool boundary. A run is three or four atomic state
 * changes, one per tool, and this models exactly that.
 *
 * The stagger did not go away, and should not: twenty-two clips teleporting is
 * a flash nobody can read. It moved to where it belongs — a CSS
 * `transition-delay` over a single state change, so the reveal is choreography
 * on a finished result rather than a simulation of it arriving.
 *
 * The line between the two, and the thing to hold on to: **the animation gates
 * nothing.** The chat marks a tool done the moment it is done, the composer
 * stays live, and clicking a clip mid-sweep selects it. If interrupting the
 * motion ever left you somewhere other than the final state, it would have
 * become a progress bar again.
 */

export const TOOLS = [
  { id: "transcript", label: "Read the transcript" },
  { id: "silences", label: "Remove silences" },
  { id: "captions", label: "Add word-by-word captions" },
  { id: "music", label: "Place music under the voice" },
] as const

export type ToolId = (typeof TOOLS)[number]["id"]

/**
 * How long each tool takes to come back. Not animation timing — this stands in
 * for server work, which is why it is uneven: reading a transcript that ingest
 * already produced is a lookup, and the cut is arithmetic over it.
 */
const TOOL_MS: Record<ToolId, number> = {
  transcript: 180,
  silences: 260,
  captions: 200,
  music: 160,
}

/**
 * The reveal.
 *
 * 22 clips at the 40ms design-foundations suggests is 880ms, three times the
 * budget for UI motion. The sweep is compressed to fit instead: the stagger is
 * capped as a whole, and each clip's own travel stays at 220ms so the movement
 * still reads as movement rather than as a jump.
 */
export const REVEAL_TRAVEL_MS = 220
const REVEAL_STAGGER_TOTAL_MS = 420

export function revealDelayMs(index: number, count: number): number {
  if (count <= 1) return 0
  return Math.round((index / (count - 1)) * REVEAL_STAGGER_TOTAL_MS)
}

export type RunState = {
  /** Tools that have returned. Their edits are in the document. */
  done: ReadonlySet<ToolId>
  /** The tool currently executing, for the chat's shimmer. */
  active: ToolId | null
  running: boolean
  /**
   * False for one frame after the reset, so the take can be painted before the
   * transition to the cut begins. Without it the browser coalesces both into
   * one paint and there is no animation at all.
   */
  animating: boolean
  start: () => void
}

export function useAgentRun(): RunState {
  // Opens on the finished cut: a project you return to is already edited.
  const [done, setDone] = React.useState<Set<ToolId>>(
    () => new Set(TOOLS.map((tool) => tool.id))
  )
  const [active, setActive] = React.useState<ToolId | null>(null)
  const [animating, setAnimating] = React.useState(false)
  const timers = React.useRef<number[]>([])
  const frames = React.useRef<number[]>([])

  const clear = React.useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    frames.current.forEach((id) => cancelAnimationFrame(id))
    timers.current = []
    frames.current = []
  }, [])

  React.useEffect(() => clear, [clear])

  const start = React.useCallback(() => {
    clear()

    /**
     * Reduced motion gets the result, not the performance. The staggered reveal
     * is the animation here, so removing it means the edits simply are. Read at
     * call time rather than through a hook: a run started before the setting
     * changed should not half-play.
     */
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    if (reduced) {
      setAnimating(false)
      setDone(new Set(TOOLS.map((tool) => tool.id)))
      setActive(null)
      return
    }

    // Back to the raw take, with no transition — this is setup, not motion.
    setAnimating(false)
    setDone(new Set())
    setActive(TOOLS[0].id)

    // One frame of the take before anything moves. You cannot read a cut you
    // never saw the "before" of.
    frames.current.push(
      requestAnimationFrame(() => {
        frames.current.push(requestAnimationFrame(() => setAnimating(true)))
      })
    )

    let elapsed = 0
    TOOLS.forEach((tool, index) => {
      elapsed += TOOL_MS[tool.id]
      const id = window.setTimeout(() => {
        // One tool, one state change. Everything that tool did lands together.
        setDone((previous) => new Set(previous).add(tool.id))
        setActive(TOOLS[index + 1]?.id ?? null)
      }, elapsed)
      timers.current.push(id)
    })
  }, [clear])

  return { done, active, running: active !== null, animating, start }
}

export const CLIP_COUNT = SPINE.length
