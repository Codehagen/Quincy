import type { EditOp, OpTarget } from "@/lib/editor/ops"

/**
 * The locked motion numbers for Quincy's cursor (plans/036, "The motion
 * numbers"; docs/design/decisions.md, "Cuts, decided"), as plain functions so
 * they can be tested without a browser.
 *
 * The defaults are round 4's `DEFAULT_TUNE`. The editor runs them at piece
 * 52's pace (every duration × 1.3), the run the owner approved. The same
 * numbers are on the editor root as CSS variables (agent-cursor.css); the
 * director reads them from there at the start of a run, so the CSS is the one
 * place to tune them, and these are the fallback when it cannot be read.
 */
export type Timing = {
  /** Multiplies every duration. 52 ran at 1.3. */
  pace: number
  glideMinMs: number
  glideMaxMs: number
  pressMs: number
  /** The wait after the first press, shrinking to `gapLastMs` by the fourth. */
  gapFirstMs: number
  gapLastMs: number
  /** Reduced motion: targets change in order this far apart. */
  reducedGapMs: number
  /**
   * The longest an approach (glide and drag) may take before the press.
   *
   * The op has already arrived when the approach starts, so this is how long
   * a change waits for its press: about one press, never longer.
   */
  approachMaxMs: number
}

export const TIMING: Timing = {
  pace: 1.3,
  glideMinMs: 110,
  glideMaxMs: 220,
  pressMs: 90,
  gapFirstMs: 140,
  gapLastMs: 60,
  reducedGapMs: 60,
  approachMaxMs: 300,
}

/** Distance over four, clamped, at the run's pace. Zero for the first glide. */
export function glideMs(distancePx: number, timing: Timing = TIMING): number {
  if (distancePx <= 0) return 0
  const raw = Math.min(timing.glideMaxMs, Math.max(timing.glideMinMs, distancePx / 4))
  return Math.round(raw * timing.pace)
}

/** The drag-select grows with the cursor: 90–160 ms by width. */
export function dragMs(widthPx: number, timing: Timing = TIMING): number {
  return Math.round(Math.min(160, Math.max(90, widthPx / 2)) * timing.pace)
}

/**
 * Glide and drag scaled down together when they would keep a change waiting
 * longer than `approachMaxMs` for its press.
 */
export function fitApproach(
  glide: number,
  drag: number,
  timing: Timing = TIMING
): { glide: number; drag: number } {
  const total = glide + drag
  if (total <= timing.approachMaxMs) return { glide, drag }
  const k = timing.approachMaxMs / total
  return { glide: Math.round(glide * k), drag: Math.round(drag * k) }
}

/**
 * The wait after press `index` (0-based within the run): about 140 ms after
 * the first, shrinking to 60 by the last, never uniform. A long queue runs
 * at the shortest gap, so a big tightening does not keep the person waiting.
 */
export function gapMs(index: number, queued: number, timing: Timing = TIMING): number {
  const step = (timing.gapFirstMs - timing.gapLastMs) / 4
  const gap = Math.max(timing.gapLastMs, timing.gapFirstMs - index * step)
  return Math.round((queued > 6 ? timing.gapLastMs : gap) * timing.pace)
}

/** The gesture a target asks for on arrival. */
export type Gesture = "cut" | "zoom" | "press"

/**
 * The one target a batch lands on. Every op in a batch from one builder
 * shares it; a batch that somehow mixes targets lands on the first.
 */
export function beatTarget(ops: readonly EditOp[]): OpTarget | null {
  return ops.find((op) => op.target)?.target ?? null
}

/**
 * How much a batch shortens the cut, in microseconds, from its target.
 * A cut's target names the stretches it removes; nothing else shortens.
 */
export function removedUs(target: OpTarget | null): number {
  if (!target || target.action !== "cut" || target.kind !== "range") return 0
  return target.spans.reduce((sum, span) => sum + (span.endUs - span.startUs), 0)
}

/** Read the timing from CSS variables on `root`, falling back to `TIMING`. */
export function readTiming(root: HTMLElement | null): Timing {
  if (!root || typeof window === "undefined") return TIMING
  const style = window.getComputedStyle(root)
  const num = (name: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  return {
    pace: num("--agent-pace", TIMING.pace),
    glideMinMs: num("--agent-glide-min", TIMING.glideMinMs),
    glideMaxMs: num("--agent-glide-max", TIMING.glideMaxMs),
    pressMs: num("--agent-press", TIMING.pressMs),
    gapFirstMs: num("--agent-gap-first", TIMING.gapFirstMs),
    gapLastMs: num("--agent-gap-last", TIMING.gapLastMs),
    reducedGapMs: TIMING.reducedGapMs,
    // The cap is set at the editor's own pace; a slower pace (the mock's
    // speed control) stretches it with everything else, so slow motion
    // shows the approach as it is rather than clipped.
    approachMaxMs: Math.round(
      TIMING.approachMaxMs * (num("--agent-pace", TIMING.pace) / TIMING.pace)
    ),
  }
}
