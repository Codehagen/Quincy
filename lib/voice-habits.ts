/**
 * How often somebody actually does the things their voice rules claim.
 *
 * **A counting question, answered by counting.** `lib/voice.ts` asks a model to
 * read up to 300 posts and report habits, and its prompt has told it to count
 * since the day it was written: "Count before you claim: a habit in a quarter
 * of the posts is 'sometimes', not 'always'." It does not count. Measured
 * against a real 57-post corpus on 2026-08-17, the compiled `voice/x` page
 * said:
 *
 *   "Open with a bold claim followed by the 🤯 emoji."   — true of 17%
 *   "Close most posts with a ✨ sparkle emoji."          — true of 8%
 *
 * Both are imperatives, neither carries a frequency, and one is simply false.
 * Downstream nothing could tell: `renderBrain` prints rules as a list, the
 * drafting prompt answers with a hedge ("a named habit is a habit, not an
 * instruction"), and a hedge loses to an order. Three drafts written from that
 * page opened 🤯 and closed ✨ — a frame the user uses in 7% of their posts,
 * produced 100% of the time.
 *
 * So the frequencies are measured here and handed to the model as fact, rather
 * than asked for and hoped for. Two things use them:
 *
 * - `describeHabits` goes into the extraction prompt, so a rule cannot claim
 *   "most" for something measured at 8% — the number is on the page in front
 *   of it.
 * - `renderHabits` goes onto the brain page and into every drafting prompt, so
 *   the real numbers are present *even when a rule overstates anyway*. That is
 *   the half that does not depend on the model behaving, and it is the reason
 *   this is worth building rather than rewording the prompt again.
 *
 * Nothing here is a judgment. A count is not an instruction and this module
 * never decides what a habit means — that stays with the extractor, which is
 * the right place for it and now has arithmetic it did not have.
 */

/** One token — an emoji, usually — and where it actually appears. */
export type TokenHabit = {
  token: string
  /** Posts containing it at least once. */
  posts: number
  /** Posts whose first line contains it. */
  opens: number
  /** Posts whose last non-whitespace character is it. */
  closes: number
}

export type Habits = {
  /** What everything below is a fraction of. */
  posts: number
  /** Most-used first, capped at `TOKEN_CAP`. */
  emoji: TokenHabit[]
  /** Posts with no emoji anywhere. The habit a mandate cannot express. */
  noEmoji: number
  hashtags: number
  links: number
  /** Posts ending in a question mark. */
  questions: number
  /** Posts using a standalone lowercase "i" for "I". */
  lowercaseI: number
  /** Posts using ◆ ▸ • - or a numbered line as a bullet. */
  bullets: number
  medianChars: number
  medianLines: number
}

/**
 * Enough to cover a voice, few enough that the block stays readable in a
 * prompt. A corpus with thirty distinct emoji has no emoji habit worth naming.
 */
const TOKEN_CAP = 6

/**
 * Below this a token is noise rather than a habit.
 *
 * One post out of 57 is not something a ghostwriter should reproduce, and
 * listing it invites exactly the overstatement this file exists to stop — a
 * model shown "🎉: 1 post" will happily write a rule about 🎉.
 */
const MIN_TOKEN_POSTS = 2

/**
 * `Extended_Pictographic` rather than a hand-written range list.
 *
 * The ranges people write by hand miss the ones that matter: ✨ (U+2728) and
 * 🔗 (U+1F517) sit outside the "emoji block" most such lists cover, and ✨ is
 * the single most-used token in the corpus this was built against.
 */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/gu

/** Variation selector and keycap joiners, dropped so "✨" and "✨️" count once. */
const MODIFIERS = /[︎️‍]/g

