/**
 * How long a streamed body takes to write itself onto the card.
 *
 * Short posts need enough time to be seen arriving; a 2,900-character
 * newsletter cannot take 2,900 × 6ms. The floor is 180ms so a one-line
 * draft does not flash; the ceiling is 800ms so a long version still
 * lands inside one glance.
 */
export function revealDuration(length: number): number {
  if (length <= 0) return 0
  return Math.min(800, Math.max(length * 6, 180))
}
