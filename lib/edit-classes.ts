/**
 * What the user changed between the draft Quincy wrote and the post they
 * approved. See plans/027 item 3e.
 *
 * **Pure, and no model call.** The whole value of this is that it is free: it
 * runs inside `approveVersion`, on every approval, forever. A model asked
 * "what changed here" would cost money on a path nobody is waiting for, would
 * answer differently on two identical edits, and would need a ceiling and a
 * cooldown of its own. String comparison is the honest tool for "did an emoji
 * disappear".
 *
 * **Every class that applies is returned.** Cutting three lines and dropping
 * an emoji is two habits, not one, and picking a winner here would silently
 * decide which rule the user is offered later.
 *
 * The classes are deliberately about *surface* — emoji, links, hashtags,
 * exclamation marks, length, where a number sits. Those are the edits a person
 * makes over and over without ever writing the rule down, which is exactly the
 * gap this feature fills. Anything requiring judgment ("made it warmer") is not
 * here, because a wrong guess would end up proposed as a permanent voice rule.
 */

export const EDIT_CLASSES = [
  "emoji-removed",
  "emoji-added",
  "link-removed",
  "link-added",
  "hashtag-removed",
  "line-cut",
  "shortened",
  "lengthened",
  "exclamation-removed",
  "numbers-on-own-line",
  "first-person",
] as const

export type EditClass = (typeof EDIT_CLASSES)[number]

/**
 * The rule each class would become, in the register the voice page is written
 * in: one short sentence, present tense, about a habit rather than a feeling.
 *
 * These are proposals and never facts. Nothing here reaches `brain_page`
 * without the user pressing "Add to voice" — see `appendVoiceRule`.
 */
export const RULE_FOR_CLASS: Record<EditClass, string> = {
  "emoji-removed": "No emoji.",
  "emoji-added": "An emoji is welcome where it earns its place.",
  "link-removed": "Every post ends without a link.",
  "link-added": "Link to the thing the post is about.",
  "hashtag-removed": "Never use hashtags.",
  "line-cut": "Every line earns its place — no scene-setting line.",
  shortened: "Write it shorter than feels finished.",
  lengthened: "Give the thought room; do not cut it to the bone.",
  "exclamation-removed": "No exclamation marks.",
  "numbers-on-own-line": "Numbers sit on their own line.",
  "first-person": "Write in the first person.",
}

/**
 * How much shorter counts as "shortened".
 *
 * A quarter, because that is a decision rather than a tidy-up. Trimming a
 * clause is editing; cutting a third of the post is a preference about length,
 * and only the second one is worth proposing as a standing rule.
 */
const LENGTH_SHIFT = 0.25

/**
 * Emoji, by Unicode property rather than by a hand-kept range list. A range
 * list is a list that is wrong the year after it is written.
 */
const EMOJI = /\p{Extended_Pictographic}/gu

/**
 * Deliberately loose, and deliberately **not** shared with
 * `lib/post-length.ts`. That pattern decides what a post costs to publish, so
 * over-matching there bills wrongly; this one decides whether a link came or
 * went, where over-matching costs a classification that needs to happen three
 * times in thirty days before anybody is asked anything.
 */
const LINK = /https?:\/\/\S+|(?<=^|\s)www\.\S+/gi

const HASHTAG = /(?<=^|\s)#[\p{L}\p{N}_]+/gu
const EXCLAMATION = /!/g

/**
 * First and third person, as whole words.
 *
 * `\bI\b` case-insensitively also matches the pronoun "i" a lowercase writer
 * uses, which is the point — this corpus is full of them. It does not match
 * "in" or "it", because of the word boundary.
 */
const FIRST_PERSON = /\b(?:i|i'm|i've|i'd|i'll|me|my|mine|myself)\b/gi
const THIRD_PERSON = /\b(?:they|them|their|theirs|themselves)\b/gi

/** A line that is a number and nothing else: "51×", "$1,200", "10 %". */
const NUMBER_LINE = /^[^\p{L}]*\p{Nd}[^\p{L}]*$/u

