/**
 * The arithmetic behind /numbers, the dashboard (decisions.md, "Never": the
 * one dashboard). Pure: no database, no clock. lib/numbers-load.ts runs the
 * SELECTs and hands the rows to `shapeNumbers`; the page hands the result to
 * `readNumbers` for the period the person picked.
 *
 * Every figure is stated against the person's own usual (docs/vision.md). A
 * usual is the median of the complete rolling weeks before the window, never
 * a total and never anybody else's number. With fewer than `MIN_WEEKS` of
 * those weeks the page says "Needs 3 weeks" instead of a number.
 *
 * Depth (replies, who came back) comes before Volume (posts, views per post).
 * There is no follower count, no bare total of views and no colour for good
 * or bad: above or below the usual is said in words.
 */

/* ── Shapes ─────────────────────────────────────────────────────────── */

export type Period = "7" | "30" | "90"
export const PERIODS = ["7", "30", "90"] as const
export const PERIOD_DAYS: Record<Period, number> = { "7": 7, "30": 30, "90": 90 }
export const PERIOD_OPTIONS = [
  { value: "7" as const, label: "7 days" },
  { value: "30" as const, label: "30 days" },
  { value: "90" as const, label: "90 days" },
]
export const DEFAULT_PERIOD: Period = "30"

/** Weeks behind the window before a usual is stated. */
export const MIN_WEEKS = 3
/** Up to this many weeks before the window make the usual. */
const BASELINE_WEEKS = 12
/** Weeks drawn in a tile's sparkline and the trend panel. */
const TRACK_WEEKS = 16
/** A median post needs at least this many posts behind the window. */
const MIN_POSTS_FOR_MEDIAN = 3

export type Post = {
  /** The platform's own id (post_metric.external_id). */
  id: string
  /** The opening line, or a plain stand-in when Quincy has no text for it. */
  hook: string
  /** The whole post. Null: measured, but the text is not in Quincy yet. */
  body: string | null
  /** Days before today it was first measured (0 is today). Null: out before the readings began. */
  day: number | null
  views: number
  replies: number
  likes: number
  reposts: number
  bookmarks: number
  /** Views by morning since the first reading, up to 14 mornings. */
  climb: number[]
  /** Ids of the people who replied. Empty until who replied is read (`Person`). */
  repliers: string[]
}

/**
 * Someone who replied. Nothing fills this yet: who replied is not stored.
 * The seam is `readRepliers` in lib/numbers-load.ts, which a future
 * `x:replies` read (its own ceiling and cooldown, AGENTS.md "Money") fills.
 */
export type Person = {
  id: string
  name: string
  handle: string
  /** Days before today of each reply. */
  replyDays: number[]
  /** You answered their latest reply. */
  answered: boolean
}

/** One rolling week of Quincy's work. Index 0 is the 7 days ending today. */
export type QuincyWeek = {
  /** Saved posts read (x-bookmark). */
  read: number
  drafted: number
  approved: number
  /** Went out: `usage_event` `x:post`. */
  posted: number
  /** Micro-dollars, from usage_event. */
  costMicros: number
}

export type NumbersData = {
  /** Today, as an ISO date (UTC). Every day number counts back from it. */
  today: string
  /** An active X connection. */
  connected: boolean
  /** Complete weeks of readings behind today. */
  historyWeeks: number
  posts: Post[]
  /** Null: who replied is not read yet. */
  people: Person[] | null
  quincy: QuincyWeek[]
  /** The newest reading's day (ISO date), or null when nothing was ever read. */
  lastRead: string | null
  /** Facts about the data the page states rather than hides. */
  notes: string[]
}

/* ── Dates ──────────────────────────────────────────────────────────── */

const DAY = 86_400_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/** "Nov 3": `daysAgo` days before `today`. */
export function dayLabel(today: string, daysAgo: number): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** "Nov 10 – 16": the rolling week `w` (0 = the 7 days ending today). */
export function weekLabel(today: string, w: number): string {
  const end = dayLabel(today, w * 7)
  const start = dayLabel(today, w * 7 + 6)
  const [sm, sd] = start.split(" ")
  const [em, ed] = end.split(" ")
  return sm === em ? `${sm} ${sd} – ${ed}` : `${start} – ${em} ${ed}`
}

/* ── Arithmetic ─────────────────────────────────────────────────────── */

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
}

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US")

