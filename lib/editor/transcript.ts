import { createIdGenerator } from "ai"

import { FILLERS, isKnownFiller, normaliseWord, SOUND_FILLERS } from "./fillers"
import { mergeRanges, secondsToUs, us, type Us, type UsRange } from "./time"

const newTokenId = createIdGenerator({ prefix: "tk", size: 12 })

/**
 * The transcript, and the two things the first cut is made of.
 *
 * Silence removal and word-by-word captions both come from one Deepgram call
 * and nothing else — no vision model, no audio analysis in the common path.
 * That is why the edit lands in a couple hundred milliseconds: by the time the
 * prompt is sent, the expensive work already happened during upload.
 */

/** Provider-shaped word. Deepgram returns seconds; we convert at the door. */
export type TranscriptWord = {
  word: string
  /** Deepgram's cleaned-up form. Falls back to `word` when absent. */
  punctuated_word?: string
  start: number
  end: number
  confidence?: number
  speaker?: number
}

export type Word = {
  text: string
  startUs: Us
  endUs: Us
  confidence: number
  speaker?: number
}

/**
 * Pull the word list out of a Deepgram response.
 *
 * Words live under the first alternative of the first channel. Reading them
 * here rather than at each call site means the provider's shape is known in one
 * place, which is the whole reason the raw response is stored verbatim.
 */
export function wordsFromDeepgram(response: unknown): Word[] {
  const alternative = (
    response as {
      results?: {
        channels?: { alternatives?: { words?: TranscriptWord[] }[] }[]
      }
    }
  )?.results?.channels?.[0]?.alternatives?.[0]

  if (!alternative?.words) return []

  return alternative.words.map((word) => ({
    text: word.punctuated_word ?? word.word,
    startUs: secondsToUs(word.start),
    endUs: secondsToUs(word.end),
    confidence: word.confidence ?? 1,
    speaker: word.speaker,
  }))
}

export type SilenceOptions = {
  /** Gaps shorter than this are natural speech rhythm and stay. */
  minSilenceUs: Us
  /**
   * Silence left at each end of a cut.
   *
   * The difference between a tightened edit and a robotic one. Cutting on the
   * exact word boundary clips the breath before the next word and the release
   * of the last, which is the artefact people describe as "jump cut voice".
   * Descript's patents describe the same problem and solve it by pulling cut
   * points toward quiet rather than sitting on the timestamp.
   */
  paddingUs: Us
  /** Leading silence before the first word is dead air, not rhythm. */
  trimHead: boolean
  trimTail: boolean
}

/** The shortest pause a tighten may cut; below it the cut is audible clipping. */
export const MIN_SILENCE_US = us(250_000)

export const DEFAULT_SILENCE: SilenceOptions = {
  // 350ms is roughly where a pause stops reading as emphasis and starts
  // reading as dead air. Below 250ms tightening becomes audible as clipping.
  minSilenceUs: us(350_000),
  paddingUs: us(120_000),
  trimHead: true,
  trimTail: true,
}

/**
 * Source ranges to remove, from the gaps between words.
 *
 * Returns nothing when there are no words: an asset with no speech is music or
 * b-roll, and "remove the silence" from it means removing all of it. Failing
 * closed here is the difference between a no-op and an empty timeline.
 */
export function detectSilences(
  words: Word[],
  duration: Us,
  options: SilenceOptions = DEFAULT_SILENCE
): UsRange[] {
  if (words.length === 0) return []

  const { trimHead, trimTail } = options
  // Clamped here as well as in the agent's tool schema, because this is the
  // function every caller reaches. A negative padding moves each cut past the
  // pause and into the words on either side, and a tiny minimum treats the
  // gap between two words as a pause: either one turns "remove the silences",
  // which the gate lets through unasked, into a tool that removes speech.
  const minSilenceUs = Math.max(MIN_SILENCE_US, options.minSilenceUs)
  const paddingUs = Math.max(0, options.paddingUs)
  const ranges: UsRange[] = []

  if (trimHead && words[0].startUs > minSilenceUs) {
    ranges.push({
      startUs: us(0),
      endUs: us(Math.max(0, words[0].startUs - paddingUs)),
    })
  }

  for (let i = 0; i < words.length - 1; i++) {
    const gapStart = words[i].endUs
    const gapEnd = words[i + 1].startUs
    if (gapEnd - gapStart <= minSilenceUs) continue

    const start = us(gapStart + paddingUs)
    const end = us(gapEnd - paddingUs)
    // Padding can swallow the gap entirely on a borderline pause. Dropping it
    // is right: what is left is shorter than the padding we promised to keep.
    if (end > start) ranges.push({ startUs: start, endUs: end })
  }

  const lastWord = words[words.length - 1]
  if (trimTail && duration - lastWord.endUs > minSilenceUs) {
    ranges.push({
      startUs: us(Math.min(duration, lastWord.endUs + paddingUs)),
      endUs: duration,
    })
  }

  return mergeRanges(ranges)
}

