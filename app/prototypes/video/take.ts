/**
 * The one recording every picture on this page shows: a talking head about
 * the onboarding cut (the landing page's story, said to a camera instead of
 * merged). Fixed numbers, so the server and the client agree on every string.
 *
 * The take is 1:58. Ten stretches of speech, 42 seconds of them, with the
 * pauses between. `remove_silences` keeps the speech and closes the gaps
 * (lib/editor/tools.ts), so the cut is the sum of the speech: 0:42.
 */

/** Seconds of speech, in order. */
const SPEECH = [4.2, 4.7, 3.8, 4.6, 4.2, 4.3, 4.3, 3.8, 5.4, 2.7]

/** Seconds of silence before each stretch of speech. */
const PAUSES = [2.0, 4.2, 4.1, 6.3, 6.6, 9.2, 7.0, 11.7, 11.1, 13.8]

export type Segment = {
  /** Where it starts in the raw take, in seconds. */
  at: number
  /** Where it starts after the pauses are cut. */
  cutAt: number
  length: number
  /** The silence before it, in seconds. */
  pause: number
}

export const SEGMENTS: Segment[] = (() => {
  let at = 0
  let cutAt = 0
  return SPEECH.map((length, i) => {
    at += PAUSES[i]
    const segment = { at, cutAt, length, pause: PAUSES[i] }
    at += length
    cutAt += length
    return segment
  })
})()

export const RAW_SECONDS = SEGMENTS.reduce((s, x) => s + x.pause + x.length, 0)
export const CUT_SECONDS = SPEECH.reduce((s, x) => s + x, 0)
export const PAUSES_CUT = PAUSES.length

/** 118 → "1:58". */
export function clock(seconds: number) {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** The words of each stretch, as the caption lane shows them. */
export const LINES = [
  "So we cut onboarding",
  "from nine screens to three.",
  "Six questions, gone.",
  "Sixty-eight percent",
  "finish signup now.",
  "It was forty-one.",
  "Every screen we cut",
  "was a question",
  "we never needed to ask.",
  "That’s the update.",
]

export const SOURCE = "take-03.mov"

/** The prompt, in the person's words. */
export const PROMPT = "Cut the pauses, add captions, and punch in when I say sixty-eight."

/**
 * Deterministic jitter for waveform bars. Math.random would disagree between
 * the server and the client render.
 */
export function jitter(seed: number) {
  return (((Math.sin(seed * 12.9898) * 43758.5453) % 1) + 1) % 1
}
