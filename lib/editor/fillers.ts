/**
 * Filler words, per language.
 *
 * A filler is a whole spoken word, never part of one: "um" is a filler and
 * "umbrella" is not, and a punctuated "Um," is still "um". The lists hold
 * only sounds that are never anything else. "like" and "så" are out on
 * purpose: they are fillers some of the time and real words the rest, and
 * cutting or counting them would cut "I like it" into "I it".
 *
 * The recordings are English and Norwegian, so those are the two lists. A
 * word in either counts whatever the take's language is, because people
 * switch mid-sentence and the transcript does not say which one they used.
 */
export const FILLERS_BY_LANGUAGE = {
  en: ["um", "umm", "uh", "uhm", "erm", "ehm", "eh", "hmm"],
  no: ["øh", "øhm", "æh", "ehm", "eh", "liksom", "altså"],
} as const

export type FillerLanguage = keyof typeof FILLERS_BY_LANGUAGE

/** Every filler in every language, once. */
export const FILLERS: readonly string[] = Array.from(
  new Set(Object.values(FILLERS_BY_LANGUAGE).flat())
)

const FILLER_SET = new Set(FILLERS)

/**
 * The fillers `remove_fillers` cuts without being told which: sounds only.
 *
 * "liksom" and "altså" are on the counting lists because they are fillers
 * often enough to be worth noticing, but they are real words the rest of the
 * time, the same as "like" and "så" above: "det var liksom ikke planen" and
 * "altså, vi må" lose meaning when the word goes. Counting a real word by
 * mistake costs a wrong number in "What I noticed"; cutting one costs a
 * sentence that no longer says what was said, in the person's own voice. So
 * the cut takes the sounds by default and the words only when asked.
 */
export const SOUND_FILLERS = [
  "um",
  "umm",
  "uh",
  "uhm",
  "erm",
  "ehm",
  "eh",
  "hmm",
  "øh",
  "øhm",
  "æh",
] as const

const SOUND_SET: ReadonlySet<string> = new Set(SOUND_FILLERS)

/**
 * The fillers that are also words: cut only when the request names them.
 * Every filler that is not a sound, so the two lists cover the counting list
 * between them and a word added to it lands on one side or the other.
 */
export const WORD_FILLERS = FILLERS.filter((word) => !SOUND_SET.has(word))

/** Whether a spoken word, as transcribed, is a filler the cut takes unasked. */
export function isSoundFiller(text: string): boolean {
  return soundFillerForm(text) !== null
}

/**
 * Sounds a transcriber spells drawn out: "ummm", "øhhh", "hmmmm", "mmm".
 * Squeezed to one letter per run, they land on one of these. Only a word that
 * was actually drawn out (it got shorter when squeezed) is matched this way,
 * so "er" ("is" in Norwegian) never becomes a filler by squeezing "err".
 */
const DRAWN_OUT: ReadonlySet<string> = new Set([
  "um",
  "uh",
  "uhm",
  "hm",
  "m",
  "mh",
  "erm",
  "ehm",
  "eh",
  "øh",
  "øhm",
  "æh",
  "æhm",
])

/**
 * The listed sound a spoken word is, drawn out or not: "Ummm," is "um" and
 * "øhhh" is "øh". Null for anything that is not a filler sound. Receipts
 * count by this form, so "um" and "ummm" are one line, not two.
 */
export function soundFillerForm(text: string): string | null {
  const word = normaliseWord(text)
  if (SOUND_SET.has(word)) return word
  const squeezed = word.replace(/(\p{L})\1+/gu, "$1")
  if (squeezed.length === word.length || !DRAWN_OUT.has(squeezed)) return null
  if (squeezed === "m" || squeezed === "mh" || squeezed === "hm") return "hmm"
  return squeezed
}

/** Whether a word, normalised, is on the counting lists at all. */
export function isKnownFiller(word: string): boolean {
  return FILLER_SET.has(normaliseWord(word))
}

/**
 * A spoken word as it compares: lower case, with the punctuation Deepgram
 * attaches ("Um," and "liksom.") taken off.
 */
export function normaliseWord(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}

/** Whether a spoken word, as transcribed, is a filler on its own. */
export function isFiller(text: string): boolean {
  return FILLER_SET.has(normaliseWord(text))
}

/**
 * The receipt line for a filler cut: "Removed 7 fillers: 4 × øh, 3 × um ·
 * 2.1 s". The owner asked for the words by name, so the person can see the
 * cut took sounds and not speech. Most frequent first, then by the alphabet,
 * so the same cut always reads the same. `savedUs` is what the cut got
 * shorter by, pauses that went with a filler included.
 */
export function fillerReceipt(
  removed: readonly string[],
  savedUs: number
): string {
  const counts = new Map<string, number>()
  for (const text of removed) {
    const word = soundFillerForm(text) ?? normaliseWord(text)
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const named = [...counts]
    .sort((a, b) => b[1] - a[1] || byCodePoint(a[0], b[0]))
    .map(([word, count]) => (count === 1 ? word : `${count} × ${word}`))
    .join(", ")
  const seconds = (Math.max(0, savedUs) / 1_000_000).toFixed(1)
  const noun = removed.length === 1 ? "filler" : "fillers"
  return `Removed ${removed.length} ${noun}: ${named} · ${seconds} s`
}

/** The receipt line at the head of a `remove_fillers` output, if it has one. */
export function fillerReceiptOf(output: unknown): string | null {
  if (typeof output !== "string") return null
  const first = output.split("\n", 1)[0]
  return /^Removed \d+ fillers?: .+ · \d+\.\d s$/.test(first) ? first : null
}

/**
 * Word order by code point, the same on every machine. `localeCompare`
 * follows the host's locale, so "øh" sorts before "um" on one and after it
 * on another, and a receipt would read differently in CI than on a laptop.
 */
export function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
