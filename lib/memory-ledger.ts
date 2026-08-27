import { and, eq, inArray } from "drizzle-orm"

import { appendEvent, getPage, putPage, type BrainPage } from "./brain"
import { db } from "./db"
import { user } from "./schema"
import { brainPage } from "./schema-app"
import {
  addCalendarDays,
  calendarDayIn,
  dayKeyOf,
  parseDayKey,
  resolveTimeZone,
} from "./timezone"

/**
 * The per-day memory ledger. Plan 027, 3c.
 *
 * Capture already wrote every user turn into an append-only inbox, and
 * Heartbeat already compiled that inbox weekly. Two things were missing between
 * them, and both were visible in the field: nothing said *what kind* of thing
 * had been said, and nothing noticed that it had been said before. A reference
 * product records the same preference four times in forty minutes; the memory
 * then reads as four independent votes for one sentence, and a compile weighs
 * it accordingly.
 *
 * So: one page per day, `memory/YYYY-MM-DD` in the user's own zone, holding a
 * markdown list where every line carries its type. A line is refused if the
 * same type already said the same thing today or in the previous seven days.
 * The comparison is arithmetic over words — no model call — because this runs
 * on the chat turn and a turn may not get slower to keep a tidier ledger.
 *
 * ## The grammar
 *
 * ```
 * - fact: The migration took four hours and broke nothing.
 * - preference: Always write my posts in English.
 * - correction: Never open a post with an emoji.
 * - question: What made you merge 282 at 14:24?
 * ```
 *
 * One line, one type, no nesting. `parseLedger` ignores anything that is not
 * that shape, so a hand-written note on the same page survives a round trip and
 * is simply not treated as a ledger line.
 *
 * ## Where the writes go
 *
 * Through lib/brain.ts, like every other brain write. The read of the window is
 * a direct select — one query for eight slugs rather than eight `getPage` round
 * trips on a chat turn — which is the same thing `runHeartbeatForEveryone`
 * already does. Reads were never the invariant; writes are.
 *
 * The import of `renderLedgerSection` back into lib/brain.ts makes this pair a
 * cycle. It is safe by construction: neither module calls the other at module
 * evaluation time, and everything crossing the boundary is a hoisted function
 * declaration.
 */

export const LEDGER_TYPES = [
  "fact",
  "preference",
  "correction",
  "question",
] as const

/**
 * `question` is an open question Quincy asked and has not had answered — plan
 * 027's 1c queues exactly these. Nothing writes one yet; the type is defined
 * now so the grammar does not change under the pages already on disk when
 * something does.
 */
export type LedgerType = (typeof LEDGER_TYPES)[number]

export const LEDGER_SOURCES = ["chat", "heartbeat", "sources"] as const
export type LedgerSource = (typeof LEDGER_SOURCES)[number]

export type LedgerLine = { type: LedgerType; text: string }

/** A merged line, carrying the day it was written on. */
export type LedgerEntry = LedgerLine & { day: string }

/**
 * How far back a new line is compared. Today plus the seven days before it,
 * so eight pages are read. A dedupe window that is only today would let the
 * same preference land every morning for a week.
 */
export const LEDGER_DEDUPE_DAYS = 7

/** How much of the ledger the compile and the prompt see: today plus six. */
export const LEDGER_WINDOW_DAYS = 7

/** The most ledger lines `renderLedgerSection` puts in a prompt. */
export const LEDGER_RENDER_CAP = 40

/** The most ledger text the weekly compile pays for, newest first. */
export const LEDGER_COMPILE_BYTES = 12 * 1024

/**
 * Jaccard over the words of two lines of the same type. 0.8 is roughly "one
 * word in five differs" — a restatement, not a second thought.
 */
export const NEAR_DUPLICATE_THRESHOLD = 0.8

/** One line is one line. Anything longer is a paste, and belongs in a riff. */
const MAX_LINE_LENGTH = 500

const LEDGER_SLUG_PATTERN = /^memory\/(\d{4}-\d{2}-\d{2})$/