export function formatMultiple(m: number): string {
  if (!Number.isFinite(m)) return "—"
  if (m >= 10) return `${Math.round(m)}×`
  if (m >= 1) return `${m.toFixed(1)}×`
  return `${m.toFixed(2)}×`
}

export const dollars = (micros: number) => `$${(micros / 1e6).toFixed(2)}`

/** A usual, said: one decimal under 10, whole above. */
export function roundUsual(u: number): string {
  return u < 10 ? (Math.round(u * 10) / 10).toLocaleString("en-US") : fmt(u)
}

/* ── The read the page draws ────────────────────────────────────────── */

export type Measure = "replies" | "people" | "posts" | "reach"

export type Baseline = {
  /** Null: fewer than `MIN_WEEKS` complete weeks behind the window. */
  usual: number | null
  /** How many weeks the usual stands on. */
  weeks: number
}

export type Tile = {
  measure: Measure
  label: string
  /** Depth or Volume: Depth comes first on the page. */
  kind: "depth" | "volume"
  /** Null: not read yet (Came back), or nothing to take a median of. */
  value: number | null
  baseline: Baseline
  /** One value per rolling week, oldest first, for the sparkline and the trend. */
  weekly: (number | null)[]
  /** How a value is said: "9 replies". */
  say: (n: number) => string
  /** The unit, for the usual sentence. */
  unit: string
  /** Set when the product cannot read this yet: why, in one line. */
  notRead?: string
}

export type Read = {
  period: Period
  days: number
  /** The rolling weeks drawn (oldest first); those `inWindow` are the period. */
  weeks: { w: number; label: string; inWindow: boolean }[]
  /** Replies, Came back, Posts, Views per post: Depth first. */
  tiles: Tile[]
  /** Your median post: the posts before the window. Null with too little history. */
  medianViews: number | null
  medianReplies: number | null
  /** Every post that went out in the window, against `medianViews`, newest first. */
  scored: { post: Post; multiple: number | null }[]
  people: { person: Person; inWindow: number; before: number; weeks: boolean[] }[] | null
  quincy: { now: QuincyWeek; usual: QuincyWeek | null }
  enoughHistory: boolean
}

const weekOf = (day: number) => Math.floor(day / 7)

/**
 * The complete rolling weeks wholly before a window of `days`, at most
 * `BASELINE_WEEKS` of them, that the history covers. Rolling week `w` is
 * days 7w … 7w+6 before today; it is complete when `w < historyWeeks`.
 */
export function weeksBefore(days: number, historyWeeks: number): number[] {
  const first = Math.ceil(days / 7)
  const out: number[] = []
  for (let w = first; w < Math.min(Math.max(0, historyWeeks), first + BASELINE_WEEKS); w++) out.push(w)
  return out
}

/**
 * The usual for a window of `days`: the median of the weekly values over
 * the complete weeks before it, scaled to the window ("2 a week" is 8.6 in
 * 30 days). Null below `minWeeks` weeks.
 */
export function usualOf(perWeek: (w: number) => number, days: number, historyWeeks: number, minWeeks = MIN_WEEKS): Baseline {
  const before = weeksBefore(days, historyWeeks)
  if (before.length < minWeeks) return { usual: null, weeks: before.length }
  return { usual: median(before.map(perWeek)) * (days / 7), weeks: before.length }
}