function count(pattern: RegExp, text: string): number {
  // `String.prototype.match` with a global pattern resets `lastIndex` itself,
  // so the shared module-level regexes above are safe to reuse across calls.
  return text.match(pattern)?.length ?? 0
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function numberLines(text: string): string[] {
  return lines(text).filter((line) => NUMBER_LINE.test(line))
}

/**
 * Every class of change between two versions of the same post.
 *
 * Identical text — including text that differs only in surrounding whitespace
 * — is not an edit and returns nothing. That case is common: approving without
 * touching the draft goes through this function on every approval.
 */
export function classifyEdit(before: string, after: string): EditClass[] {
  const a = before.trim()
  const b = after.trim()

  if (!a || !b || a === b) return []

  const found: EditClass[] = []

  const emojiBefore = count(EMOJI, a)
  const emojiAfter = count(EMOJI, b)
  if (emojiAfter < emojiBefore) found.push("emoji-removed")
  if (emojiAfter > emojiBefore) found.push("emoji-added")

  const linksBefore = count(LINK, a)
  const linksAfter = count(LINK, b)
  if (linksAfter < linksBefore) found.push("link-removed")
  if (linksAfter > linksBefore) found.push("link-added")

  if (count(HASHTAG, b) < count(HASHTAG, a)) found.push("hashtag-removed")

  const before_ = lines(a)
  const after_ = lines(b)
  const kept = new Set(after_)
  // Both halves are needed. A line missing from the set may have been
  // rewritten rather than cut, and the count is what tells the two apart.
  if (after_.length < before_.length && before_.some((l) => !kept.has(l))) {
    found.push("line-cut")
  }

  if (b.length < a.length * (1 - LENGTH_SHIFT)) found.push("shortened")
  if (b.length > a.length * (1 + LENGTH_SHIFT)) found.push("lengthened")

  if (count(EXCLAMATION, b) < count(EXCLAMATION, a)) {
    found.push("exclamation-removed")
  }

  // Moved, not added. The number has to have been in the draft already —
  // otherwise this is the user adding a fact, which is a different act and one
  // no rule about layout should be inferred from.
  const standing = new Set(numberLines(a))
  if (numberLines(b).some((n) => !standing.has(n) && a.includes(n))) {
    found.push("numbers-on-own-line")
  }

  // Both directions, because only the swap is evidence. More "I" alone happens
  // whenever a post gets longer, and fewer "they" alone happens whenever a
  // sentence is cut.
  if (
    count(FIRST_PERSON, b) > count(FIRST_PERSON, a) &&
    count(THIRD_PERSON, b) < count(THIRD_PERSON, a)
  ) {
    found.push("first-person")
  }

  return found
}

/**
 * The counter behind the offer.
 *
 * `count` and `lastAt` are the shape plans/027 asks for; `at` is what makes
 * "three times in the last thirty days" answerable at all — a bare count
 * cannot expire, so a class edited three times last spring would offer a rule
 * forever. Only the last `EDIT_THRESHOLD` stamps are kept, because nothing
 * above the threshold changes any decision and an unbounded array on a
 * `jsonb` column is a row that grows for the life of the account.
 */
export type EditRecord = {
  /** Edits inside the window, capped at `EDIT_THRESHOLD`. */
  count: number
  lastAt: string
  /** ISO stamps, newest last, at most `EDIT_THRESHOLD` of them. */
  at: string[]
}

export type EditLedger = Partial<Record<EditClass, EditRecord>>

/** Thirty days. Long enough to catch a weekly habit, short enough to forget. */
export const EDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Three. Twice is a coincidence and once is a mood; three of the same edit
 * inside a month is a preference the user has expressed three times without
 * ever being asked for it.
 */
export const EDIT_THRESHOLD = 3

/** Stamps still inside the window, newest last. */
function inWindow(record: EditRecord | undefined, now: Date): string[] {
  if (!record) return []
  const floor = now.getTime() - EDIT_WINDOW_MS
  return record.at.filter((stamp) => {
    const at = Date.parse(stamp)
    return Number.isFinite(at) && at >= floor
  })
}

/** How many times this class has fired inside the window. */
export function countInWindow(
  ledger: EditLedger,
  cls: EditClass,
  now: Date
): number {
  return inWindow(ledger[cls], now).length
}

/**
 * The ledger with today's edits folded in. Pure: the caller persists it.
 *
 * Pruning happens on write as well as on read, so a class the user stopped
 * doing shrinks back rather than sitting at three forever.
 */
export function recordEdits(
  ledger: EditLedger,
  classes: readonly EditClass[],
  now: Date
): EditLedger {
  if (classes.length === 0) return ledger

  const next: EditLedger = { ...ledger }
  const stamp = now.toISOString()

  for (const cls of new Set(classes)) {
    const at = [...inWindow(next[cls], now), stamp].slice(-EDIT_THRESHOLD)
    next[cls] = { count: at.length, lastAt: stamp, at }
  }

  return next
}

/** The class back to zero, once a rule for it has been offered and answered. */
export function clearClass(ledger: EditLedger, cls: EditClass): EditLedger {
  const next: EditLedger = { ...ledger }
  next[cls] = { count: 0, lastAt: new Date(0).toISOString(), at: [] }
  return next
}

/**
 * Rule text reduced to what two rules have to share to be the same rule.
 *
 * Case, punctuation and spacing all move when somebody rewrites a rule in
 * their own words, and none of them change what it asks for. "No emoji" and
 * "No emoji." are one rule, and offering the second to somebody who wrote the
 * first is the fastest way to make this feature feel like it is not listening.
 */
export function normaliseRule(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export type RuleOffer = { class: EditClass; text: string }

/**
 * The rule worth offering, or nothing — which is the usual answer.
 *
 * Three guards, and all three are refusals to nag:
 *
 * - **The window.** Three times in thirty days, counted from stamps.
 * - **The cap.** `RULE_CAP` is the feature (see lib/brain.ts): a voice at
 *   fifteen rules has to *drop* one to gain one, and a surprise offer is the
 *   wrong place to ask somebody to make that trade.
 * - **The duplicate.** Compared against every voice page's rules, not only the
 *   one we would write to — a rule the compiled voice already states is a rule
 *   the user already has, wherever it lives.
 *
 * `prefer` is the classes this approval just produced, checked first so the
 * offer names the edit the user can still see on screen rather than an older
 * one that happens to sort earlier.
 */
export function ruleOfferFor({
  ledger,
  targetRules,
  allRules,
  cap,
  now,
  prefer = [],
}: {
  ledger: EditLedger
  /** Rules on the page an accepted offer would be written to. */
  targetRules: readonly string[]
  /** Every rule the voice states, on any page. */
  allRules: readonly string[]
  cap: number
  now: Date
  prefer?: readonly EditClass[]
}): RuleOffer | null {
  if (targetRules.length >= cap) return null

  const have = new Set(allRules.map(normaliseRule))
  const order = [...new Set([...prefer, ...EDIT_CLASSES])]

  for (const cls of order) {
    if (countInWindow(ledger, cls, now) < EDIT_THRESHOLD) continue

    const text = RULE_FOR_CLASS[cls]
    if (have.has(normaliseRule(text))) continue

    return { class: cls, text }
  }

  return null
}
