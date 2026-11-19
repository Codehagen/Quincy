import { isSoundFiller, normaliseWord, soundFillerForm } from "./fillers"
import {
  DEFAULT_SILENCE,
  FILLER_PADDING_US,
  MIN_SILENCE_US,
  paddedCut,
  type Word,
} from "./transcript"
import { mergeRanges, type Us, type UsRange } from "./time"

/**
 * The ways speech trips over itself, found in a timed transcript.
 *
 * Filler sounds were the first kind Quincy could cut. A take has three more
 * that cost the same seconds and read as worse on screen:
 *
 * - **repetition**: "we we shipped", "I think I think it works"
 * - **false start**: "we should, um, we need to", "the bug- the bug report"
 * - **discourse**: "it was, like, huge", "det var, liksom, rart"
 *
 * All of it is rules over words, timings and punctuation: no model, no audio
 * analysis, nothing bought. That is also what makes it explainable — every
 * result names its kind and its words, and the receipt says which went.
 *
 * Each word belongs to at most one result. Where two readings overlap, the
 * hesitation wins, then repetition, then false start, then discourse: the
 * more certain the reading, the earlier it claims its words.
 */

export type DisfluencyKind =
  "hesitation" | "repetition" | "false_start" | "discourse"

export const DISFLUENCY_KINDS: readonly DisfluencyKind[] = [
  "hesitation",
  "repetition",
  "false_start",
  "discourse",
]

export type Disfluency = {
  kind: DisfluencyKind
  /** Index of the first word removed. */
  from: number
  /** Index of the last word removed, inclusive. */
  to: number
  /** The words removed, as spoken. */
  phrase: string
}

/**
 * Words people double on purpose. "Very very", "nei nei", "had had": a cut
 * there takes the emphasis or the grammar out of what was said. Kept as pairs
 * of the normalised word.
 */
const INTENDED_DOUBLES: ReadonlySet<string> = new Set([
  // English
  "very",
  "really",
  "so",
  "no",
  "yes",
  "bye",
  "had",
  "that",
  "is",
  "go",
  "ha",
  "knock",
  "never",
  "more",
  "now",
  // Norwegian
  "nei",
  "ja",
  "jo",
  "så",
  "veldig",
  "mer",
  "lenge",
  "igjen",
  "bra",
  "fort",
  "ok",
  "okei",
])

/**
 * Phrases that are discourse fillers when set off from the sentence, and real
 * words otherwise. "I like pizza" and "du vet hvordan" stay; "it was, like,
 * huge" and "det var, liksom, rart" lose the middle word. Multi-word phrases
 * are matched as a whole.
 */
const DISCOURSE: readonly string[][] = [
  ["like"],
  ["you", "know"],
  ["i", "mean"],
  ["basically"],
  ["actually"],
  ["literally"],
  ["kind", "of"],
  ["sort", "of"],
  ["liksom"],
  ["altså"],
  ["egentlig"],
  ["ikke", "sant"],
  ["på", "en", "måte"],
  ["du", "vet"],
  ["skjønner", "du"],
  ["sånn"],
]

/** A gap this long beside a phrase sets it off, the way a comma would. */
const SET_OFF_GAP_US = 250_000

/** The longest abandoned clause a false start may be, in words. */
const MAX_FALSE_START_WORDS = 6

/** The longest phrase a repetition may repeat, in words. */
const MAX_REPEAT_WORDS = 3