export function readNumbers(data: NumbersData, period: Period, minWeeks = MIN_WEEKS): Read {
  const days = PERIOD_DAYS[period]
  const windowWeeks = Math.ceil(days / 7)
  const histWeeks = Math.max(0, data.historyWeeks)
  const beforeWeeks = weeksBefore(days, histWeeks)
  const enoughHistory = beforeWeeks.length >= minWeeks

  const dated = data.posts.filter((p): p is Post & { day: number } => p.day !== null)
  const inWindow = dated.filter((p) => p.day < days).sort((a, b) => a.day - b.day)
  const before = data.posts.filter((p) => p.day === null || p.day >= days)

  const hasMedian = enoughHistory && before.length >= MIN_POSTS_FOR_MEDIAN
  const medianViews = hasMedian ? median(before.map((p) => p.views)) : null
  const medianReplies = hasMedian ? median(before.map((p) => p.replies)) : null

  const shown = Math.min(Math.max(TRACK_WEEKS, windowWeeks + 8), Math.max(histWeeks, windowWeeks))
  const weeks = Array.from({ length: shown }, (_, i) => {
    const w = shown - 1 - i
    return { w, label: weekLabel(data.today, w), inWindow: w < windowWeeks }
  })

  const postsIn = (w: number) => dated.filter((p) => weekOf(p.day) === w)
  const perWeek = (f: (w: number) => number | null) => weeks.map(({ w }) => (w < Math.max(histWeeks, windowWeeks) ? f(w) : null))
  const baselineOf = (f: (w: number) => number) => usualOf(f, days, histWeeks, minWeeks)

  const repliesIn = (w: number) => postsIn(w).reduce((s, p) => s + p.replies, 0)
  const countIn = (w: number) => postsIn(w).length
  const reachIn = (w: number) => {
    const ps = postsIn(w)
    return ps.length ? median(ps.map((p) => p.views)) : null
  }

  const people = data.people
  /** People who replied in week w and also in some week before it. */
  const backIn = (w: number) =>
    people ? people.filter((p) => p.replyDays.some((d) => weekOf(d) === w) && p.replyDays.some((d) => weekOf(d) > w)).length : 0

  const tiles: Tile[] = [
    {
      measure: "replies",
      label: "Replies",
      kind: "depth",
      value: inWindow.reduce((s, p) => s + p.replies, 0),
      baseline: baselineOf(repliesIn),
      weekly: perWeek(repliesIn),
      say: (n) => `${fmt(n)} ${n === 1 ? "reply" : "replies"}`,
      unit: "replies",
    },
    people
      ? {
          measure: "people",
          label: "Came back",
          kind: "depth",
          value: people.filter((p) => p.replyDays.some((d) => d < days) && p.replyDays.some((d) => d >= days)).length,
          baseline: baselineOf(backIn),
          weekly: perWeek(backIn),
          say: (n) => `${fmt(n)} ${n === 1 ? "person" : "people"}`,
          unit: "people",
        }
      : {
          measure: "people",
          label: "Came back",
          kind: "depth",
          value: null,
          baseline: { usual: null, weeks: 0 },
          weekly: weeks.map(() => null),
          say: (n) => `${fmt(n)} ${n === 1 ? "person" : "people"}`,
          unit: "people",
          notRead: "I count replies. Who wrote them isn't read yet.",
        },
    {
      measure: "posts",
      label: "Posts",
      kind: "volume",
      value: inWindow.length,
      baseline: baselineOf(countIn),
      weekly: perWeek(countIn),
      say: (n) => `${fmt(n)} ${n === 1 ? "post" : "posts"}`,
      unit: "posts",
    },
    {
      measure: "reach",
      label: "Views per post",
      kind: "volume",
      value: inWindow.length ? median(inWindow.map((p) => p.views)) : null,
      // A median per post, so its usual is your median post, not scaled by days.
      baseline: { usual: medianViews, weeks: beforeWeeks.length },
      weekly: perWeek(reachIn),
      say: (n) => `${fmt(n)} views`,
      unit: "views",
    },
  ]

  const scored = inWindow.map((post) => ({ post, multiple: medianViews ? post.views / medianViews : null }))

  const peopleRead = people
    ? people
        .map((person) => ({
          person,
          inWindow: person.replyDays.filter((d) => d < days).length,
          before: person.replyDays.filter((d) => d >= days).length,
          weeks: Array.from({ length: 8 }, (_, i) => person.replyDays.some((d) => weekOf(d) === 7 - i)),
        }))
        .filter((r) => r.inWindow > 0)
        .sort((a, b) => b.inWindow + b.before - (a.inWindow + a.before))
    : null

  const sumQ = (ws: QuincyWeek[]): QuincyWeek => ({
    read: ws.reduce((s, q) => s + q.read, 0),
    drafted: ws.reduce((s, q) => s + q.drafted, 0),
    approved: ws.reduce((s, q) => s + q.approved, 0),
    posted: ws.reduce((s, q) => s + q.posted, 0),
    costMicros: ws.reduce((s, q) => s + q.costMicros, 0),
  })
  // A 30-day window is 30 days of work, not five whole weeks of it.
  const nowQ = sumQ(data.quincy.slice(0, windowWeeks))
  const beforeQ = beforeWeeks.map((w) => data.quincy[w]).filter((q): q is QuincyWeek => q != null)
  const scale = days / 7
  const usualQ: QuincyWeek | null =
    enoughHistory && beforeQ.length
      ? {
          read: median(beforeQ.map((q) => q.read)) * scale,
          drafted: median(beforeQ.map((q) => q.drafted)) * scale,
          approved: median(beforeQ.map((q) => q.approved)) * scale,
          posted: median(beforeQ.map((q) => q.posted)) * scale,
          costMicros: median(beforeQ.map((q) => q.costMicros)) * scale,
        }
      : null

  return {
    period,
    days,
    weeks,
    tiles,
    medianViews,
    medianReplies,
    scored,
    people: peopleRead,
    quincy: { now: nowQ, usual: usualQ },
    enoughHistory,
  }
}

