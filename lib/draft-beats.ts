/**
 * Where a draft has its three beats, and where it does not.
 *
 * A post is a three-beat story: what I did, what happened, what it meant, with
 * the number on its own line. The kit names those beats in blue pen
 * (`BeatBracket`, docs/design/editor-marks.md), and the rule there is exact:
 * three brackets or none, and "a post that has no clear happened is not
 * ready; do not bracket it with a guess."
 *
 * `draft_version.body` carries no beat marks. It is plain text in blank-line
 * paragraphs. Read on 2026-11-15, the twelve newest bodies were three to four
 * paragraphs each and nearly all of them opinion posts, with no number on a
 * line of its own. A reader that bracketed any three paragraphs would label
 * every one of those "what happened" without anything having happened.
 *
 * So the test is strict: exactly three paragraphs, and a line in the middle
 * one that is only a number. Anything else is `null`, and the card shows the
 * paragraphs plain. When drafting starts to store beats, this reader is the one
 * place to replace.
 */

export type PostLine = {
  text: string
  /**
   * The line is only a number, "31", "1,240", "1.8×", "40%", or a before and
   * after, "41% → 68%", "27 → 2".
   */
  figure: boolean
}

/** One paragraph, as its lines. */
export type Paragraph = PostLine[]

export type PostBeats = {
  did: Paragraph
  happened: Paragraph
  meant: Paragraph
}

const FIGURE = /^[$€£]?\d[\d,.  ]*\s?(?:×|x|%|k|m)?$/i

/** The before and after: two figures joined by an arrow. */
const ARROW = /\s*(?:→|->)\s*/

/**
 * True when the whole line is a number, with at most a unit after it, or two
 * such numbers joined by an arrow. The before and after is the shape the
 * three-beat post most often puts on its own line ("41% → 68%"), so refusing
 * it left real drafts without their beat brackets.
 */
export function isFigureLine(line: string): boolean {
  const t = line.trim()
  if (t.length === 0) return false
  const parts = t.split(ARROW)
  if (parts.length === 2) {
    const [a, b] = parts as [string, string]
    return t.length <= 24 && isSingleFigure(a) && isSingleFigure(b)
  }
  return parts.length === 1 && isSingleFigure(t)
}

function isSingleFigure(t: string): boolean {
  return t.length > 0 && t.length <= 12 && FIGURE.test(t)
}

/**
 * The text as paragraphs of lines. A single newline is a line break inside a
 * paragraph (the number on its own line); a blank line starts a paragraph.
 * A paragraph that is only a number joins the one before it, so
 * "Replies in a week:\n\n31" reads as one beat.
 */
export function paragraphsOf(text: string): Paragraph[] {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((b) =>
      b
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((l): PostLine => ({ text: l, figure: isFigureLine(l) }))
    )
    .filter((b) => b.length > 0)

  const out: Paragraph[] = []
  for (const block of blocks) {
    const prev = out[out.length - 1]
    if (prev && block.length === 1 && block[0]!.figure) prev.push(block[0]!)
    else out.push(block)
  }
  return out
}

/** The three beats, or null when the post does not clearly have them. */
export function readBeats(text: string): PostBeats | null {
  const p = paragraphsOf(text)
  if (p.length !== 3) return null
  const [did, happened, meant] = p as [Paragraph, Paragraph, Paragraph]
  if (!happened.some((l) => l.figure)) return null
  // A number standing alone as the first or last beat is not a story shape.
  if (did.every((l) => l.figure) || meant.every((l) => l.figure)) return null
  return { did, happened, meant }
}
