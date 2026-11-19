import { snapToQuiet, type AudioPeaks, type Word } from "./transcript"
import { us, type UsRange } from "./time"

/**
 * Cut edges moved to the quietest instant near them, never into a word.
 *
 * Word timestamps mark where a word was recognised, not where its sound
 * stopped, so an edge placed by padding alone can land on the tail of a
 * breath or the attack of the next word. The ingest already measured the
 * take's energy for the waveform (`AudioPeaks`), and `snapToQuiet` moves each
 * edge to the quietest sample within 80 ms. That costs nothing new.
 *
 * The one thing snapping must never do is move an edge into speech: a range
 * that grows into a word cuts part of it, and one that shrinks into a word
 * leaves part of a cut sound behind. So an edge that would land inside any
 * word's span keeps its padded position, and a range that would turn inside
 * out keeps both.
 *
 * Without peaks (an older asset, a failed read) the ranges come back as given.
 */
export function refineCuts(
  ranges: UsRange[],
  words: Word[],
  peaks: AudioPeaks | null | undefined
): UsRange[] {
  if (!peaks || peaks.values.length === 0 || peaks.intervalUs <= 0)
    return ranges

  const snapped = snapToQuiet(ranges, peaks)
  const insideWord = (atUs: number) =>
    words.some((word) => atUs > word.startUs && atUs < word.endUs)

  return ranges.map((range, index) => {
    const next = snapped[index]
    const startUs = insideWord(next.startUs) ? range.startUs : next.startUs
    const endUs = insideWord(next.endUs) ? range.endUs : next.endUs
    // A snapped range must still cover what it covered in words: an edge may
    // not cross a word the original range had on its other side.
    const crosses = words.some(
      (word) =>
        (word.endUs <= range.startUs && word.endUs > startUs) ||
        (word.startUs >= range.endUs && word.startUs < endUs) ||
        (word.startUs >= range.startUs && word.startUs < startUs) ||
        (word.endUs <= range.endUs && word.endUs > endUs)
    )
    if (crosses || endUs <= startUs) return range
    return { startUs: us(startUs), endUs: us(endUs) }
  })
}
