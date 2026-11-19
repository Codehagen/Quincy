import { isFiller, normaliseWord } from "./fillers"
import type { Word } from "./transcript"

/**
 * The reading of the take: what Quincy noticed, from the transcript alone.
 *
 * No model call. Every number here is counted from the words and their
 * timings, which the ingest already paid for, so the margin can open on
 * "What I noticed" the moment the cut opens and the starters under it can
 * say why each is worth pressing. A starter whose reason would be empty is
 * not offered: no pauses, no "Tighten".
 *
 * Computed where the cut page resolves the project, not stored: it is a few
 * loops over a word list the page already loaded, and a stored copy would be
 * one more thing to migrate and to keep in step with the transcript.
 */

/** A pause shorter than this is speech rhythm; longer is dead air. */
export const PAUSE_MIN_US = 1_000_000

export type TakeReading = {
  durationUs: number
  words: number
  speakers: number
  /** Gaps between words longer than a second. */
  pauses: { count: number; totalUs: number }
  /** Standalone filler words (fillers.ts), counted per normalised word. */
  fillers: { count: number; byWord: Record<string, number> }
  /** The first spoken sentence, fillers left out; null on a silent take. */
  firstLine: string | null
  /**
   * The strong line to push in on: one sentence of the take, chosen once
   * per asset by a cheap model (lib/editor/strong-line.ts) and kept beside
   * the transcript. Null until it has been chosen, or when it could not be.
   */
  strongLine: string | null
}

/**
 * Where the strong line is kept: a key on the stored transcript, so it lives
 * and goes with the words it was chosen from (a new transcript drops it).
 * `pending` is the claim that makes the call at most once per asset.
 */
export const STRONG_LINE_KEY = "quincy_strong_line"

export type StrongLineSlot =
  | { state: "pending" }
  | { state: "done"; line: string }
  | { state: "failed" }

/** The slot on a stored transcript; undefined when nothing has asked yet. */
export function strongLineSlot(transcript: unknown): StrongLineSlot | undefined {
  if (typeof transcript !== "object" || transcript === null) return undefined
  const slot = (transcript as Record<string, unknown>)[STRONG_LINE_KEY]
  if (typeof slot !== "object" || slot === null) return undefined
  const state = (slot as { state?: unknown }).state
  const line = (slot as { line?: unknown }).line
  if (state === "done" && typeof line === "string" && line) return { state, line }
  if (state === "pending" || state === "failed") return { state }
  return undefined
}

export function readTake(
  words: Word[],
  durationUs: number,
  strongLine: string | null = null
): TakeReading {
  const speakers = new Set<number>()
  const byWord: Record<string, number> = {}
  let fillerCount = 0
  let pauseCount = 0
  let pauseTotalUs = 0

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (word.speaker !== undefined) speakers.add(word.speaker)

    if (isFiller(word.text)) {
      const key = normaliseWord(word.text)
      byWord[key] = (byWord[key] ?? 0) + 1
      fillerCount++
    }

    const next = words[i + 1]
    if (next) {
      const gap = next.startUs - word.endUs
      if (gap > PAUSE_MIN_US) {
        pauseCount++
        pauseTotalUs += gap
      }
    }
  }

  return {
    durationUs,
    words: words.length,
    // A transcript without diarisation is one voice, not none.
    speakers: words.length === 0 ? 0 : Math.max(1, speakers.size),
    pauses: { count: pauseCount, totalUs: pauseTotalUs },
    fillers: { count: fillerCount, byWord },
    firstLine: firstSentence(words),
    strongLine,
  }
}

function firstSentence(words: Word[]): string | null {
  const kept: string[] = []
  for (const word of words) {
    if (!isFiller(word.text)) kept.push(word.text.trim())
    if (kept.length > 0 && /[.?!…]["”']?$/.test(word.text.trim())) break
  }
  return kept.length > 0 ? kept.join(" ") : null
}

/** "4.5 s": one decimal, the margin's precision. */
export function formatSeconds(us: number): string {
  return `${(Math.max(0, us) / 1_000_000).toFixed(1)} s`
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** The lines under "What I noticed", in the order they are read. */
export function noticed(reading: TakeReading): string[] {
  const lines: string[] = []

  if (reading.words === 0) {
    lines.push(`${formatSeconds(reading.durationUs)}, and no words in it.`)
    return lines
  }

  const voices =
    reading.speakers === 1 ? "one voice" : plural(reading.speakers, "voice", "voices")
  lines.push(
    `${formatSeconds(reading.durationUs)}, ${plural(reading.words, "word", "words")}, ${voices}.`
  )

  lines.push(
    reading.pauses.count === 0
      ? "No pause runs over a second."
      : `${plural(reading.pauses.count, "pause", "pauses")} over a second, ${formatSeconds(reading.pauses.totalUs)} in all.`
  )

  if (reading.strongLine) {
    lines.push(`The strong line: “${clip(reading.strongLine, 72)}”`)
  }

  if (reading.fillers.count > 0) {
    const named = Object.entries(reading.fillers.byWord)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word, count]) => (count === 1 ? `“${word}”` : `${count} × “${word}”`))
      .join(", ")
    lines.push(`${plural(reading.fillers.count, "filler", "fillers")}: ${named}.`)
  }

  return lines
}

export type Starter = {
  text: string
  /** The tool that does it; a starter whose edits are in the cut is not offered again. */
  tool: string
  /** Why it is worth pressing, from the reading. Never empty. */
  read: string
}

/** The frame, for whether "vertical" is a change at all. */
export type Frame = {
  width: number | null
  height: number | null
  rotation?: number
  /** Whether the cut already carries captions; then "Add captions" is no change. */
  hasCaptions?: boolean
}

/**
 * The starters this take earns, each with its reason. A starter with no
 * reason is left out rather than offered on a generic line.
 */
export function startersFor(reading: TakeReading, frame?: Frame): Starter[] {
  const starters: Starter[] = []

  if (reading.pauses.count > 0) {
    starters.push({
      text: "Tighten the edit",
      tool: "remove_silences",
      read: `${plural(reading.pauses.count, "pause", "pauses")} over a second, ${formatSeconds(reading.pauses.totalUs)}`,
    })
  }

  if (reading.words > 0 && !frame?.hasCaptions) {
    starters.push({
      text: "Add captions",
      tool: "add_captions",
      read: `${plural(reading.words, "word", "words")}, timed to the voice`,
    })
  }

  const landscape = isLandscape(frame)
  if (landscape) {
    starters.push({
      text: "Make it vertical",
      tool: "reframe",
      read: "Shot wide; Reels and TikTok want 9:16",
    })
  }

  if (reading.strongLine) {
    starters.push({
      text: `Push in on “${clip(reading.strongLine, 40)}”`,
      tool: "punch_in",
      read: "The strong line of the take",
    })
  } else if (reading.firstLine) {
    starters.push({
      text: "Push in on the first line",
      tool: "punch_in",
      read: `“${clip(reading.firstLine, 48)}”`,
    })
  }

  return starters
}

function isLandscape(frame?: Frame): boolean {
  if (!frame?.width || !frame.height) return false
  const turned = frame.rotation === 90 || frame.rotation === 270
  const w = turned ? frame.height : frame.width
  const h = turned ? frame.width : frame.height
  return w > h
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