const LINE_PATTERN = new RegExp(
  `^\\s*-\\s*(${LEDGER_TYPES.join("|")})\\s*:\\s*(.+?)\\s*$`
)

/* ── The grammar ──────────────────────────────────────────────────────── */

export function ledgerSlug(day: string): string {
  return `memory/${day}`
}

export function isLedgerSlug(slug: string): boolean {
  return LEDGER_SLUG_PATTERN.test(slug)
}

/** `YYYY-MM-DD` for a ledger page, or null for any other memory page. */
export function ledgerDayOf(slug: string): string | null {
  const match = LEDGER_SLUG_PATTERN.exec(slug)
  if (!match) return null
  return parseDayKey(match[1]) ? match[1] : null
}

export function formatLedgerLine(line: LedgerLine): string {
  return `- ${line.type}: ${line.text}`
}

/**
 * Lines out of a page body. Unknown lines are dropped rather than guessed at:
 * a page the user has edited by hand is still a valid ledger page, it just has
 * prose on it that no rule may act on.
 */
export function parseLedger(body: string): LedgerLine[] {
  const lines: LedgerLine[] = []

  for (const raw of body.split("\n")) {
    const match = LINE_PATTERN.exec(raw)
    if (!match) continue
    lines.push({ type: match[1] as LedgerType, text: match[2] })
  }

  return lines
}

/**
 * The comparison form. Case folded, apostrophes removed so "don't" and "dont"
 * are one word, every other punctuation mark treated as a space, and the whole
 * thing collapsed to single spaces.
 *
 * Letters and digits are kept by Unicode class rather than by `a-z0-9`: half
 * the corpus is Norwegian, and stripping "ø" would make "unngå" and "unnga"
 * different words while making "på" and "pa" the same one.
 */