/**
 * Filler words, as source ranges, including the pause each one sits in.
 *
 * Separate from silence detection because they are separate decisions: a talk
 * can want tightening without having its "you know"s removed, and removing
 * fillers without tightening leaves the pauses they occupied.
 */
export function detectFillers(
  words: Word[],
  fillers: readonly string[] = DEFAULT_FILLERS
): UsRange[] {
  const set = new Set(fillers.map((filler) => filler.toLowerCase()))

  return mergeRanges(
    words
      .filter((word) => set.has(normaliseWord(word.text)))
      .map((word) => ({ startUs: word.startUs, endUs: word.endUs }))
  )
}

/** Norwegian and English, because the recordings are both (fillers.ts). */
export const DEFAULT_FILLERS = FILLERS

/**
 * Breath left either side of a filler cut, at most.
 *
 * Small on purpose: an "um" sits close to the words around it, and the
 * padding is only there so the cut does not land on the very edge of the
 * sound. It is always clamped (see `fillerCuts`), so it never reaches a
 * neighbour.
 */
export const FILLER_PADDING_US = us(60_000)

export type FillerCutOptions = {
  /**
   * Words to cut besides the sounds (fillers.ts `WORD_FILLERS`). Anything
   * not on the filler lists is dropped here, whatever the caller passes: this
   * is the function every caller reaches, and a tool that cut any word it was
   * handed would be a delete the gate never measured.
   */
  include?: readonly string[]
  paddingUs?: Us
  /** A gap this long beside a filler is a pause, and goes with it. */
  pause?: Pick<SilenceOptions, "minSilenceUs" | "paddingUs">
}

/** One cut: the source range, and the filler words it removes. */
export type FillerCut = { range: UsRange; fillers: Word[] }

/**
 * Standalone fillers as source ranges to cut, safely.
 *
 * - A cut covers the filler's own span plus padding, and the padding stops
 *   at the middle of the gap to the next word on either side, so it never
 *   reaches a neighbour's span.
 * - A gap beside the filler long enough to be a pause goes with it, cut to
 *   where `remove_silences` would cut it (the pause's padding kept next to
 *   the neighbour). Cutting the "um" and leaving the pause either side of it
 *   would leave two pauses joined, which plays as a longer one.
 * - Cuts that touch become one, so two fillers in a row leave no sliver.
 * - A filler whose span overlaps a word that is not a filler is left alone:
 *   the timings disagree about where the speech is, and the cut must not
 *   guess.
 * - No words, no cuts.
 */
export function fillerCuts(
  words: Word[],
  durationUs: Us,
  options: FillerCutOptions = {}
): FillerCut[] {
  if (words.length === 0) return []

  const wanted = new Set<string>([
    ...SOUND_FILLERS,
    ...(options.include ?? []).filter(isKnownFiller).map(normaliseWord),
  ])
  const isCut = (word: Word) => wanted.has(normaliseWord(word.text))
  const isAnyFiller = (word: Word) => isKnownFiller(word.text)
  const padding = Math.max(0, options.paddingUs ?? FILLER_PADDING_US)
  const pause = options.pause ?? DEFAULT_SILENCE
  const minPauseUs = Math.max(MIN_SILENCE_US, pause.minSilenceUs)
  const pausePadding = Math.max(0, pause.paddingUs)

  const cuts: FillerCut[] = []

  words.forEach((word, index) => {
    if (!isCut(word)) return
    const overlapsSpeech = words.some(
      (other, at) =>
        at !== index &&
        !isAnyFiller(other) &&
        other.startUs < word.endUs &&
        other.endUs > word.startUs
    )
    if (overlapsSpeech) return

    const before = words[index - 1]
    const after = words[index + 1]

    // The left edge: padding, held to the middle of the gap, or the pause
    // swallowed up to its own padding when the gap is a pause.
    const leftEdge = before ? before.endUs : 0
    const leftGap = word.startUs - leftEdge
    let startUs: number
    if (leftGap > minPauseUs) {
      startUs = before ? leftEdge + pausePadding : 0
    } else {
      const limit = before ? leftEdge + Math.max(0, leftGap) / 2 : 0
      startUs = Math.max(word.startUs - padding, limit)
    }

    const rightEdge = after ? after.startUs : durationUs
    const rightGap = rightEdge - word.endUs
    let endUs: number
    if (rightGap > minPauseUs) {
      endUs = after ? rightEdge - pausePadding : durationUs
    } else {
      const limit = after ? rightEdge - Math.max(0, rightGap) / 2 : durationUs
      endUs = Math.min(word.endUs + padding, limit)
    }

    startUs = Math.min(startUs, word.startUs)
    endUs = Math.max(endUs, word.endUs)
    cuts.push({
      range: { startUs: us(Math.round(startUs)), endUs: us(Math.round(endUs)) },
      fillers: [word],
    })
  })

  // Touching cuts become one: both padded to the same midpoint, they meet.
  const merged: FillerCut[] = []
  for (const cut of cuts) {
    const last = merged.at(-1)
    if (last && cut.range.startUs <= last.range.endUs) {
      last.range = {
        startUs: last.range.startUs,
        endUs: us(Math.max(last.range.endUs, cut.range.endUs)),
      }
      last.fillers.push(...cut.fillers)
    } else {
      merged.push({ range: { ...cut.range }, fillers: [...cut.fillers] })
    }
  }
  return merged
}

