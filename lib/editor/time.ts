/**
 * Time in the editor is an integer count of microseconds. Never a float.
 *
 * Every browser editor that stores seconds as a float eventually ships the same
 * bug: a cut lands one frame late. `0.1 + 0.2` is `0.30000000000000004`, and a
 * timeline is thousands of those additions stacked — trim, ripple, re-ripple.
 * The error is invisible for a minute of footage and lands on the wrong side of
 * a frame boundary somewhere in a long podcast cut. Integers cannot drift, so
 * the class of bug is designed out rather than tested for.
 *
 * Microseconds specifically, because it divides every frame rate we care about
 * closely enough (1/30s is 33333.33µs, so a frame is never more than a third of
 * a microsecond off) and Number.MAX_SAFE_INTEGER of them is 285 years. No
 * BigInt, no rational-number type, and it still serialises as plain JSON.
 *
 * Reference frames stay a *derived* value. Assets arrive at 24, 25, 30, 60 and
 * 29.97fps; the project renders at one rate. Storing frame numbers would mean
 * re-deriving on every mixed-rate import, which is the same drift with extra
 * steps.
 */

export const US_PER_SECOND = 1_000_000

/** Seconds from an external source (ffprobe, Deepgram) into our unit. */
export function secondsToUs(seconds: number): Us {
  return us(seconds * US_PER_SECOND)
}

export function usToSeconds(value: Us): number {
  return value / US_PER_SECOND
}

/**
 * Branded so a raw number cannot be passed where a duration is expected.
 * The brand costs nothing at runtime and catches the one mistake that matters:
 * handing seconds to something that wants microseconds, which is a 10^6 error
 * that looks fine in a type checker without it.
 */
export type Us = number & { readonly __brand: "microseconds" }

export function us(value: number): Us {
  return Math.round(value) as Us
}

/**
 * Frame index containing this instant, at the given rate.
 *
 * Floors rather than rounds: a playhead at 33333µs with 30fps is *inside*
 * frame 0, not approaching frame 1. Rounding here would make a scrub display
 * jump to the next frame halfway through the current one.
 */
export function usToFrame(value: Us, fps: number): number {
  return Math.floor((value * fps) / US_PER_SECOND)
}

/** First instant of a frame. The inverse of usToFrame at frame boundaries. */
export function frameToUs(frame: number, fps: number): Us {
  return us((frame * US_PER_SECOND) / fps)
}

/**
 * Snap to the nearest frame boundary.
 *
 * Used when a value reaches us from something that does not think in frames —
 * a drag in the timeline, or a word timestamp from Deepgram. Video can only cut
 * on a frame, so storing 2.32001s when the frame is at 2.3333s means the
 * renderer and the timeline disagree about which frame is showing.
 *
 * Audio-only edits deliberately skip this. Audio has no frames, and quantising
 * a caption token to 33ms would be audible as a late word.
 */
export function snapToFrame(value: Us, fps: number): Us {
  return frameToUs(Math.round((value * fps) / US_PER_SECOND), fps)
}

/** Duration of one frame. Handy as a nudge unit and as an epsilon. */
export function frameDurationUs(fps: number): Us {
  return us(US_PER_SECOND / fps)
}

/**
 * Timecode for the UI. Drops the hour when there isn't one, because a 40 second
 * vertical cut reading `00:00:12.400` wastes the width that the clip label
 * needs, and every timeline in the product is short-form first.
 */
export function formatTimecode(
  value: Us,
  options?: { hours?: boolean }
): string {
  const negative = value < 0
  const total = Math.abs(value)

  const totalSeconds = Math.floor(total / US_PER_SECOND)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const millis = Math.floor((total % US_PER_SECOND) / 1000)

  const pad = (n: number, width = 2) => String(n).padStart(width, "0")
  const body = `${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`
  const withHours = options?.hours ?? hours > 0

  return `${negative ? "-" : ""}${withHours ? `${pad(hours)}:` : ""}${body}`
}

/** Half-open range. The end instant belongs to whatever comes next. */
export type UsRange = { startUs: Us; endUs: Us }

export function rangeDuration(range: UsRange): Us {
  return us(range.endUs - range.startUs)
}

/**
 * Half-open overlap, so two clips that merely touch do not count as
 * overlapping. Without that, a gapless track reads as one long collision and
 * every clip lights up as a conflict.
 */
export function rangesOverlap(a: UsRange, b: UsRange): boolean {
  return a.startUs < b.endUs && b.startUs < a.endUs
}

export function rangeContains(range: UsRange, instant: Us): boolean {
  return instant >= range.startUs && instant < range.endUs
}

/**
 * Merge touching or overlapping ranges into the smallest set covering the same
 * instants. Silence detection emits one range per gap and adjacent gaps are
 * common — two pauses either side of a filler word, once the word is dropped.
 * Cutting them separately would leave a frame of audio marooned between them.
 */
export function mergeRanges(ranges: UsRange[]): UsRange[] {
  if (ranges.length === 0) return []

  const sorted = [...ranges].sort((a, b) => a.startUs - b.startUs)
  const merged: UsRange[] = [{ ...sorted[0] }]

  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1]
    if (range.startUs <= last.endUs) {
      last.endUs = us(Math.max(last.endUs, range.endUs))
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

/**
 * The complement of `ranges` within `within` — what survives after the cuts.
 *
 * Silence removal is expressed as "these ranges go"; the timeline needs "these
 * ranges stay". Deriving the keeps rather than storing them means the two can
 * never disagree.
 */
export function invertRanges(ranges: UsRange[], within: UsRange): UsRange[] {
  const merged = mergeRanges(ranges)
  const keeps: UsRange[] = []
  let cursor = within.startUs

  for (const range of merged) {
    if (range.endUs <= within.startUs) continue
    if (range.startUs >= within.endUs) break

    const start = us(Math.max(range.startUs, within.startUs))
    if (start > cursor) keeps.push({ startUs: cursor, endUs: start })
    cursor = us(Math.max(cursor, Math.min(range.endUs, within.endUs)))
  }

  if (cursor < within.endUs)
    keeps.push({ startUs: cursor, endUs: within.endUs })

  return keeps
}
