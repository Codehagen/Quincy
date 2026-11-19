/**
 * How long a model takes, for the runs that play without one (plans/036,
 * phase G): the dev replay model (replay-model.ts) and the prototype mock's
 * transport. A live run's gaps come from the model; a scripted run sent its
 * parts back to back, so the cursor worked faster than it ever will for a
 * person, and the motion was tuned against a pace nobody sees.
 *
 * Three waits, in the order a run meets them:
 * - `thinkMs` before the first tool call (the model reading the request),
 * - `betweenMs()` between tool calls and before the closing line (a model
 *   step: it reads the tool's answer and writes the next call),
 * - `wordMs` per word of text, as the line streams.
 *
 * The jitter is seeded, so a replay is the same run every time.
 */

export type ModelPace = "none" | "realistic" | "slow"

export const MODEL_PACES: readonly ModelPace[] = ["none", "realistic", "slow"]

export type Pace = {
  thinkMs: number
  /** The next gap between model steps; each call moves the seeded jitter on. */
  betweenMs: () => number
  wordMs: number
  /** Between parts of one tool's answer: no model in between, only the tool. */
  partMs: number
}

const SHAPES: Record<ModelPace, { think: number; between: [number, number]; word: number; part: number }> = {
  // The old behaviour: parts back to back.
  none: { think: 0, between: [40, 40], word: 18, part: 40 },
  realistic: { think: 1200, between: [600, 900], word: 32, part: 40 },
  slow: { think: 2400, between: [1200, 1800], word: 60, part: 60 },
}

/** mulberry32: small, fast, and the same numbers for the same seed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function paceOf(pace: ModelPace, seed = 1): Pace {
  const shape = SHAPES[pace]
  const next = seeded(seed)
  const [low, high] = shape.between
  return {
    thinkMs: shape.think,
    betweenMs: () => Math.round(low + (high - low) * next()),
    wordMs: shape.word,
    partMs: shape.part,
  }
}

/** A string's seed: three cuts' sub-runs each get their own, and keep it. */
export function seedOf(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return hash >>> 0
}

/** The words of a line as the deltas a model streams: each word with its following space. */
export function wordDeltas(text: string): string[] {
  return text.match(/\S+\s*/g) ?? []
}
