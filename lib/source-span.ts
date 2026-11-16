/**
 * Where an idea stands in the person's own words.
 *
 * The angle generator is to quote the sentence (or two) of the material an
 * angle comes from — `Angle.line` — so the Marked-up view can underline it in
 * the scrap and number it. This module turns that quote into a span of the
 * scrap. It never takes offsets from the model: a model counts characters
 * badly, and a span that is off by twenty underlines the wrong sentence under
 * the person's own name. The quote is searched for here, in code.
 *
 * Pure and client-safe: no database, no model. The same function can run at
 * write time or in a loader, and since `riff.scrap` is stored, the span can
 * always be derived again from the two strings rather than stored and left to
 * go stale.
 *
 * What it forgives, because models do it while still quoting faithfully:
 * - whitespace: runs of spaces, tabs and newlines compare as one space, and a
 *   quote that drops a line break between two sentences still matches;
 * - typography: curly quotes and apostrophes against straight ones, en and em
 *   dashes against a hyphen, "…" against "...";
 * - case;
 * - wrapping: quote marks around the whole quote, and a leading or trailing
 *   "..." where the model cut the sentence short.
 *
 * What it does not: paraphrase, a dropped or changed word, an ellipsis in the
 * middle of the quote. Those return `undefined`, and the idea renders with no
 * mark (listed under "From the whole note"). An idea with no mark is honest;
 * an idea marked on the wrong sentence is not.
 */

export type SourceSpan = {
  /** Offset of the first character of the quote in the material. */
  start: number
  /** Offset one past the last character, so `material.slice(start, end)`. */
  end: number
}

/** The longest quote the generator is asked for. Longer is not a sentence. */
export const MAX_LINE_CHARS = 240

/**
 * Below this, a "quote" matches by accident ("the", "we did") and the mark
 * would land on the first common word in the note rather than on the idea.
 */
export const MIN_LINE_CHARS = 8

const FOLD: Record<string, string> = {
  "‘": "'", // ‘
  "’": "'", // ’
  "‚": "'", // ‚
  "‛": "'", // ‛
  "′": "'", // ′
  "“": '"', // “
  "”": '"', // ”
  "„": '"', // „
  "‟": '"', // ‟
  "″": '"', // ″
  "«": '"', // «
  "»": '"', // »
  "‐": "-", // ‐
  "‑": "-", // ‑
  "‒": "-", // ‒
  "–": "-", // –
  "—": "-", // —
  "―": "-", // ―
  "−": "-", // −
  "…": "...", // …
  " ": " ", // no-break space
}

/**
 * The comparable form of `text`, and for every character in it the offset of
 * the character in `text` it came from. Building the map as we go is what lets
 * a match in the folded string be reported as a span of the original.
 */
function fold(text: string): { folded: string; from: number[] } {
  let folded = ""
  const from: number[] = []
  let lastWasSpace = true // also trims leading whitespace
  let i = 0
  for (const ch of text) {
    const mapped = FOLD[ch] ?? ch
    if (/\s/u.test(mapped)) {
      if (!lastWasSpace) {
        folded += " "
        from.push(i)
        lastWasSpace = true
      }
    } else {
      // toLowerCase may lengthen a character; every emitted unit maps back to
      // the same source offset.
      for (const unit of mapped.toLowerCase()) {
        for (let k = 0; k < unit.length; k++) {
          folded += unit[k]
          from.push(i)
        }
      }
      lastWasSpace = false
    }
    i += ch.length
  }
  if (folded.endsWith(" ")) {
    folded = folded.slice(0, -1)
    from.pop()
  }
  return { folded, from }
}

/**
 * The quote with its wrapping removed: surrounding whitespace, a pair of quote
 * marks around the whole thing, and a leading or trailing "..." or "…".
 * Applied after folding, so curly and straight marks are handled alike.
 */
function unwrap(foldedQuote: string): string {
  let q = foldedQuote.trim()
  for (let pass = 0; pass < 3; pass++) {
    const before = q
    if (q.length >= 2 && ((q.startsWith('"') && q.endsWith('"')) || (q.startsWith("'") && q.endsWith("'")))) {
      q = q.slice(1, -1).trim()
    }
    if (q.startsWith("...")) q = q.slice(3).trim()
    if (q.endsWith("...")) q = q.slice(0, -3).trim()
    if (q === before) break
  }
  return q
}

/**
 * Every place `needle` occurs in `haystack`, without overlap.
 */
function occurrences(haystack: string, needle: string): number[] {
  const at: number[] = []
  let from = 0
  while (from <= haystack.length - needle.length) {
    const i = haystack.indexOf(needle, from)
    if (i < 0) break
    at.push(i)
    from = i + needle.length
  }
  return at
}

/**
 * Where `quote` stands in `material`, or `undefined` when it cannot be found
 * as written (after the forgiveness listed at the top of this file).
 *
 * When the quote occurs more than once, the first occurrence wins, unless
 * `near` is given: then the occurrence whose start is closest to that offset
 * (ties go to the earlier one). `near` is for a caller placing several quotes
 * in reading order — pass the end of the previous mark.
 */
export function resolveQuote(
  material: string,
  quote: string | null | undefined,
  options: { near?: number } = {}
): SourceSpan | undefined {
  if (!material || !quote) return undefined

  const needle = unwrap(fold(quote).folded)
  if (needle.length < MIN_LINE_CHARS) return undefined

  const hay = fold(material)
  const hits = occurrences(hay.folded, needle)
  if (hits.length === 0) return undefined

  let best = hits[0]
  if (options.near !== undefined && hits.length > 1) {
    const near = options.near
    const distance = (k: number) => Math.abs(hay.from[k] - near)
    for (const k of hits) if (distance(k) < distance(best)) best = k
  }

  const start = hay.from[best]
  const lastUnit = best + needle.length - 1
  const lastSource = hay.from[lastUnit]
  // One past the last source character, stepping over a surrogate pair.
  const code = material.codePointAt(lastSource) ?? 0
  const end = lastSource + (code > 0xffff ? 2 : 1)
  return { start, end }
}

/**
 * The stored line, cleaned for storage: trimmed, empty when absent, and empty
 * when longer than `MAX_LINE_CHARS` (an over-long "quote" is a summary, and
 * summaries are what `why` is for). What `riff_angle.line` would hold.
 */
export function settleLine(line: string | null | undefined): string {
  const trimmed = line?.trim() ?? ""
  return trimmed.length > MAX_LINE_CHARS ? "" : trimmed
}

/**
 * The mark for one stored angle: its line and the span of it in the scrap, or
 * `undefined` for an angle that has none — every angle written before the line
 * existed, an angle drawn from the whole note, and a quote that no longer
 * matches the scrap. Readers treat `undefined` as "no mark", never as an error.
 */
export function markFor(
  scrap: string,
  line: string | null | undefined,
  options: { near?: number } = {}
): { line: string; span: SourceSpan } | undefined {
  const settled = settleLine(line)
  if (!settled) return undefined
  const span = resolveQuote(scrap, settled, options)
  return span ? { line: settled, span } : undefined
}
