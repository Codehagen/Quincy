import type { Us } from "./time"

/**
 * Microseconds to frames, which is the border between our document and Remotion.
 *
 * The document stores integer microseconds (see ./time.ts) because that is what
 * survives arithmetic without drifting. Remotion counts frames, because a
 * compositor has to land on one. Everything either side of this file stays in
 * its own unit, and the conversion happens once at the boundary rather than
 * being sprinkled through the composition.
 *
 * Rounded, not floored. A clip 2.999 frames long is three frames of picture,
 * and flooring loses the last one at every single cut — which reads as the edit
 * being a frame tight everywhere, the most annoying possible kind of wrong.
 */
export function framesFor(timeUs: number, fps: number): number {
  return Math.round((timeUs / 1_000_000) * fps)
}

/** Frames back to microseconds, for reporting the playhead to the timeline. */
export function usForFrame(frame: number, fps: number): number {
  return Math.round((frame / fps) * 1_000_000)
}

/**
 * A clip's length in frames, never less than one.
 *
 * Remotion treats `durationInFrames: 0` as an error, and a clip can legitimately
 * round to zero — a 10ms sliver at 30fps is a third of a frame. One frame is the
 * honest answer: it is the shortest thing that can be shown.
 */
export function durationInFrames(timeUs: Us | number, fps: number): number {
  return Math.max(1, framesFor(timeUs, fps))
}
