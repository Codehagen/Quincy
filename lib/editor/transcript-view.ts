import { us, type Us, type UsRange } from "./time"
import type { CaptionElement, Scene } from "./types"

/**
 * The cut as a document you can read.
 *
 * Computed from the caption elements every render rather than stored beside
 * them, for the reason `effect-lane.ts` gives about chips: a second record of
 * the same words is a second thing that can be wrong, and the one the user is
 * reading has to be the one that renders.
 *
 * The words are already bound to their source instants — `CaptionToken` carries
 * `sourceMediaId`, `sourceStartUs` and `sourceEndUs`, and `types.ts` says why:
 * "deleting a word from the transcript is a lookup to the source range and a cut
 * on the timeline, with no search and no guessing". That binding has existed
 * since captions did and nothing has ever read it for editing. This is the read.
 */

export type TranscriptWord = {
  /** The token's id. Unique within the scene, stable across renders. */
  id: string
  captionId: string
  text: string
  /** Scene time, so a click can seek and a selection can become a range. */
  startUs: Us
  endUs: Us
  sourceMediaId: string
  sourceStartUs: Us
  sourceEndUs: Us
  /** Silence before this word, in scene time. Zero on the first word of a line. */
  gapUs: Us
}

export type TranscriptLine = {
  /** The first word's id. Lines are derived, so they have no id of their own. */
  id: string
  startUs: Us
  words: TranscriptWord[]
}

/**
 * A pause long enough to end a line.
 *
 * Four hundred milliseconds, which is about where a breath stops being part of
 * the phrase and starts being a break between two. The document has no sentence
 * structure to group by — `wordsPerSegment: 1` is the default, so there is one
 * caption element per word and the element boundaries say nothing — and the
 * pauses are the only structure the transcript actually carries.
 *
 * Deepgram returns punctuation that would beat this, and taking it would mean
 * storing sentence ends on the token. Worth doing; not worth blocking a surface
 * on, because the grouping is a view and can change without the document moving.
 */
const LINE_BREAK_US = 400_000

/**
 * A ceiling on words per line, for speech that never pauses.
 *
 * Without it a fast talker produces one line the length of the whole cut, and a
 * transcript that does not wrap into readable rows is a wall of text with a
 * single timecode on it.
 */
const MAX_WORDS_PER_LINE = 14

export function transcriptLines(scene: Scene): TranscriptLine[] {
  const words = transcriptWords(scene)
  const lines: TranscriptLine[] = []

  for (const word of words) {
    const current = lines[lines.length - 1]

    const breaks =
      !current ||
      word.gapUs >= LINE_BREAK_US ||
      current.words.length >= MAX_WORDS_PER_LINE

    if (breaks) {
      lines.push({ id: word.id, startUs: word.startUs, words: [word] })
      continue
    }

    current.words.push(word)
  }

  return lines
}

/**
 * Every word in the scene, in the order it is spoken.
 *
 * Flattened across caption elements and sorted by scene time rather than
 * trusting element order, because a caption track holds one element per word at
 * the default `wordsPerSegment` and nothing guarantees the array is in time
 * order after a cut has dropped elements out of the middle of it.
 */
export function transcriptWords(scene: Scene): TranscriptWord[] {
  const words = scene.tracks
    .filter((track) => track.kind === "caption")
    .flatMap((track) =>
      track.elements
        .filter((element): element is CaptionElement => element.kind === "caption")
        .flatMap((caption) =>
          caption.tokens.map((token) => ({
            id: token.id,
            captionId: caption.id,
            text: token.text,
            // Token times are element-relative. Everything downstream — seeking,
            // selecting, punching in — is in scene time, so they are rebased
            // once here rather than at each of those call sites.
            startUs: us(caption.startUs + token.startUs),
            endUs: us(caption.startUs + token.endUs),
            sourceMediaId: token.sourceMediaId,
            sourceStartUs: token.sourceStartUs,
            sourceEndUs: token.sourceEndUs,
            gapUs: us(0),
          }))
        )
    )
    .sort((a, b) => a.startUs - b.startUs || a.id.localeCompare(b.id))

  return words.map((word, index) => {
    if (index === 0) return word

    const previous = words[index - 1]
    // Clamped at zero: two words can overlap by a frame or two after a remap
    // clamped one of them to a cut, and a negative gap would read as a pause.
    return { ...word, gapUs: us(Math.max(0, word.startUs - previous.endUs)) }
  })
}

/**
 * The words between two ids, inclusive, whichever order they were clicked in.
 *
 * Order matters because a drag can go right-to-left, and a selection that only
 * worked forwards would silently do nothing half the time.
 */
export function wordsBetween(
  words: TranscriptWord[],
  fromId: string,
  toId: string
): TranscriptWord[] {
  const from = words.findIndex((word) => word.id === fromId)
  const to = words.findIndex((word) => word.id === toId)
  if (from === -1 || to === -1) return []

  return words.slice(Math.min(from, to), Math.max(from, to) + 1)
}

/** Where a selection sits on the timeline, for seeking and for punching in. */
export function timelineSpan(words: TranscriptWord[]): UsRange | null {
  if (words.length === 0) return null

  return {
    startUs: us(Math.min(...words.map((word) => word.startUs))),
    endUs: us(Math.max(...words.map((word) => word.endUs))),
  }
}

/**
 * What a selection means to the footage, as source ranges per asset.
 *
 * Source time and not timeline time, which is the whole reason the token
 * binding exists: `splitBySourceRanges` says it outright — "ranges are given in
 * source time, not timeline time, because that is what a transcript knows".
 * Handing it timeline ranges would work until the first cut moved something.
 *
 * Grouped by media because a selection can run across two clips of different
 * assets, and each asset's spine elements are cut against its own ranges.
 */
export function sourceRangesFor(
  words: TranscriptWord[]
): { mediaId: string; ranges: UsRange[] }[] {
  const byMedia = new Map<string, UsRange[]>()

  for (const word of words) {
    const ranges = byMedia.get(word.sourceMediaId) ?? []
    ranges.push({ startUs: word.sourceStartUs, endUs: word.sourceEndUs })
    byMedia.set(word.sourceMediaId, ranges)
  }

  return [...byMedia].map(([mediaId, ranges]) => ({
    mediaId,
    ranges: mergeRanges(ranges),
  }))
}

/**
 * Adjacent words joined into one range, and the silence between them with it.
 *
 * Deleting "every day this year" as four separate ranges leaves the three
 * pauses between those words in the cut — three fragments of room tone butted
 * together, which is audible as a stutter where a clean cut should be. Words a
 * person selected as a phrase are one range.
 *
 * `JOIN_US` is what counts as "next to each other". It is deliberately larger
 * than a word gap and smaller than a pause worth keeping: a selection that
 * spans a real silence still cuts around it, so deleting a sentence does not
 * quietly take the beat that followed it.
 */
const JOIN_US = 400_000

function mergeRanges(ranges: UsRange[]): UsRange[] {
  const sorted = [...ranges].sort((a, b) => a.startUs - b.startUs)
  const merged: UsRange[] = []

  for (const range of sorted) {
    const last = merged[merged.length - 1]

    if (last && range.startUs - last.endUs <= JOIN_US) {
      last.endUs = us(Math.max(last.endUs, range.endUs))
      continue
    }

    merged.push({ ...range })
  }

  return merged
}
