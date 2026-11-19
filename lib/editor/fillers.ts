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