export function detectDisfluencies(words: Word[]): Disfluency[] {
  const claimed = new Array<boolean>(words.length).fill(false)
  const found: Disfluency[] = []

  const claim = (kind: DisfluencyKind, from: number, to: number) => {
    for (let i = from; i <= to; i++) if (claimed[i]) return false
    for (let i = from; i <= to; i++) claimed[i] = true
    found.push({
      kind,
      from,
      to,
      phrase: words
        .slice(from, to + 1)
        .map((word) => word.text)
        .join(" "),
    })
    return true
  }

  const norm = words.map((word) => normaliseWord(word.text))
  const hesitation = words.map((word) => isSoundFiller(word.text))

  // 1. Hesitations: the sounds, drawn out or not.
  words.forEach((_, index) => {
    if (hesitation[index]) claim("hesitation", index, index)
  })

  // 2. Repetitions. Longest phrase first, so "I think I think" is one result
  //    and not two single-word ones. A hesitation between the two copies may
  //    sit between them ("we, um, we"); it is its own result, and the cuts
  //    meet. The last copy is the one kept.
  for (let size = MAX_REPEAT_WORDS; size >= 1; size--) {
    for (let start = 0; start + size < words.length; start++) {
      const first = spoken(start, size)
      if (!first) continue
      let next = first.end + 1
      while (next < words.length && hesitation[next]) next++
      const second = spoken(next, size)
      if (!second) continue

      const same = first.indexes.every(
        (at, k) => norm[at] === norm[second.indexes[k]]
      )
      if (!same) continue
      if (size === 1 && INTENDED_DOUBLES.has(norm[start])) continue
      // "Done. Done." is two sentences, both meant.
      if (endsSentence(words[first.end].text)) continue
      // Far apart in time is a callback, not a stumble.
      if (words[second.indexes[0]].startUs - words[first.end].endUs > 1_500_000)
        continue

      claim("repetition", start, first.end)
    }
  }

  // 3. False starts.
  words.forEach((word, index) => {
    // A cut-off fragment ("wh-", "komp—") is always one.
    if (/[-—–]$/.test(word.text.trim()) && norm[index].length > 0) {
      claim("false_start", index, index)
    }
  })
  for (let start = 0; start < words.length; start++) {
    if (!opensClause(start)) continue
    for (let length = 1; length <= MAX_FALSE_START_WORDS; length++) {
      const end = start + length - 1
      if (end >= words.length - 1) break
      if (hesitation[end]) break
      // Abandoned: a hesitation, a dash or an ellipsis right after the clause.
      let restart = end + 1
      const trailing = words[end].text.trim()
      const abandonedByMark = /(\.\.\.|…|[-—–])$/.test(trailing)
      let abandonedBySound = false
      while (restart < words.length && hesitation[restart]) {
        abandonedBySound = true
        restart++
      }
      if (!abandonedByMark && !abandonedBySound) continue
      if (restart >= words.length) break
      // The restart opens on the same word and then says something else.
      if (norm[restart] !== norm[start] || norm[start] === "") continue
      const again = norm.slice(restart, restart + length).join(" ")
      const before = norm.slice(start, end + 1).join(" ")
      if (again === before) continue
      // The sounds between are hesitations of their own; the cuts meet.
      if (claim("false_start", start, end)) break
    }
  }

  // 4. Discourse fillers, only when set off from the sentence.
  for (let start = 0; start < words.length; start++) {
    for (const phrase of DISCOURSE) {
      const end = start + phrase.length - 1
      if (end >= words.length) continue
      if (!phrase.every((part, k) => norm[start + k] === part)) continue
      if (!setOff(start, end)) continue
      // A tag question ("…, ikke sant?", "…, you know?") asks the listener
      // something; it is meant, not filler.
      if (/\?$/.test(words[end].text.trim())) continue
      claim("discourse", start, end)
    }
  }

  return found.sort((a, b) => a.from - b.from)

  /** `size` spoken words from `start`, none of them a hesitation. */
  function spoken(start: number, size: number) {
    const indexes: number[] = []
    for (let at = start; at < start + size; at++) {
      if (at >= words.length || hesitation[at] || norm[at] === "") return null
      indexes.push(at)
    }
    return { indexes, end: indexes[indexes.length - 1] }
  }

  /** The take's first word, or one after punctuation, a sound or a pause. */
  function opensClause(index: number) {
    if (index === 0) return true
    const previous = words[index - 1]
    if (hesitation[index - 1]) return true
    if (/[,.;:!?]$/.test(previous.text.trim())) return true
    return words[index].startUs - previous.endUs >= SET_OFF_GAP_US
  }

  function setOff(start: number, end: number) {
    const previous = words[start - 1]
    const next = words[end + 1]
    const left =
      !previous ||
      /[,.;:!?]$/.test(previous.text.trim()) ||
      words[start].startUs - previous.endUs >= SET_OFF_GAP_US
    const right =
      !next ||
      /[,;:]$/.test(words[end].text.trim()) ||
      next.startUs - words[end].endUs >= SET_OFF_GAP_US
    // The sentence's own opening word with nothing setting its far side off
    // is a real word ("Like the last one, …").
    return (
      left && right && Boolean(previous || /,$/.test(words[end].text.trim()))
    )
  }
}

