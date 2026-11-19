import type { PunchInOptions } from "./edits"
import { us } from "./time"

/**
 * The three zooms you can pick in the effects panel.
 *
 * All of them stay at the restrained amounts emphasis.ts settles on: the
 * difference between them is how the push moves, not how far it goes.
 * - push: leans in, holds, eases back out. What Z adds.
 * - punch: cuts in close on the beat and cuts back, no ramp. For a joke or a
 *   number landing.
 * - drift: creeps in across the whole moment and cuts back out at its end, so
 *   a long line feels like the camera moving closer while you listen.
 */

export const ZOOM_KINDS = ["push", "punch", "drift"] as const
export type ZoomKind = (typeof ZOOM_KINDS)[number]

export const ZOOM_KIND_LABEL: Record<ZoomKind, string> = {
  push: "Push",
  punch: "Punch",
  drift: "Drift",
}

export const ZOOM_KIND_HINT: Record<ZoomKind, string> = {
  push: "Lean in on a moment and ease back out",
  punch: "Cut in close on the beat, then cut back",
  drift: "Creep in slowly across the whole moment",
}

/** One frame at 30 fps: a cut, not a move. */
const PUNCH_RAMP_US = 33_000

/** What each kind hands to `punchIn`, on top of where it starts and ends. */
export function zoomKindOptions(
  kind: ZoomKind
): Pick<PunchInOptions, "scale" | "rampUs" | "shape"> {
  switch (kind) {
    case "push":
      return {}
    case "punch":
      // A touch closer than a push: with no ramp to sell it, 1.12 reads as a
      // wobble rather than a cut.
      return { scale: 1.18, rampUs: us(PUNCH_RAMP_US) }
    case "drift":
      // Less than a push, because it spends its whole window getting there.
      return { scale: 1.08, shape: "drift" }
  }
}

/** Where the picture is furthest in, to park the playhead on after adding. */
export function zoomPeakUs(
  kind: ZoomKind,
  fromUs: number,
  toUs: number,
  pushRampUs: number
): number {
  const windowUs = Math.max(0, toUs - fromUs)
  switch (kind) {
    case "push":
      return fromUs + Math.min(pushRampUs, windowUs / 2)
    case "punch":
      return fromUs + Math.min(PUNCH_RAMP_US * 2, windowUs / 2)
    case "drift":
      return Math.max(fromUs, toUs - 100_000)
  }
}