export function normaliseLine(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function wordsOf(normalised: string): string[] {
  return normalised ? normalised.split(" ") : []
}

/** |A ∩ B| / |A ∪ B| over two word sets. 0 when either side is empty. */
export function jaccard(a: string[], b: string[]): number {
  const left = new Set(a)
  const right = new Set(b)
  if (left.size === 0 || right.size === 0) return 0

  let shared = 0
  for (const word of left) {
    if (right.has(word)) shared += 1
  }

  return shared / (left.size + right.size - shared)
}

/**
 * The dedupe rule, whole.
 *
 * Two lines are the same line when **all** of the following hold:
 *
 * 1. they have the same type, and
 * 2. after normalisation they are equal, **or** one contains the other on word
 *    boundaries, **or** their word sets score ≥ 0.8 by Jaccard.
 *
 * Type first, and that is the safety valve. A `correction` never merges into
 * the `preference` it overturns, however similar the words are — which is what
 * makes "I always write in English" and "I never write in English" safe to
 * compare by word overlap at all, since the second one arrives as a correction.
 *
 * A shingle here is one word, not a bigram. Bigrams at 0.8 only ever match an
 * appended tail — one substituted word in a nineteen-word sentence is the first
 * case that clears the threshold — and an appended tail is already caught by
 * the containment rule. Words catch what the containment rule cannot: a
 * restatement that reorders or swaps a word.
 *
 * The sharp edge is deliberate and worth naming: containment means a short line
 * swallows a longer, more specific one of the same type. "no emojis" already on
 * the page refuses "no emojis on LinkedIn but yes on X". In practice a
 * refinement like that arrives as a `correction`, so it is a different type and
 * is kept.
 */
export function isDuplicateLine(a: LedgerLine, b: LedgerLine): boolean {
  if (a.type !== b.type) return false

  const left = normaliseLine(a.text)
  const right = normaliseLine(b.text)
  if (!left || !right) return false

  if (left === right) return true
  if (` ${left} `.includes(` ${right} `)) return true
  if (` ${right} `.includes(` ${left} `)) return true

  return jaccard(wordsOf(left), wordsOf(right)) >= NEAR_DUPLICATE_THRESHOLD
}

/** Newest wins. Used when merging days, where the list arrives newest first. */
export function dedupeLines<T extends LedgerLine>(
  lines: T[]
): { lines: T[]; dropped: number } {
  const kept: T[] = []
  let dropped = 0

  for (const line of lines) {
    if (kept.some((seen) => isDuplicateLine(seen, line))) {
      dropped += 1
      continue
    }
    kept.push(line)
  }

  return { lines: kept, dropped }
}

/* ── The classifier ───────────────────────────────────────────────────── */

/**
 * Imperative openers. A turn that starts with one of these is an instruction
 * about how the work is done, not a report of something that happened.
 *
 * Norwegian is in the list because the owner's own material is, and because a
 * classifier that only reads English would file every Norwegian instruction as
 * a fact — which is the failure this replaces, not a smaller version of it.
 */
const IMPERATIVE_OPENERS = new Set([
  // English
  "always",
  "never",
  "dont",
  "do",
  "avoid",
  "keep",
  "stop",
  "use",
  "write",
  "prefer",
  "please",
  "make",
  "drop",
  "cut",
  "remove",
  "skip",
  "only",
  "shorten",
  "translate",
  // Norwegian
  "ikke",
  "alltid",
  "aldri",
  "bruk",
  "skriv",
  "hold",
  "dropp",
  "unngå",
  "kutt",
  "husk",
])

const FIRST_PERSON = [
  /^i (want|need|prefer|like|love|hate|dont|never|always|expect|wont)\b/,
  /\bi (want|prefer|dont want|never want|always want) (you|quincy) to\b/,
  /^(jeg|eg) (vil|liker|hater|foretrekker|ønsker|trenger|skriver)\b/,
]

const RULE_SHAPED = [
  /\b(never|always) (use|write|post|say|add|include|start|open|end|close|mention)\b/,
  /\b(should|must) (never|always|not)\b/,
]

/**
 * Which line a chat turn becomes. Pure, and cheap enough to run on every turn —
 * a model call here would put a round trip between the user pressing enter and
 * the reply being saved, to decide a label that costs almost nothing when it is
 * wrong.
 *
 * `fact` is the fallback on purpose. It is what capture did before this
 * existed, so anything the markers do not recognise keeps the old behaviour
 * rather than being labelled with a guess.
 */
export function classifyCapture(text: string): LedgerType {
  const normalised = normaliseLine(text)
  if (!normalised) return "fact"

  const first = normalised.split(" ")[0]
  if (IMPERATIVE_OPENERS.has(first)) return "preference"

  if (FIRST_PERSON.some((pattern) => pattern.test(normalised))) {
    return "preference"
  }

  if (RULE_SHAPED.some((pattern) => pattern.test(normalised))) {
    return "preference"
  }

  return "fact"
}

/* ── Reading a window of days ─────────────────────────────────────────── */

/** `YYYY-MM-DD`, newest first: today and the `days` days before it. */
export function ledgerDays(now: Date, zone: string, days: number): string[] {
  const today = calendarDayIn(now, zone)
  const keys: string[] = []

  for (let back = 0; back <= days; back += 1) {
    keys.push(dayKeyOf(addCalendarDays(today, -back)))
  }

  return keys
}

async function zoneFor(userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: user.timezone })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  return resolveTimeZone(row?.timezone)
}

/**
 * The window's pages in one query.
 *
 * A read, not a write, so it goes straight at the table — eight `getPage` calls
 * would be eight round trips on the path a chat turn takes to save.
 */
async function pagesForDays(
  userId: string,
  days: string[]
): Promise<BrainPage[]> {
  if (days.length === 0) return []

  return db
    .select()
    .from(brainPage)
    .where(
      and(
        eq(brainPage.userId, userId),
        inArray(brainPage.slug, days.map(ledgerSlug))
      )
    )
}

/* ── The write ────────────────────────────────────────────────────────── */

export type AppendLedgerResult =
  | { written: true; slug: string; day: string; line: LedgerLine }
  | {
      written: false
      reason: "empty" | "duplicate"
      slug: string
      day: string
      duplicateOf?: LedgerLine
    }