/** A tile's usual per week, for its sparkline and the trend's line. Reach is already per post. */
export function usualPerWeek(t: Tile, days: number): number | null {
  if (t.baseline.usual === null) return null
  return t.measure === "reach" ? t.baseline.usual : t.baseline.usual / (days / 7)
}

/* ── Sentences ──────────────────────────────────────────────────────── */

export function needsWeeks(minWeeks = MIN_WEEKS) {
  return `Needs ${minWeeks} weeks before I can say what's usual.`
}

/** The sentence under a value: where it stands against the usual, in words. */
export function againstUsual(value: number, usual: number | null, unit: string, days: number, minWeeks = MIN_WEEKS): string {
  if (usual === null) return needsWeeks(minWeeks)
  const usualText = `${roundUsual(usual)}${days === 7 ? " a week" : ` in ${days} days`}`
  if (usual <= 0) return value > 0 ? `Usually none. Your usual is 0 ${unit}.` : "About your usual."
  const m = value / usual
  if (m >= 0.9 && m <= 1.1) return `About your usual, ${usualText}.`
  if (m > 1) return `${formatMultiple(m)} your usual ${usualText}.`
  return `Under your usual ${usualText}.`
}

/** The reach sentence: a multiple of your median post. */
export function againstMedianPost(value: number, medianViews: number | null, minWeeks = MIN_WEEKS): string {
  if (medianViews === null) return `Needs ${minWeeks} weeks before there's a median post.`
  const m = value / medianViews
  if (m >= 0.95 && m <= 1.05) return `About your median post, ${fmt(medianViews)}.`
  return `${formatMultiple(m)} your median post, ${fmt(medianViews)}.`
}

/* ── Dashboard → Table ──────────────────────────────────────────────── */

/** Which posts Table shows: every post, those with replies, or those someone came back to. */
export type Show = "all" | "replies" | "returning"
export type Order = "newest" | "best" | "replies"
export type Against = "any" | "above" | "below" | "outlier"
export const SHOWS = ["all", "replies", "returning"] as const
export const ORDERS = ["newest", "best", "replies"] as const
export const AGAINSTS = ["any", "above", "below", "outlier"] as const

/** Table's state, mirrored into the URL (`?view=table&post=…&show=…&order=…&against=…`). */
export type TableState = { post: string | null; show: Show; order: Order; against: Against }

/** A tile, said as the Table it opens. */
export const TABLE_FOR: Record<Measure, Pick<TableState, "show" | "order">> = {
  replies: { show: "replies", order: "replies" },
  people: { show: "returning", order: "newest" },
  posts: { show: "all", order: "newest" },
  reach: { show: "all", order: "best" },
}

/* ── Rows → NumbersData (lib/numbers-load.ts runs the SELECTs) ──────── */

/** How far back the page reads. */
export const HISTORY_DAYS = 26 * 7

export type Reading = {
  externalId: string
  sourceItemId: string
  capturedAt: Date
  impressions: number
  replies: number
  likes: number
  reposts: number
  bookmarks: number
}

export type ShapeInput = {
  now: Date
  /** post_metric rows, any order. */
  readings: Reading[]
  /** source_item.body by id, for the readings that point at one. */
  bodies: Map<string, string>
  connected: boolean
  /** usage_event rows: cost, and `x:post` for what went out. */
  usage: { model: string; createdAt: Date; costMicros: number }[]
  /** draft.created_at. */
  drafted: Date[]
  /** draft_version.approved_at. */
  approved: Date[]
  /** source_item x-bookmark created_at. */
  read: Date[]
  /** Who replied: null until it is read (lib/numbers-load.ts, `readRepliers`). */
  people: Person[] | null
}

/** The opening line of a post, without the t.co links X appends. */
export function hookOf(body: string): string {
  return body.split("\n")[0]!.replace(/(?:https?:\/\/t\.co\/\S*\s*)+$/, "").trim()
}

/**
 * The rows, in the page's shape. What it cannot know, it says:
 * - A post's day is the day it was first measured. Posts that were already
 *   out when the readings began (the first capture day) have no day, so
 *   they count toward the median and not toward a week.
 * - A post the corpus import has not caught up with has no text; its hook
 *   says so.
 */
