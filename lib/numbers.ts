import { and, eq, inArray, isNotNull } from "drizzle-orm"

import { db } from "./db"
import { scheduledPost, sourceItem } from "./schema-app"
import { calendarDayIn } from "./timezone"

/**
 * What actually landed, read backwards.
 *
 * The page this feeds is organised around **cause, not post**: a row is an
 * angle and the posts under it are the evidence. That is the promise the
 * surface has made since it was a placeholder — "so the next round starts from
 * what performed instead of from nothing" — and a ranked list of best posts
 * does not keep it. Knowing that one tweet did 69,560 tells you nothing you can
 * do again; knowing that every "I built X" opener clears 6× your median does.
 *
 * Two rules the numbers here obey:
 *
 * 1. **Every post is measured against you.** The unit is a multiple of your own
 *    median, never a raw impression count against somebody else's. A follower
 *    count is not a thing you control and comparing to one teaches nothing.
 * 2. **Nothing is pasted.** The median, the mean and every rollup are computed
 *    from the rows on each request. A constant here would go stale the first
 *    time an import ran and would lie in the most convincing way available —
 *    quietly, in a number nobody re-checks.
 */

/** A scored post: a `source_item` row that carried an impression count. */
export type ScoredPost = {
  id: string
  url: string
  /** The opening line, already cut to a readable length. */
  hook: string
  /** Formatted in the reader's zone by `getNumbers` — see the note there. */
  date: string
  impressions: number
  replies: number
  /** Multiple of the corpus median. 1 is exactly average for this account. */
  multiple: number
}

export type AngleRow = {
  id: string
  label: string
  note: string
  /** Median of the posts in this group, as a multiple of the corpus median. */
  medianMultiple: number
  posts: ScoredPost[]
}

/* ── The plot scale ───────────────────────────────────────────────────────
   One scale, in log2 of the multiple.

   The corpus spans 0.31× to 74×. A linear axis gives the best post the whole
   plot and renders the other 56 as a flat smear against the baseline, which is
   the opposite of the point — the page exists to show that most posts sit just
   under the line and a few carry everything. Log2 is the honest encoding for a
   ratio, and the reader is never shown a logarithm: every tick is labelled in
   multiples.

   Above and below the line share the same pixels-per-unit. Two scales meeting
   at a baseline would exaggerate one half, which is the classic way a diverging
   chart lies.
   ────────────────────────────────────────────────────────────────────────── */

export const UNIT_PX = 34
export const DOMAIN_UP = 6.3 // 2^6.3 ≈ 79×
export const DOMAIN_DOWN = -1.9 // 2^-1.9 ≈ 0.27×
export const PLOT_UP = Math.round(DOMAIN_UP * UNIT_PX)
export const PLOT_DOWN = Math.round(Math.abs(DOMAIN_DOWN) * UNIT_PX)
export const PLOT_H = PLOT_UP + PLOT_DOWN

export const TICKS = [
  { m: 64, v: 6 },
  { m: 16, v: 4 },
  { m: 4, v: 2 },
  { m: 1, v: 0 },
  { m: 0.5, v: -1 },
] as const

/** Distance in px from the baseline, clamped into the domain. */
export function barLength(multiple: number): number {
  if (!Number.isFinite(multiple) || multiple <= 0) return 0
  const v = Math.log2(multiple)
  const clamped = Math.max(DOMAIN_DOWN, Math.min(DOMAIN_UP, v))
  return Math.abs(clamped) * UNIT_PX
}

/**
 * True when the clamp above actually bit.
 *
 * A clamped bar and a bar that genuinely reached the ceiling are drawn
 * identically, and on a chart whose subject is outliers that is the one thing
 * the geometry must not imply. Nothing in the current corpus trips it — the
 * best post is 74× against a 79× ceiling — but a live query will find the post
 * that does, so the bar that hits it says so.
 */
export function isClipped(multiple: number): boolean {
  if (!Number.isFinite(multiple) || multiple <= 0) return false
  const v = Math.log2(multiple)
  return v > DOMAIN_UP || v < DOMAIN_DOWN
}

/** Beat your own median by 3× or better. */
export const OUTLIER_GATE = 3