/**
 * Add one typed line to today's ledger, unless the ledger already says it.
 *
 * `at` is the instant, `timezone` decides which day that instant falls on. Pass
 * the zone when the caller already holds the user row; otherwise one small
 * select resolves it, which is the cost of getting the day boundary right for
 * somebody who is not on UTC.
 *
 * Three queries on the writing path and one on the refusing path: the window,
 * the page, the event. The write is a `putPage`, so it also snapshots the page
 * into `brain_page_version` — one snapshot per accepted line, which is a row
 * per line and the undo the rest of the brain already has. Worth revisiting if
 * a day's ledger ever gets long enough for the snapshots to matter; the dedupe
 * rule is what keeps it from getting there.
 */
export async function appendLedger(
  userId: string,
  {
    type,
    text,
    source,
    at = new Date(),
    timezone,
  }: {
    type: LedgerType
    text: string
    source: LedgerSource
    at?: Date
    timezone?: string | null
  }
): Promise<AppendLedgerResult> {
  const zone = timezone ? resolveTimeZone(timezone) : await zoneFor(userId)
  const day = dayKeyOf(calendarDayIn(at, zone))
  const slug = ledgerSlug(day)

  // One line, always. A newline in the text would break the grammar for every
  // reader of the page, and the second half of the line would parse as prose.
  const cleaned = text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LINE_LENGTH)
    .trim()

  if (!cleaned) {
    return { written: false, reason: "empty", slug, day }
  }

  const line: LedgerLine = { type, text: cleaned }
  const window = await pagesForDays(
    userId,
    ledgerDays(at, zone, LEDGER_DEDUPE_DAYS)
  )

  for (const page of window) {
    const existing = parseLedger(page.body).find((seen) =>
      isDuplicateLine(seen, line)
    )

    if (existing) {
      return {
        written: false,
        reason: "duplicate",
        slug,
        day,
        duplicateOf: existing,
      }
    }
  }

  const today = window.find((page) => page.slug === slug) ?? null
  const kept = today?.body.trim() ? `${today.body.trim()}\n` : ""

  const page = await putPage({
    userId,
    slug,
    kind: "memory",
    title: `Ledger — ${day}`,
    body: `${kept}${formatLedgerLine(line)}`,
    // A page the user has edited stays theirs. `putPage` writes whatever
    // provenance it is handed, so passing "inferred" unconditionally would
    // quietly demote an edited page back to unreviewed on the next turn.
    provenance: today?.provenance ?? "inferred",
  })

  await appendEvent({
    pageId: page.id,
    kind: type === "correction" ? "correction" : "observation",
    source,
    confidence: type === "correction" ? "high" : "medium",
    summary: formatLedgerLine(line).slice(2),
  })

  return { written: true, slug, day, line }
}

/* ── The read ─────────────────────────────────────────────────────────── */

export type MergedLedger = {
  /** Newest first, deduped across days. */
  lines: LedgerEntry[]
  /** How many lines the dedupe rule removed while merging. */
  dropped: number
}

/** Merge already-loaded pages. Pure, so the test does not need a database. */
export function mergeLedgerPages(
  pages: BrainPage[],
  days: string[]
): MergedLedger {
  const wanted = new Set(days)
  const byDay = new Map<string, BrainPage>()

  for (const page of pages) {
    const day = ledgerDayOf(page.slug)
    if (day && wanted.has(day)) byDay.set(day, page)
  }

  const entries: LedgerEntry[] = []

  // `days` arrives newest first; within a day, lines are appended in the order
  // they were said, so the last line on the page is the newest thing on it.
  for (const day of days) {
    const page = byDay.get(day)
    if (!page) continue

    for (const line of parseLedger(page.body).reverse()) {
      entries.push({ ...line, day })
    }
  }

  return dedupeLines(entries)
}

/** The week's ledger, merged and deduped, for the compile. */
export async function mergeLedger(
  userId: string,
  {
    now = new Date(),
    timezone,
    days = LEDGER_WINDOW_DAYS - 1,
  }: { now?: Date; timezone?: string | null; days?: number } = {}
): Promise<MergedLedger> {
  const zone = timezone ? resolveTimeZone(timezone) : await zoneFor(userId)
  const keys = ledgerDays(now, zone, days)

  return mergeLedgerPages(await pagesForDays(userId, keys), keys)
}