/** Whether a transcribed word closes a sentence. */
function endsSentence(text: string): boolean {
  return /[.!?]$/.test(text.trim())
}

/** What a clean-up may take when nothing narrower was asked for. */
export const DEFAULT_CLEAN_UP: readonly DisfluencyKind[] = [
  "hesitation",
  "repetition",
  "false_start",
]

export type CleanUpCut = { range: UsRange; found: Disfluency[] }

/**
 * The disfluencies of the chosen kinds as source ranges to cut, placed the
 * way a filler cut is (transcript.ts `paddedCut`): padding held to the middle
 * of the gap either side, a pause beside the words going with them, and
 * touching cuts merged into one.
 */
export function cleanUpCuts(
  words: Word[],
  durationUs: Us,
  kinds: readonly DisfluencyKind[] = DEFAULT_CLEAN_UP,
  found: Disfluency[] = detectDisfluencies(words)
): CleanUpCut[] {
  const wanted = new Set(kinds)
  const minPauseUs = Math.max(MIN_SILENCE_US, DEFAULT_SILENCE.minSilenceUs)

  const cuts = found
    .filter((item) => wanted.has(item.kind))
    .map((item) => ({
      range: paddedCut(words, item.from, item.to, durationUs, {
        paddingUs: FILLER_PADDING_US,
        minPauseUs,
        pausePaddingUs: DEFAULT_SILENCE.paddingUs,
      }),
      found: [item],
    }))
    .sort((a, b) => a.range.startUs - b.range.startUs)

  const merged: CleanUpCut[] = []
  for (const cut of cuts) {
    const last = merged.at(-1)
    if (last && cut.range.startUs <= last.range.endUs) {
      last.range = mergeRanges([last.range, cut.range])[0]
      last.found.push(...cut.found)
    } else {
      merged.push({ range: { ...cut.range }, found: [...cut.found] })
    }
  }
  return merged
}

const KIND_WORDS: Record<DisfluencyKind, [string, string]> = {
  hesitation: ["hesitation", "hesitations"],
  repetition: ["repeated word", "repeated words"],
  false_start: ["false start", "false starts"],
  discourse: ["filler phrase", "filler phrases"],
}

/** A disfluency kind in words, singular or plural. */
export function kindLabel(kind: DisfluencyKind, count: number): string {
  return KIND_WORDS[kind][count === 1 ? 0 : 1]
}

/**
 * The receipt line for a clean-up: "Cleaned up 5: 3 repeated words, 2 false
 * starts · 1.8 s". Kinds in the order they are detected, so the same cut
 * always reads the same.
 */
export function cleanUpReceipt(
  found: readonly Disfluency[],
  savedUs: number
): string {
  const counts = DISFLUENCY_KINDS.map(
    (kind) => [kind, found.filter((item) => item.kind === kind).length] as const
  ).filter(([, count]) => count > 0)
  const named = counts
    .map(([kind, count]) => `${count} ${kindLabel(kind, count)}`)
    .join(", ")
  const seconds = (Math.max(0, savedUs) / 1_000_000).toFixed(1)
  return `Cleaned up ${found.length}: ${named} · ${seconds} s`
}

/** The receipt line at the head of a `clean_up_speech` output, if it has one. */
export function cleanUpReceiptOf(output: unknown): string | null {
  if (typeof output !== "string") return null
  const first = output.split("\n", 1)[0]
  return /^Cleaned up \d+: .+ · \d+\.\d s$/.test(first) ? first : null
}

/** The sound a hesitation is, for a receipt that names it ("øh", "um"). */
export function hesitationForm(text: string): string {
  return soundFillerForm(text) ?? normaliseWord(text)
}