export type NumbersView = {
  /** Posts that carried a number and were scored. */
  scored: number
  /**
   * Rows that had no impression count and were left out.
   *
   * Surfaced rather than swallowed: an archive import carries bodies without
   * `public_metrics`, and a page that silently drops a third of the corpus
   * while claiming "57 posts" is wrong in a way the reader cannot detect.
   */
  skipped: number
  median: number
  mean: number
  /** Formatted bounds of the window the numbers cover. */
  from: string | null
  to: string | null
  /** The same bounds as bare months, for the two ends of the plot's axis. */
  fromAxis: string | null
  toAxis: string | null
  /**
   * Every scored post oldest first — the order the plot is drawn in, and the
   * order its table twin repeats. A table sorted differently from the chart it
   * replaces is a second dataset wearing the first one's toggle.
   */
  byDate: ScoredPost[]
  /** Cleared `OUTLIER_GATE`. The few posts carrying the rest. */
  outliers: number
  /** Landed under your own median. */
  below: number
  /** The best multiple in the corpus, for the third stat. */
  best: number
  /**
   * Link replies that landed under the line.
   *
   * The prototype asserted "six of them" in prose. Derived here instead: the
   * sentence is about the corpus, and a corpus that changes under a hardcoded
   * number makes the page lie in the most convincing way available.
   */
  linkRepliesBelow: number
  rows: AngleRow[]
  /**
   * True while the angles are read off the writing rather than off a real
   * `riff_angle` → post edge. See `ANGLES`.
   */
  inferred: boolean
}

/* ── The pure layer ───────────────────────────────────────────────────────
   Everything below is a function of its arguments, so lib/numbers.test.ts can
   pin the arithmetic against values taken from the database without standing a
   database up.
   ────────────────────────────────────────────────────────────────────────── */

/** Sorted-middle, averaging the pair on an even count. Empty is 0, not NaN. */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

/**
 * The impression count out of the platform's own blob.
 *
 * `source_item.meta` is stored verbatim and is never parsed for logic — the
 * rule the schema states at the column. Reading it here is the exception that
 * rule anticipates, so it is done defensively rather than with a cast: X has
 * changed the shape of `public_metrics` before, an archive import writes no
 * metrics at all, and a `Number(undefined)` reaching the median would poison
 * every multiple on the page with NaN.
 *
 * Returns null for "this row cannot be scored", which the caller counts rather
 * than hides. Zero is a real answer and is kept.
 */
export function impressionsOf(meta: unknown): number | null {
  if (typeof meta !== "object" || meta === null) return null
  const metrics = (meta as Record<string, unknown>).public_metrics
  if (typeof metrics !== "object" || metrics === null) return null
  const raw = (metrics as Record<string, unknown>).impression_count
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null
  return raw
}

/** Same treatment for the metrics that are decoration rather than the subject. */
export function metricOf(meta: unknown, key: string): number {
  if (typeof meta !== "object" || meta === null) return 0
  const metrics = (meta as Record<string, unknown>).public_metrics
  if (typeof metrics !== "object" || metrics === null) return 0
  const raw = (metrics as Record<string, unknown>)[key]
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 0
}

/**
 * The first line — the only part of a post the algorithm judges before someone
 * decides whether to keep reading, which makes it the only part worth setting
 * at reading size on a page about what performed.
 *
 * Two cleanups, both required by what is actually in the column rather than by
 * taste. The exploration at /prototypes/numbers ran on a hand-copied fixture
 * and neither showed up there:
 *
 * - **X escapes the body.** `&`, `<` and `>` arrive as HTML entities, so a post
 *   reading "Lucide -> Hugeicons" renders as "Lucide -&gt; Hugeicons".
 * - **X appends its own shortlink.** 43 of the 57 rows in this corpus carry a
 *   `t.co` URL, 9 of them at the end of the opening line — 23 characters of
 *   machine noise sitting in the middle of the one sentence this page sets at
 *   reading size.
 *
 * Only *trailing* links are stripped. A link mid-sentence is load-bearing
 * grammar, and cutting it would leave a hole in the line.
 */
export function hook(body: string, cap = 90): string {
  const first = decodeEntities(body).split("\n")[0]
  const stripped = first.replace(/(?:https?:\/\/t\.co\/\S*\s*)+$/, "").trim()
  // A post whose opening line is nothing but a link has no hook to show, and an
  // empty cell reads as a failed load. Nothing in the corpus does this today; a
  // live import eventually will, so it falls back to the raw line.
  const line = stripped.length > 0 ? stripped : first.trim()
  return line.length > cap ? `${line.slice(0, cap).trimEnd()}…` : line
}

/**
 * The three entities X escapes, and only those.
 *
 * Not a general HTML decoder: this text is rendered by React as a text node,
 * never as markup, so the job is to undo one specific sender's escaping rather
 * than to interpret HTML. `&amp;` is unwound last, otherwise "&amp;gt;" — a
 * literal ampersand the user typed — would turn into ">".
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/**
 * Multiples, not percentages, and never more precision than the number earns.
 * "6.2×" is a fact about your writing; "617.4%" is arithmetic homework.
 */
export function formatMultiple(m: number): string {
  if (!Number.isFinite(m)) return "—"
  if (m >= 10) return `${Math.round(m)}×`
  if (m >= 1) return `${m.toFixed(1)}×`
  return `${m.toFixed(2)}×`
}