/**
 * Refine cut boundaries toward the quietest instant nearby.
 *
 * Word timestamps mark where a word was recognised, not where the sound
 * stopped. Given the audio peaks the ingest already computes for the timeline
 * waveform, a boundary can be nudged to the local minimum inside a small
 * window, which is what stops a tightened cut sounding clipped.
 *
 * Peaks are optional throughout. Without them the padded boundaries stand,
 * which is good enough to ship and audibly worse than with them.
 */
export function snapToQuiet(
  ranges: UsRange[],
  peaks: AudioPeaks,
  windowUs: Us = us(80_000)
): UsRange[] {
  if (peaks.values.length === 0) return ranges

  return ranges.map((range) => ({
    startUs: quietestNear(range.startUs, peaks, windowUs),
    endUs: quietestNear(range.endUs, peaks, windowUs),
  }))
}

/**
 * Audio energy sampled at a fixed interval. The timeline draws the waveform
 * from exactly this, so the cut refinement costs nothing extra to compute.
 */
export type AudioPeaks = {
  /** Microseconds covered by each sample. */
  intervalUs: Us
  /** Normalised 0..1 energy per interval. */
  values: number[]
}

function quietestNear(instant: Us, peaks: AudioPeaks, windowUs: Us): Us {
  const first = Math.max(0, Math.floor((instant - windowUs) / peaks.intervalUs))
  const last = Math.min(
    peaks.values.length - 1,
    Math.ceil((instant + windowUs) / peaks.intervalUs)
  )

  let bestIndex = Math.min(
    peaks.values.length - 1,
    Math.max(0, Math.round(instant / peaks.intervalUs))
  )
  let bestValue = peaks.values[bestIndex] ?? 1

  for (let i = first; i <= last; i++) {
    if (peaks.values[i] < bestValue) {
      bestValue = peaks.values[i]
      bestIndex = i
    }
  }

  return us(bestIndex * peaks.intervalUs)
}

/**
 * Group words into caption segments.
 *
 * `wordsPerSegment: 1` gives the word-by-word look, which is the default and
 * the one worth having. Grouping is also broken at a long pause regardless of
 * count, so a segment never spans a sentence boundary — a caption that holds
 * two words either side of a two second gap reads as a mistake.
 */
export function groupIntoSegments(
  words: Word[],
  wordsPerSegment: number,
  maxGapUs: Us = us(600_000)
): Word[][] {
  if (words.length === 0) return []

  const segments: Word[][] = []
  let current: Word[] = [words[0]]

  for (const word of words.slice(1)) {
    const previous = current[current.length - 1]
    const tooLong = current.length >= Math.max(1, wordsPerSegment)
    const gapped = word.startUs - previous.endUs > maxGapUs

    if (tooLong || gapped) {
      segments.push(current)
      current = [word]
    } else {
      current.push(word)
    }
  }

  segments.push(current)
  return segments
}

export type CaptionTokenSeed = {
  id: string
  text: string
  startUs: Us
  endUs: Us
  sourceMediaId: string
  sourceElementId: string
  sourceStartUs: Us
  sourceEndUs: Us
}

/**
 * Caption segments in **source** time, ready to be placed against the spine.
 *
 * Deliberately not positioned on the timeline. Captions are built once from the
 * transcript, then `remapCaptions` puts them where the current cut says they
 * go. Building them already positioned would mean rebuilding after every edit,
 * and the two would drift the first time a rebuild was skipped.
 */
export function buildCaptionSeeds(
  words: Word[],
  options: {
    mediaId: string
    elementId: string
    wordsPerSegment?: number
  }
): { tokens: CaptionTokenSeed[]; startUs: Us; endUs: Us }[] {
  const segments = groupIntoSegments(words, options.wordsPerSegment ?? 1)

  return segments.map((segment) => {
    const startUs = segment[0].startUs
    const endUs = segment[segment.length - 1].endUs

    return {
      startUs,
      endUs,
      tokens: segment.map((word) => ({
        id: newTokenId(),
        text: word.text,
        // Element-relative, matching CaptionToken. The absolute position is
        // the element's job, and storing it twice invites disagreement.
        startUs: us(word.startUs - startUs),
        endUs: us(word.endUs - startUs),
        sourceMediaId: options.mediaId,
        sourceElementId: options.elementId,
        sourceStartUs: word.startUs,
        sourceEndUs: word.endUs,
      })),
    }
  })
}

/** Plain text, for anything that wants to read the talk rather than cut it. */
export function transcriptText(words: Word[]): string {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim()
}