function emojiIn(text: string): string[] {
  return (text.replace(MODIFIERS, "").match(PICTOGRAPHIC) ?? []).map((e) => e)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

export function measureHabits(bodies: string[]): Habits {
  const posts = bodies.map((b) => b.trim()).filter(Boolean)
  const n = posts.length

  const seen = new Map<string, TokenHabit>()
  let noEmoji = 0

  for (const post of posts) {
    const found = new Set(emojiIn(post))
    if (found.size === 0) noEmoji += 1

    const firstLine = post.split("\n")[0] ?? ""
    // The last pictographic character of the post, so "worth it ✨" counts as a
    // close and "✨ shipped" does not. Trailing whitespace is not a character.
    const trimmed = post.replace(MODIFIERS, "").trimEnd()
    const lastChar = [...trimmed].pop() ?? ""

    for (const token of found) {
      const habit = seen.get(token) ?? { token, posts: 0, opens: 0, closes: 0 }
      habit.posts += 1

      /**
       * Closing wins, and the two are exclusive.
       *
       * Most of this user's posts are one line, so the opening line *is* the
       * closing line and a naive reading counted every sign-off as an opener
       * too. Measured against the real corpus that reported "✨ opens 32%" for
       * a token that is overwhelmingly a sign-off — an inflated number stated
       * as fact, which is the exact failure this module exists to end.
       */
      if (lastChar === token) habit.closes += 1
      else if (firstLine.includes(token)) habit.opens += 1

      seen.set(token, habit)
    }
  }

  const emoji = [...seen.values()]
    .filter((h) => h.posts >= MIN_TOKEN_POSTS)
    .sort((a, b) => b.posts - a.posts || a.token.localeCompare(b.token))
    .slice(0, TOKEN_CAP)

  const count = (test: (post: string) => boolean) => posts.filter(test).length

  return {
    posts: n,
    emoji,
    noEmoji,
    hashtags: count((p) => /(^|\s)#\w/.test(p)),
    links: count((p) => /https?:\/\//.test(p)),
    questions: count((p) => p.trimEnd().endsWith("?")),
    // Standalone "i" as a word. Bounded on both sides so "i.e." and "I'm" do
    // not count, and case-sensitive on purpose — the habit *is* the lowercase.
    lowercaseI: count((p) => /(^|[\s(])i([\s,.!?)]|$)/.test(p)),
    bullets: count((p) => /^\s*([◆▸•\-*]|\d+[.)])\s/m.test(p)),
    medianChars: median(posts.map((p) => p.length)),
    medianLines: median(posts.map((p) => p.split("\n").length)),
  }
}

/** `13 of 57 posts (23%)`, or `never` — which is a finding, not a gap. */
function share(count: number, total: number): string {
  if (total === 0) return "no posts to measure"
  if (count === 0) return "never"
  return `${count} of ${total} (${Math.round((100 * count) / total)}%)`
}

function tokenLine(habit: TokenHabit, total: number): string {
  const where: string[] = []
  if (habit.opens > 0) where.push(`opens ${share(habit.opens, total)}`)
  if (habit.closes > 0) where.push(`ends ${share(habit.closes, total)}`)

  const placement =
    where.length > 0
      ? ` — ${where.join(", ")}`
      : " — never at the start or the end"

  return `  ${habit.token}  in ${share(habit.posts, total)}${placement}`
}

function lines(habits: Habits): string[] {
  const { posts: n } = habits
  return [
    ...habits.emoji.map((h) => tokenLine(h, n)),
    `  no emoji at all: ${share(habits.noEmoji, n)}`,
    `  hashtags: ${share(habits.hashtags, n)}`,
    `  a link: ${share(habits.links, n)}`,
    `  ends on a question: ${share(habits.questions, n)}`,
    `  lowercase "i" for "I": ${share(habits.lowercaseI, n)}`,
    `  bulleted lines: ${share(habits.bullets, n)}`,
    `  median length: ${habits.medianChars} characters over ${habits.medianLines} line(s)`,
  ]
}

/**
 * The counts, for the extraction prompt.
 *
 * Stated as arithmetic the model is not allowed to contradict, rather than as
 * background. The instruction to count has been in `EXTRACT_PROMPT` since it
 * was written and was ignored; what changes here is that the counting is
 * already done, so the only remaining failure is contradicting a number printed
 * directly above.
 */
export function describeHabits(habits: Habits): string {
  if (habits.posts === 0) return ""

  return [
    `## Measured habits`,
    ``,
    `Counted from the posts below, not estimated. These numbers are correct and you may not contradict them.`,
    ``,
    ...lines(habits),
    ``,
    `Every rule you write about a recurring token — an emoji, an opener, a sign-off, a bullet character — must carry its real frequency from this list, in the rule text. "most", "usually" and "always" are only available above 50%; at 15-50% write "sometimes" or "about one post in five"; below 15% do not write a rule about it at all. A token measured at 8% described as something they do to "most posts" is the single worst mistake you can make here, because a ghostwriter will then put it on every post they write.`,
  ].join("\n")
}

/**
 * The counts, for the brain page and therefore for every drafting prompt.
 *
 * **This is the half that does not depend on the extractor behaving.** A rule
 * saying "close most posts with ✨" and a measurement saying "ends 5 of 57
 * (9%)" sit on the same page, and the second is checkable arithmetic while the
 * first is a sentence — so the drafting prompt is told, plainly, which one wins.
 */
export function renderHabits(habits: Habits): string {
  if (habits.posts === 0) return ""

  return [
    `Measured across the ${habits.posts} posts they published. These are counts, and they outrank any rule above that disagrees with them — a rule is a description and this is the arithmetic:`,
    ``,
    ...lines(habits),
    ``,
    /**
     * Both directions, and that is not padding.
     *
     * The first cut of this line named only the abstaining case — "if they
     * write posts with no emoji, some of yours must have none" — and four
     * drafts in a row came back with no emoji at all, for a writer whose posts
     * carry one 89% of the time. Correct about the frequency it mentioned and
     * silent about the far larger one, so the model optimised the half it was
     * shown. A proportion has two sides and a prompt that states one is an
     * instruction to go to that side.
     */
    `Use them as proportions, in both directions. A token in 20% of their posts belongs in about one post in five — not in this one because it is memorable, and not in none of them because it looked repetitive. Read the plain majority the same way: if most of their posts carry an emoji then most of yours should, and if some of theirs carry none then some of yours must.`,
  ].join("\n")
}