/**
 * Cut the merged ledger down to a byte budget, newest first.
 *
 * A ceiling on what one compile buys, per AGENTS.md: the ledger grows with how
 * much somebody talks, and nothing else in the compile path is bounded by that.
 * The count of what was dropped is returned rather than logged, so the compile
 * note can say what the model was not shown.
 */
export function boundLedger(
  lines: LedgerEntry[],
  maxBytes = LEDGER_COMPILE_BYTES
): { lines: LedgerEntry[]; cut: number } {
  const kept: LedgerEntry[] = []
  let bytes = 0

  for (const line of lines) {
    const size = Buffer.byteLength(`${formatLedgerLine(line)}\n`, "utf8")
    if (bytes + size > maxBytes) break
    bytes += size
    kept.push(line)
  }

  return { lines: kept, cut: lines.length - kept.length }
}

/**
 * The ledger as a prompt block. Newest first, typed, with the one instruction
 * that the types exist to carry: a correction is a rule and it wins.
 */
export function renderLedgerLines(lines: LedgerLine[]): string {
  if (lines.length === 0) return ""

  return (
    `Typed ledger lines, newest first. \`correction:\` is the user overruling ` +
    `something — state it as a rule, keep it, and drop anything it ` +
    `contradicts. \`question:\` is something Quincy asked and has not had ` +
    `answered; it is never a fact.\n\n` +
    lines.map(formatLedgerLine).join("\n")
  )
}

/**
 * The last seven days of ledger, as a section of the rendered brain.
 *
 * Placed after the compiled memory pages by `renderBrain`, so the chat sees
 * this morning's facts without waiting for Sunday's compile — which is the
 * whole point of a per-day ledger. Capped at 40 lines because this rides on
 * every chat turn, and an uncapped tail would grow with how talkative the week
 * was rather than with how much of it matters.
 *
 * The upper edge of the window is open. `zone` defaults to UTC for a caller
 * that does not know the user's, and a user east of UTC can be a day ahead of
 * it — an inclusive upper bound would then hide the page being written today,
 * which is the one line this section exists to show.
 */
export function renderLedgerSection(
  pages: BrainPage[],
  {
    now = new Date(),
    timezone,
    cap = LEDGER_RENDER_CAP,
  }: { now?: Date; timezone?: string | null; cap?: number } = {}
): string {
  const zone = resolveTimeZone(timezone)
  const days = ledgerDays(now, zone, LEDGER_WINDOW_DAYS - 1)
  const floor = days[days.length - 1]

  const inWindow = pages.filter((page) => {
    const day = ledgerDayOf(page.slug)
    return day !== null && day >= floor
  })

  // Sorted newest first by slug, which sorts as a date because the day key is
  // zero-padded. Any day at or after the floor is included, including one
  // ahead of the caller's clock.
  const ordered = [...inWindow].sort((a, b) => b.slug.localeCompare(a.slug))
  const keys = ordered
    .map((page) => ledgerDayOf(page.slug))
    .filter((day): day is string => day !== null)

  const { lines } = mergeLedgerPages(ordered, keys)
  if (lines.length === 0) return ""

  const shown = lines.slice(0, cap)
  const body = shown.map(formatLedgerLine).join("\n")
  const cut = lines.length - shown.length
  const note = cut > 0 ? `\n\n${cut} older line(s) not shown.` : ""

  return (
    `## Lately\n\nWhat the user has said in the last ${LEDGER_WINDOW_DAYS} days, ` +
    `newest first, not compiled yet. A \`correction:\` line is a rule and beats ` +
    `anything above that contradicts it. A \`question:\` line is something ` +
    `Quincy asked and has not had answered — ask it, never assert it.\n\n` +
    `${body}${note}`
  )
}

/** The ledger page for one day, if there is one. */
export async function getLedgerPage(userId: string, day: string) {
  return getPage(userId, ledgerSlug(day))
}