/**
 * Hook archetypes, derived from the writing rather than declared.
 *
 * This is the honest stand-in for `riff_angle`. Until Quincy has published
 * something there is no angle → post edge to read, so the same question gets
 * asked of data that exists: what shape was the opening line, and did that
 * shape land? The page says so in as many words rather than implying the join
 * is live. When a riff does produce a post the inference is replaced by the
 * join and nothing about the layout changes.
 *
 * Order is load-bearing — `angleOf` takes the first match, and a post can open
 * as both a build reveal and a question. Reveal wins because it is the claim
 * being tested.
 */
export type Angle = {
  id: string
  label: string
  note: string
  test: (body: string) => boolean
}

export const ANGLES: Angle[] = [
  {
    id: "build-reveal",
    label: "Build reveal",
    note: "“I built X” with the shock emoji and a numbered teardown",
    test: (b) =>
      /^(i (built|just built)|you can build|this made me|somebody is going to)/i.test(
        b
      ),
  },
  {
    id: "story",
    label: "Story with a name in it",
    note: "A named person or company carries the anecdote",
    test: (b) => /^(story time|i just sold|i launched \d+|i sold)/i.test(b),
  },
  {
    id: "ask",
    label: "Open question",
    note: "Asks the timeline for names, tools or advice",
    test: (b) =>
      /\?/.test(b.split("\n")[0]) ||
      /^(looking for|who is|does anybody|anybody else)/i.test(b),
  },
  {
    id: "link-reply",
    label: "Link in a reply",
    note: "The repo, demo or signup link hung under a thread",
    test: (b) =>
      /^(repo|demo|test it here|to get updates|if you want updates)/i.test(b),
  },
  {
    id: "opinion",
    label: "Opinion or principle",
    note: "A position stated flat, no artefact attached",
    test: (b) =>
      /^(my two cents|the cofounder|been thinking|my prediction|sadly true|if you started|prediction:)/i.test(
        b
      ),
  },
]

export function angleOf(body: string): Angle | null {
  return ANGLES.find((a) => a.test(body)) ?? null
}

/**
 * Groups the corpus by angle and scores each group by its own median.
 *
 * Median rather than mean, and for the reason the whole page exists: one 74×
 * post inside a group of five would drag that group's mean to 15× and present
 * a one-off as a repeatable angle. The median answers the question actually
 * being asked — "if I write this shape again, what should I expect?"
 *
 * Sorted best-first, with "Unfiled" pinned to the bottom regardless of its
 * score. It is a residue bucket, not an angle, and letting it sort to the top
 * would recommend "write something that matches none of these" as a strategy.
 */
export function rollupByAngle(
  posts: ScoredPost[],
  bodies: Map<string, string>
): AngleRow[] {
  const buckets = new Map<string, ScoredPost[]>()
  const loose: ScoredPost[] = []

  for (const post of posts) {
    const angle = angleOf(bodies.get(post.id) ?? post.hook)
    if (!angle) {
      loose.push(post)
      continue
    }
    const existing = buckets.get(angle.id)
    if (existing) existing.push(post)
    else buckets.set(angle.id, [post])
  }

  const byReach = (a: ScoredPost, b: ScoredPost) => b.impressions - a.impressions

  const rows: AngleRow[] = []
  for (const angle of ANGLES) {
    const group = buckets.get(angle.id)
    if (!group || group.length === 0) continue
    rows.push({
      id: angle.id,
      label: angle.label,
      note: angle.note,
      medianMultiple: medianMultipleOf(group),
      posts: [...group].sort(byReach),
    })
  }

  rows.sort((a, b) => b.medianMultiple - a.medianMultiple)

  if (loose.length > 0) {
    rows.push({
      id: "unfiled",
      label: "Unfiled",
      note: "No angle matched. Quincy did not draft these, so nothing claims them",
      medianMultiple: medianMultipleOf(loose),
      posts: [...loose].sort(byReach),
    })
  }

  return rows
}

/**
 * The group's median multiple.
 *
 * Computed from the multiples rather than by taking a median impression count
 * and dividing: with an even-sized group the two are not the same number, and
 * the one the reader can check against the rows below is this one.
 */