export function shapeNumbers(input: ShapeInput): NumbersData {
  const today = utcDay(input.now)
  const daysAgo = (d: Date) => Math.round((today - utcDay(d)) / DAY)
  const todayIso = new Date(today).toISOString().slice(0, 10)

  const readings = [...input.readings].sort(
    (a, b) => a.externalId.localeCompare(b.externalId) || a.capturedAt.getTime() - b.capturedAt.getTime(),
  )
  const byPost = new Map<string, Reading[]>()
  for (const r of readings) {
    const list = byPost.get(r.externalId)
    if (list) list.push(r)
    else byPost.set(r.externalId, [r])
  }
  let firstCapture: number | null = null
  let lastCapture: number | null = null
  for (const r of readings) {
    const d = utcDay(r.capturedAt)
    if (firstCapture === null || d < firstCapture) firstCapture = d
    if (lastCapture === null || d > lastCapture) lastCapture = d
  }

  const posts: Post[] = []
  let undated = 0
  let textless = 0
  for (const [externalId, rs] of byPost) {
    const first = rs[0]!
    const last = rs[rs.length - 1]!
    const startedWithSeries = firstCapture !== null && utcDay(first.capturedAt) === firstCapture
    if (startedWithSeries) undated++
    const withBody = rs.find((r) => r.sourceItemId && input.bodies.has(r.sourceItemId))
    const text = withBody ? input.bodies.get(withBody.sourceItemId)! : null
    if (!text) textless++
    const day = startedWithSeries ? null : daysAgo(first.capturedAt)
    posts.push({
      id: externalId,
      hook: text ? hookOf(text) || "A post on X" : `A post on X, first measured ${dayLabel(todayIso, daysAgo(first.capturedAt))}`,
      body: text,
      day,
      views: last.impressions,
      replies: last.replies,
      likes: last.likes,
      reposts: last.reposts,
      bookmarks: last.bookmarks,
      climb: rs.slice(0, 14).map((r) => r.impressions),
      repliers: [],
    })
  }

  const historyWeeks = firstCapture === null ? 0 : Math.max(0, Math.floor((today - firstCapture) / DAY / 7))
  const quincy: QuincyWeek[] = Array.from({ length: Math.max(historyWeeks, 1) }, () => ({
    read: 0,
    drafted: 0,
    approved: 0,
    posted: 0,
    costMicros: 0,
  }))
  const at = (d: Date) => quincy[Math.floor(daysAgo(d) / 7)]
  for (const u of input.usage) {
    const q = at(u.createdAt)
    if (!q) continue
    q.costMicros += u.costMicros
    if (u.model === "x:post") q.posted++
  }
  for (const d of input.drafted) {
    const q = at(d)
    if (q) q.drafted++
  }
  for (const d of input.approved) {
    const q = at(d)
    if (q) q.approved++
  }
  for (const d of input.read) {
    const q = at(d)
    if (q) q.read++
  }

  const notes: string[] = []
  if (undated > 0) {
    notes.push(
      `${undated} ${undated === 1 ? "post was" : "posts were"} already out when the readings began, so ${undated === 1 ? "it counts" : "they count"} toward your median and not toward a week.`,
    )
  }
  if (textless > 0) notes.push(`${textless} of ${posts.length} measured posts have no text in Quincy yet: the import has not caught up with them.`)

  return {
    today: todayIso,
    connected: input.connected,
    historyWeeks,
    posts,
    people: input.people,
    quincy,
    lastRead: lastCapture === null ? null : new Date(lastCapture).toISOString().slice(0, 10),
    notes,
  }
}

/** The toolbar's line: where the numbers come from and how fresh they are. */
export function freshness(data: NumbersData): string {
  if (data.lastRead === null) return "Against your own median. Nothing read yet."
  if (data.lastRead === data.today) return "Against your own median. Read this morning."
  const days = Math.round((Date.parse(`${data.today}T00:00:00Z`) - Date.parse(`${data.lastRead}T00:00:00Z`)) / DAY)
  return `Against your own median. Last read ${dayLabel(data.today, days)}.`
}

/** True when the morning read is more than a day behind. */
export function isStale(data: NumbersData): boolean {
  if (data.lastRead === null) return false
  return Date.parse(`${data.today}T00:00:00Z`) - Date.parse(`${data.lastRead}T00:00:00Z`) > DAY
}
