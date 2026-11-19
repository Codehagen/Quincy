/**
 * The arithmetic of recording a take in the browser, kept apart from the
 * component so it can be tested without a camera.
 */

/**
 * The container the recorder writes. MP4 first, because Safari records only
 * that and ffmpeg reads it without a remux; WebM with VP9 and Opus where the
 * browser prefers it. Null when the browser can record neither, which is the
 * one case the recorder says it cannot help with.
 */
const RECORDER_TYPES = [
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const

export function pickRecorderType(
  isSupported: (type: string) => boolean
): string | null {
  return RECORDER_TYPES.find((type) => isSupported(type)) ?? null
}

/** The file a take is uploaded as: named for when it was made, typed for what it is. */
export function takeFileName(type: string, at: Date): string {
  const extension = type.startsWith("video/mp4") ? "mp4" : "webm"
  const stamp = at
    .toISOString()
    .slice(0, 16)
    .replace("T", " ")
    .replace(":", ".")
  return `Take ${stamp}.${extension}`
}

/**
 * Teleprompter speed in pixels a second for a reading pace in words a minute.
 * A line of prompter text holds about `wordsPerLine` words and is
 * `lineHeight` pixels tall, so a pace is lines a second times the line.
 */
export function scrollPixelsPerSecond(
  wordsPerMinute: number,
  fontPx: number,
  wordsPerLine = 7,
  lineHeight = 1.4
): number {
  const linesPerSecond = wordsPerMinute / 60 / wordsPerLine
  return linesPerSecond * fontPx * lineHeight
}

/** RMS level of a byte time-domain frame (128 is silence), from 0 to 1. */
export function levelOf(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) {
    const centred = (sample - 128) / 128
    sum += centred * centred
  }
  return Math.sqrt(sum / samples.length)
}

/** Below this the microphone is, in practice, hearing nothing. */
export const SILENT_LEVEL = 0.01

/** How long the microphone may hear nothing while recording before the take says so. */
export const SILENT_WARNING_MS = 3000

/**
 * Whether to warn that the microphone is silent: quiet the whole time since
 * `quietSinceMs`, for longer than the warning allows.
 */
export function silentTooLong(
  quietSinceMs: number | null,
  nowMs: number
): boolean {
  return quietSinceMs !== null && nowMs - quietSinceMs >= SILENT_WARNING_MS
}
