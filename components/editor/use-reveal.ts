"use client"

import * as React from "react"

import { sceneDurationUs } from "@/lib/editor/timeline"
import type { Scene } from "@/lib/editor/types"

/**
 * Watching the agent cut, rather than finding out that it did.
 *
 * Ported from the choreography in app/prototypes/editor/run.tsx, which settled
 * two things worth restating because both are easy to lose.
 *
 * **The stagger is not a simulation of the edit arriving.** `remove_silences`
 * is one tool call that computes every cut and applies them as a single
 * revision, on purpose — ops.ts batches precisely so the client never renders a
 * half-cut timeline. Feeding clips in one at a time would be a progress bar for
 * work that had already finished. So the edit lands whole and the reveal is
 * choreography over a finished result: every clip transitions from where it
 * was to where it is, with a delay that sweeps across the lane.
 *
 * **The animation gates nothing.** The document changed the moment the ops
 * arrived. The chat has already marked the tool done, the composer is live,
 * and clicking a clip mid-sweep selects it — because what is moving is a
 * transform over the real timeline, not a stand-in for it. If interrupting the
 * motion ever left you somewhere other than the final state, it would have
 * become a progress bar again.
 *
 * What the prototype could fake and this cannot: it knew the "before" spine as
 * a constant. Here the before has to be captured at the moment the ops land,
 * which is why `capture` is called by the op handler rather than derived from
 * a render.
 */

export type Reveal = {
  /** Where each element sat before the edit, by id. */
  startsUs: Map<string, number>
  /** The axis it sat against. A tightened cut is shorter, so this moves too. */
  spanUs: number
  /**
   * False for one frame after the ops land, so the browser paints the old
   * positions before the transition to the new ones begins. Without it both
   * are coalesced into one paint and there is no animation at all.
   */
  animating: boolean
}

/** Each clip's own travel. Long enough to read as movement, short enough to ignore. */
export const REVEAL_TRAVEL_MS = 220

/**
 * The whole sweep, capped.
 *
 * Twenty-two clips at the 40ms design-foundations suggests is 880ms, three
 * times the budget for UI motion. So the stagger is compressed to fit rather
 * than the sweep being allowed to run long, and each clip's own travel stays
 * at REVEAL_TRAVEL_MS so the movement still reads as movement.
 */
const REVEAL_STAGGER_TOTAL_MS = 420

export function revealDelayMs(index: number, count: number): number {
  if (count <= 1) return 0
  return Math.round((index / (count - 1)) * REVEAL_STAGGER_TOTAL_MS)
}

export function useReveal() {
  const [reveal, setReveal] = React.useState<Reveal | null>(null)
  const frames = React.useRef<number[]>([])
  const timer = React.useRef<number | null>(null)

  const clear = React.useCallback(() => {
    frames.current.forEach((id) => cancelAnimationFrame(id))
    frames.current = []
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }, [])

  React.useEffect(() => clear, [clear])

  /**
   * Remember where everything was, then let the edit land.
   *
   * Called with the scene as it stands *before* the ops are applied. Reading it
   * afterwards would record the result and animate nothing.
   */
  const capture = React.useCallback(
    (scene: Scene | undefined) => {
      if (!scene) return

      /**
       * Reduced motion gets the result, not the performance. The sweep is the
       * animation here, so removing it means the edits simply are.
       *
       * Read at call time rather than through a hook: a run that started before
       * the setting changed should not half-play.
       */
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return
      }

      clear()

      const startsUs = new Map<string, number>()
      for (const track of scene.tracks) {
        for (const element of track.elements) {
          startsUs.set(element.id, element.startUs)
        }
      }

      setReveal({ startsUs, spanUs: sceneDurationUs(scene), animating: false })

      // Two frames: one to paint the old positions, one to start the move.
      frames.current.push(
        requestAnimationFrame(() => {
          frames.current.push(
            requestAnimationFrame(() =>
              setReveal((current) =>
                current ? { ...current, animating: true } : null
              )
            )
          )
        })
      )

      // Dropped once the sweep is over, so an idle timeline carries no
      // transition and a later hand edit does not slide.
      timer.current = window.setTimeout(
        () => setReveal(null),
        REVEAL_TRAVEL_MS + REVEAL_STAGGER_TOTAL_MS + 60
      )
    },
    [clear]
  )

  return { reveal, capture }
}

/**
 * How far this element has to travel, in pixels along the lane.
 *
 * Positive means it used to be further right. Expressed against each axis
 * separately, because a tightening changes the span as well as the positions —
 * measuring the old position against the new axis would slide every clip by the
 * difference between the two takes rather than by what actually moved.
 *
 * An element the reveal has never seen is new — a split half, a caption that
 * just arrived — and gets no offset. It appears where it belongs rather than
 * flying in from a position it never had.
 */
export function revealOffsetPx(
  reveal: Reveal | null,
  elementId: string,
  nowStartUs: number,
  nowSpanUs: number,
  laneWidthPx: number
): number {
  if (!reveal || reveal.animating) return 0
  if (reveal.spanUs <= 0 || nowSpanUs <= 0 || laneWidthPx <= 0) return 0

  const wasStartUs = reveal.startsUs.get(elementId)
  if (wasStartUs === undefined) return 0

  const wasFraction = wasStartUs / reveal.spanUs
  const nowFraction = nowStartUs / nowSpanUs

  return (wasFraction - nowFraction) * laneWidthPx
}
