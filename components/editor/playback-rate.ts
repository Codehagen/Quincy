/**
 * Preview speed. Watching a take back at 1.5× is how a long one gets reviewed
 * at all; 0.5× is how a cut that clips a word gets heard. The rate is the
 * preview's only — the document, the export and every time on screen stay in
 * real time.
 */
export const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const

export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

/** One step slower (-1) or faster (+1), held at the ends. */
export function stepRate(rate: number, direction: -1 | 1): PlaybackRate {
  const at = PLAYBACK_RATES.findIndex((value) => value >= rate)
  const index = at === -1 ? PLAYBACK_RATES.length - 1 : at
  const next = Math.min(
    PLAYBACK_RATES.length - 1,
    Math.max(0, index + direction)
  )
  return PLAYBACK_RATES[next]
}

/** The next rate round, for a button that cycles. */
export function cycleRate(rate: number): PlaybackRate {
  const index = PLAYBACK_RATES.findIndex((value) => value === rate)
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]
}

export function rateLabel(rate: number): string {
  return `${rate}×`
}
