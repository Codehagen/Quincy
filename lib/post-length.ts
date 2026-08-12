/**
 * How long a post actually is, and where the feed cuts it.
 *
 * `text.length` is wrong twice over, and both are wrong in the direction that
 * gets a post rejected after you approved it:
 *
 * - **It counts UTF-16 code units, not characters.** `"🇳🇴".length` is 4 and
 *   `"👨‍👩‍👦".length` is 8. A Norwegian flag costs a quarter of what the
 *   counter claims. `Intl.Segmenter` counts what a human calls a character,
 *   which is also what the platforms count.
 * - **It counts URLs literally.** X replaces every link with a t.co shortcut
 *   and charges a flat 23 regardless of the real length, so a post with two
 *   long links reads as far over the limit when it is comfortably under.
 *
 * The other half is the fold: where a feed hides the rest behind "see more".
 * It changes nothing about whether a post is valid and everything about how it
 * is read, because the part above the fold is the whole bet. A plain textarea
 * cannot show it.
 *
 * **The fold numbers are approximate and the limits are not.** Ceilings are
 * published and stable; fold points are layout, differ between web and app, and
 * move without announcement. They live in one table so correcting one is a
 * one-line change — treat them as "about right", not as spec.
 */

export type ChannelRules = {
  /** Published ceiling, in graphemes. null where the channel has none. */
  limit: number | null
  /**
   * Roughly where the feed truncates behind a "see more" affordance, in
   * graphemes. Approximate — see the note above. null means the whole post is
   * visible in the feed.
   */
  fold: number | null
  /**
   * Flat cost charged for any URL regardless of its real length. null means
   * links are counted literally, like any other text.
   */
  urlCost: number | null
}

export const CHANNEL_RULES: Record<string, ChannelRules> = {
  // 280 and the flat 23-per-link t.co cost are both published and long-standing.
  // Nothing is folded: a 280-character post renders in full in the timeline.
  x: { limit: 280, fold: null, urlCost: 23 },
  // The ceiling is published. The fold is not — roughly 210 on desktop and
  // nearer 140 in the app. The lower number is the safer one to write against.
  linkedin: { limit: 3000, fold: 140, urlCost: null },
  threads: { limit: 500, fold: null, urlCost: null },
  // Captions collapse early; ~125 is the commonly observed point.
  instagram: { limit: 2200, fold: 125, urlCost: null },
  bluesky: { limit: 300, fold: null, urlCost: null },
  // Long-form. No ceiling worth showing and no feed fold.
  substack: { limit: null, fold: null, urlCost: null },
  kit: { limit: null, fold: null, urlCost: null },
  youtube: { limit: 5000, fold: 157, urlCost: null },
}

/**
 * Deliberately loose. It only has to find the spans a platform will turn into a
 * link, and over-matching a trailing bracket costs a character or two on a
 * count that is already an estimate — under-matching would silently undercount
 * a post that then gets rejected on send.
 *
 * The boundary on the scheme-less branch is a **lookbehind**, and that is
 * load-bearing rather than stylistic. As a capturing group it was part of the
 * match, so `measurePost`'s `replace` deleted the space in front of the link
 * along with the link — one character short, on a counter whose whole job is
 * that a 280-character post is not refused on send. Do not simplify it back to
 * `(?:^|\s)`.
 */
const URL_PATTERN = /https?:\/\/\S+|(?<=^|\s)www\.\S+/gi

/**
 * Whether the text carries a link at all.
 *
 * Exported so lib/publish.ts can price an X post without owning a second URL
 * regex. X charges $0.015 for a post and $0.200 for a post containing a URL —
 * a 13× difference decided by this one question — and two patterns that
 * disagree about what a link is would be two answers to it, one of which bills
 * wrongly. The counter and the meter must read the same text the same way.
 */
export function containsUrl(text: string): boolean {
  // `URL_PATTERN` is global, so it carries `lastIndex` between calls. `.test`
  // would resume mid-string and answer false on the second identical call.
  URL_PATTERN.lastIndex = 0
  return URL_PATTERN.test(text)
}

/** One `Intl.Segmenter` rather than one per keystroke; constructing it is not free. */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/**
 * What a human, and every platform, calls a character.
 *
 * Drains the iterator rather than spreading it into an array. This runs on
 * every keystroke in every open editor on /drafts, and `[...segments].length`
 * would allocate one object per character to throw all of them away. A
 * `for…of` with a discarded binding would read better and trips
 * `no-unused-vars`, which has no ignore pattern configured here.
 */
export function countGraphemes(text: string): number {
  const segments = GRAPHEMES.segment(text)[Symbol.iterator]()
  let n = 0
  while (!segments.next().done) n++
  return n
}

export type PostLength = {
  /** What the platform will charge, in its own units. */
  used: number
  /** The ceiling, repeated so a caller needs one object. */
  limit: number | null
  over: number
  /**
   * String index where the fold falls, for slicing a preview. null when the
   * channel has no fold or the post is short enough to clear it.
   */
  foldIndex: number | null
}

export function measurePost(text: string, channel: string): PostLength {
  const rules = CHANNEL_RULES[channel] ?? {
    limit: null,
    fold: null,
    urlCost: null,
  }

  let used: number
  if (rules.urlCost === null) {
    used = countGraphemes(text)
  } else {
    // Replace each URL with a placeholder of known cost rather than deleting
    // it: the surrounding spaces still count, and a link glued to a word must
    // not silently merge with it.
    const links = text.match(URL_PATTERN) ?? []
    const withoutLinks = text.replace(URL_PATTERN, "")
    used = countGraphemes(withoutLinks) + links.length * rules.urlCost
  }

  const limit = rules.limit
  const over = limit === null ? 0 : Math.max(0, used - limit)

  return { used, limit, over, foldIndex: foldIndexOf(text, rules.fold) }
}

/**
 * Walks graphemes to find the string index at the fold, because slicing by
 * `fold` directly would cut through a flag or a family emoji and produce a
 * preview containing half a character.
 *
 * Returns null when the post does not reach the fold — there is nothing hidden,
 * so there is nothing to warn about.
 */
function foldIndexOf(text: string, fold: number | null): number | null {
  if (fold === null) return null

  let seen = 0
  for (const seg of GRAPHEMES.segment(text)) {
    if (seen === fold) return seg.index
    seen++
  }
  return null
}

/** The part a reader sees before deciding whether to open the rest. */
export function splitAtFold(text: string, channel: string) {
  const { foldIndex } = measurePost(text, channel)
  if (foldIndex === null) return { visible: text, hidden: "" }
  return { visible: text.slice(0, foldIndex), hidden: text.slice(foldIndex) }
}