function medianMultipleOf(group: ScoredPost[]): number {
  const sorted = [...group].map((p) => p.multiple).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * The two angles the closing sentence compares.
 *
 * Both can be absent — an empty corpus, or one where nothing matched — and the
 * caller renders no sentence rather than an empty one. "Unfiled" is excluded
 * from both ends: naming a residue bucket as the angle that works would be a
 * claim about nothing.
 */
export function endsOf(rows: AngleRow[]): {
  best: AngleRow | null
  worst: AngleRow | null
} {
  const named = rows.filter((r) => r.id !== "unfiled")
  return {
    best: named.length > 0 ? named[0] : null,
    worst: named.length > 1 ? named[named.length - 1] : null,
  }
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * Dates are formatted on the server, in the reader's zone, and shipped as
 * strings.
 *
 * Handing a `Date` to the client component and formatting it there renders one
 * day on the server and possibly another in the browser, which React reports as
 * a hydration mismatch and a reader reports as the wrong date. See lib/timezone.
 */
export function formatPostDate(at: Date, zone: string, showYear: boolean) {
  const day = calendarDayIn(at, zone)
  return `${MONTHS[day.month - 1]} ${day.day}${showYear ? ` ${day.year}` : ""}`
}

/** Month and year alone, for the two ends of the plot's time axis. */
export function formatMonth(at: Date, zone: string) {
  const day = calendarDayIn(at, zone)
  return `${MONTHS[day.month - 1]} ${day.year}`
}

/* ── The read ─────────────────────────────────────────────────────────────── */

/**
 * `x-archive` is read alongside `x` deliberately: it is the same account's own
 * writing, and excluding it would compute a median over the recent months only
 * and then present it as "your median". Bookmarks and Circleback are somebody
 * else's words or a spoken sentence, and neither is a post that landed.
 */
const SOURCES = ["x", "x-archive"] as const

export async function getNumbers(
  userId: string,
  zone: string
): Promise<NumbersView> {
  const [rows, published] = await Promise.all([
    db
      .select({
        id: sourceItem.id,
        url: sourceItem.url,
        body: sourceItem.body,
        postedAt: sourceItem.postedAt,
        meta: sourceItem.meta,
      })
      .from(sourceItem)
      .where(
        and(
          eq(sourceItem.userId, userId),
          inArray(sourceItem.source, [...SOURCES]),
          // A row with no publication date cannot be placed in the window the
          // page claims to cover, and the column is nullable.
          isNotNull(sourceItem.postedAt)
        )
      ),
    db
      .select({ id: scheduledPost.id })
      .from(scheduledPost)
      .where(
        and(
          eq(scheduledPost.userId, userId),
          eq(scheduledPost.state, "published")
        )
      )
      .limit(1),
  ])

  const dated = rows
    .filter((r): r is typeof r & { postedAt: Date } => r.postedAt !== null)
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())

  const withMetrics = dated
    .map((r) => ({ ...r, impressions: impressionsOf(r.meta) }))
    .filter((r): r is typeof r & { impressions: number } => r.impressions !== null)

  const skipped = dated.length - withMetrics.length
  const middle = median(withMetrics.map((r) => r.impressions))
  const mean =
    withMetrics.length === 0
      ? 0
      : Math.round(
          withMetrics.reduce((sum, r) => sum + r.impressions, 0) /
            withMetrics.length
        )

  // Years are shown only when the window crosses one, so a corpus inside a
  // single year is not stamped with a redundant "2026" on all 57 rows.
  const years = new Set(withMetrics.map((r) => calendarDayIn(r.postedAt, zone).year))
  const showYear = years.size > 1

  // `middle` is 0 when nothing scored, and dividing by it would put Infinity in
  // every multiple. The caller renders the empty state on `scored === 0`, so
  // this only has to avoid poisoning the array on the way there.
  const scored: ScoredPost[] = withMetrics.map((r) => ({
    id: r.id,
    url: r.url,
    hook: hook(r.body, 110),
    date: formatPostDate(r.postedAt, zone, showYear),
    impressions: r.impressions,
    replies: metricOf(r.meta, "reply_count"),
    multiple: middle > 0 ? r.impressions / middle : 0,
  }))

  const bodies = new Map(withMetrics.map((r) => [r.id, r.body]))
  // `withMetrics` is newest first; the plot reads left to right in time.
  const byDate = [...scored].reverse()
  const oldest = withMetrics.at(-1)
  const newest = withMetrics.at(0)

  const linkRepliesBelow = withMetrics.filter(
    (r) =>
      angleOf(r.body)?.id === "link-reply" && middle > 0 && r.impressions < middle
  ).length

  return {
    scored: scored.length,
    skipped,
    median: middle,
    mean,
    from: oldest ? formatPostDate(oldest.postedAt, zone, true) : null,
    to: newest ? formatPostDate(newest.postedAt, zone, true) : null,
    fromAxis: oldest ? formatMonth(oldest.postedAt, zone) : null,
    toAxis: newest ? formatMonth(newest.postedAt, zone) : null,
    byDate,
    outliers: scored.filter((p) => p.multiple >= OUTLIER_GATE).length,
    below: scored.filter((p) => p.multiple < 1).length,
    best: scored.reduce((max, p) => Math.max(max, p.multiple), 0),
    linkRepliesBelow,
    rows: rollupByAngle(scored, bodies),
    inferred: published.length === 0,
  }
}
