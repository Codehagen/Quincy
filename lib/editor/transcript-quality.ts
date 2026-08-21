import type { AudioPeaks, Word } from "./transcript"

/**
 * Whether a transcript is plausible for the audio it came from.
 *
 * This exists because of a failure that had no symptom. Fifteen seconds of
 * Norwegian came back from Deepgram as "Okay. Okay." at 0.975 confidence,
 * because we asked for English and a model asked for English does not refuse
 * another language — it transcribes it as English and sounds sure. Everything
 * downstream believed it: the caption lane got two words, and silence removal
 * correctly cut the take to the 2.3 seconds it was told contained speech.
 *
 * The provider cannot answer this. Deepgram's own `detect_language` reported
 * English on that recording at 0.96 language-confidence, and restricting the
 * candidate list did not change it. Nor does transcription confidence: the
 * wrong-language result scored *higher* (0.975) than the correct one (0.897),
 * which is exactly what a model that found two words it was sure about would
 * report.
 *
 * What does separate them is density. Speech runs 2–3 words per second of
 * voice. The English pass managed 0.4 across five seconds of voiced audio; the
 * Norwegian one managed five. That gap is not subtle and it is measurable from
 * data ingest already has in hand, because the waveform is computed from the
 * same PCM in the same pass.
 */

/**
 * Seconds of audio loud enough to be someone talking.
 *
 * Relative to the recording's own loudest moment, not an absolute level. A
 * phone at arm's length peaks around 0.1, so a fixed threshold would call an
 * ordinary take silent — the same mistake the waveform made when it drew every
 * bar against full scale. The absolute floor is there so that hiss on a track
 * with no speech at all does not read as voice.
 */
export function voicedSeconds(peaks: AudioPeaks): number {
  if (peaks.values.length === 0 || peaks.intervalUs <= 0) return 0

  let loudest = 0
  for (const value of peaks.values) if (value > loudest) loudest = value

  const threshold = Math.max(0.02, loudest * 0.15)
  const voiced = peaks.values.filter((value) => value >= threshold).length

  return (voiced * peaks.intervalUs) / 1_000_000
}

/**
 * Words per second of voice, which is the number that tells the languages
 * apart.
 *
 * Zero voiced seconds returns zero rather than dividing: a track with no voice
 * on it has no density, and `Infinity` would make silence look like the
 * fastest speaker alive.
 */
export function wordDensity(words: Word[], voiced: number): number {
  return voiced > 0 ? words.length / voiced : 0
}

/**
 * Below this, a transcript is not describing the audio it came from.
 *
 * Conversational speech is 2–3 words per second and a slow, deliberate talk is
 * still well over 1. The wrong-language pass scored 0.4. Set low on purpose:
 * this decides whether to spend more API calls, and the cost of a false alarm
 * is a few seconds of ingest while the cost of missing one is a transcript
 * everything downstream trusts.
 */
export const DENSITY_FLOOR = 0.8

/**
 * Enough voice to judge by. Under this the density figure is noise — one word
 * either way swings it — so a short clip is left alone rather than sent round
 * the candidate languages on no evidence.
 */
export const MINIMUM_VOICED_SECONDS = 2

export function looksMistranscribed({
  words,
  voiced,
}: {
  words: Word[]
  voiced: number
}): boolean {
  if (voiced < MINIMUM_VOICED_SECONDS) return false
  return wordDensity(words, voiced) < DENSITY_FLOOR
}
