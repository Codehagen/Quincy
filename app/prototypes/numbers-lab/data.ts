/**
 * The Numbers lab's data: one shape for the fixtures and for the signed-in
 * account's own rows (load-real.ts), and the arithmetic every layout reads
 * through, so the three directions can never disagree about a number.
 *
 * Every figure is stated against the person's own baseline (docs/vision.md).
 * A baseline is the median of the weeks before the window, never a total
 * and never anybody else's number. With fewer than `minWeeks` weeks behind
 * the window there is no baseline, and the layouts say "needs 3 weeks"
 * instead of a number.
 *
 * The fixtures are fictional text in the real account's shapes (DECISION.md,
 * "Real numbers"): about three posts a week, a median post near 700 views, a
 * p90 near 4,000 and one post near 21,000; a median of one reply, 46% of
 * posts with none, at most 11; 84% of a post's views arrive on day one.
 */

/* ── Shapes ─────────────────────────────────────────────────────────── */

export type Period = "7" | "30" | "90"
export const PERIOD_DAYS: Record<Period, number> = { "7": 7, "30": 30, "90": 90 }
export const PERIOD_OPTIONS = [
  { value: "7" as const, label: "7 days" },
  { value: "30" as const, label: "30 days" },
  { value: "90" as const, label: "90 days" },
]

export type Post = {
  id: string
  /** The opening line, or a plain stand-in when Quincy has no text for it. */
  hook: string
  /** The whole post. Null: measured, but the text is not in Quincy yet. */
  body: string | null
  /** Days before today it went out (0 is today). Null: out before reading began. */
  day: number | null
  views: number
  replies: number
  likes: number
  reposts: number
  bookmarks: number
  /** Views by day since the first reading, cumulative, up to 14 days. */
  climb: number[]
  /** Quincy drafted it and you approved it. */
  fromQuincy: boolean
  /** People (ids) who replied. Empty on the real view: not read yet (proposed). */
  repliers: string[]
}

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
  /** Bookmarks and posts read. */
  read: number
  drafted: number
  approved: number
  /** Went out through Quincy. */
  posted: number
  /** Micro-dollars, from usage_event. */
  costMicros: number
}

export type NumbersData = {
  source: "fixtures" | "yours"
  /** Today, as an ISO date (UTC). Every day number counts back from it. */
  today: string
  connected: boolean
  /** Weeks of measured history behind today. */
  historyWeeks: number
  posts: Post[]
  /** Null: the product cannot read who replied yet (proposed). */
  people: Person[] | null
  quincy: QuincyWeek[]
  /** The last morning read, said as words. */
  lastRead: string
  /** Facts the real view states rather than hides. */
  notes: string[]
}

/* ── Dates ──────────────────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

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

export function compact(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`
  return fmt(n)
}

export function formatMultiple(m: number): string {
  if (!Number.isFinite(m)) return "—"
  if (m >= 10) return `${Math.round(m)}×`
  if (m >= 1) return `${m.toFixed(1)}×`
  return `${m.toFixed(2)}×`
}

export const dollars = (micros: number) => `$${(micros / 1e6).toFixed(2)}`

/* ── The read every layout shares ───────────────────────────────────── */

export type Measure = "replies" | "people" | "posts" | "reach"

export type Baseline = {
  /** Null: fewer than `minWeeks` weeks behind the window. */
  usual: number | null
  /** How many weeks the baseline stands on. */
  weeks: number
}

export type Tile = {
  measure: Measure
  label: string
  /** Depth or Volume: the order on the page is Depth first. */
  kind: "depth" | "volume"
  /** Null: the product cannot compute it yet (proposed). */
  value: number | null
  baseline: Baseline
  /** One value per rolling week, oldest first, for the sparkline and the trend. */
  weekly: (number | null)[]
  /** How the value is said: "9 replies". */
  say: (n: number) => string
  /** "a week" values, for the usual sentence. */
  unit: string
  proposed?: string
}

export type Read = {
  period: Period
  days: number
  /** The rolling weeks drawn (oldest first); the last `inWindow` are the window. */
  weeks: { w: number; label: string; inWindow: boolean }[]
  tiles: Tile[]
  /** Posts that went out in the window, newest first. */
  inWindow: Post[]
  /** Your median post: the posts before the window. Null with too little history. */
  medianViews: number | null
  medianReplies: number | null
  /** Every post with a day, against `medianViews`. */
  scored: { post: Post; multiple: number | null }[]
  people: { person: Person; inWindow: number; before: number; weeks: boolean[] }[] | null
  quincy: { now: QuincyWeek; usual: QuincyWeek | null }
  enoughHistory: boolean
}

const TRACK_WEEKS = 16
const BASELINE_WEEKS = 12

function weekOf(day: number) {
  return Math.floor(day / 7)
}

/**
 * The window is the last `days` days; the baseline is the median of the up
 * to twelve rolling weeks wholly before it, scaled to the window's length.
 * "You usually get 2 a week" is the sentence; 30 days of it is 8.6.
 */
export function readNumbers(data: NumbersData, period: Period, minWeeks: number): Read {
  const days = PERIOD_DAYS[period]
  const windowWeeks = Math.ceil(days / 7)
  const firstBefore = Math.ceil(days / 7) // the first rolling week wholly before the window
  const histWeeks = Math.max(0, data.historyWeeks)
  const beforeWeeks: number[] = []
  for (let w = firstBefore; w < Math.min(histWeeks, firstBefore + BASELINE_WEEKS); w++) beforeWeeks.push(w)
  const enoughHistory = beforeWeeks.length >= minWeeks

  const dated = data.posts.filter((p): p is Post & { day: number } => p.day !== null)
  const inWindow = dated.filter((p) => p.day < days).sort((a, b) => a.day - b.day)
  const before = data.posts.filter((p) => p.day === null || p.day >= days)

  const medianViews = enoughHistory && before.length >= 3 ? median(before.map((p) => p.views)) : null
  const medianReplies = enoughHistory && before.length >= 3 ? median(before.map((p) => p.replies)) : null

  const shown = Math.min(Math.max(TRACK_WEEKS, windowWeeks + 8), Math.max(histWeeks, windowWeeks))
  const weeks = Array.from({ length: shown }, (_, i) => {
    const w = shown - 1 - i
    return { w, label: weekLabel(data.today, w), inWindow: w < windowWeeks }
  })

  const postsIn = (w: number) => dated.filter((p) => weekOf(p.day) === w)
  const people = data.people

  function perWeek(f: (w: number) => number | null) {
    return weeks.map(({ w }) => (w < histWeeks ? f(w) : null))
  }
  function baselineOf(f: (w: number) => number): Baseline {
    if (!enoughHistory) return { usual: null, weeks: beforeWeeks.length }
    return { usual: median(beforeWeeks.map(f)) * (days / 7), weeks: beforeWeeks.length }
  }

  const repliesIn = (w: number) => postsIn(w).reduce((s, p) => s + p.replies, 0)
  const countIn = (w: number) => postsIn(w).length
  const reachIn = (w: number) => {
    const ps = postsIn(w)
    return ps.length ? median(ps.map((p) => p.views)) : null
  }
  /** People who replied in week w and also in some week before it. */
  const backIn = (w: number) =>
    people ? people.filter((p) => p.replyDays.some((d) => weekOf(d) === w) && p.replyDays.some((d) => weekOf(d) > w)).length : 0

  const peopleBackNow = people
    ? people.filter((p) => p.replyDays.some((d) => d < days) && p.replyDays.some((d) => d >= days)).length
    : null

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
    {
      measure: "people",
      label: "Came back",
      kind: "depth",
      value: peopleBackNow,
      baseline: people ? baselineOf(backIn) : { usual: null, weeks: 0 },
      weekly: people ? perWeek(backIn) : weeks.map(() => null),
      say: (n) => `${fmt(n)} ${n === 1 ? "person" : "people"}`,
      unit: "people",
      proposed: people ? undefined : "Needs who replied, read from X each morning",
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
      // Reach is a median per post, so its usual is your median post, not scaled by days.
      baseline: medianViews === null ? { usual: null, weeks: beforeWeeks.length } : { usual: medianViews, weeks: beforeWeeks.length },
      weekly: perWeek(reachIn),
      say: (n) => `${fmt(n)} views`,
      unit: "views",
    },
  ]

  const scored = dated.map((post) => ({ post, multiple: medianViews ? post.views / medianViews : null }))

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
    inWindow,
    medianViews,
    medianReplies,
    scored,
    people: peopleRead,
    quincy: { now: nowQ, usual: usualQ },
    enoughHistory,
  }
}

/** The against-baseline sentence under a value. */
export function againstUsual(value: number, usual: number | null, unit: string, days: number, minWeeks: number): string {
  if (usual === null) return `Needs ${minWeeks} weeks before I can say what's usual.`
  const u = usual < 10 ? Math.round(usual * 10) / 10 : Math.round(usual)
  const usualText = `${u.toLocaleString("en-US")}${days === 7 ? " a week" : ` in ${days} days`}`
  if (usual <= 0) return value > 0 ? `Usually none. Your usual is 0 ${unit}.` : `About your usual.`
  const m = value / usual
  if (m >= 0.9 && m <= 1.1) return `About your usual, ${usualText}.`
  if (m > 1) return `${formatMultiple(m)} your usual ${usualText}.`
  return `Under your usual ${usualText}.`
}

/** The reach sentence: a multiple of your median post. */
export function againstMedianPost(value: number, median: number | null, minWeeks: number): string {
  if (median === null) return `Needs ${minWeeks} weeks before there's a median post.`
  const m = value / median
  if (m >= 0.95 && m <= 1.05) return `About your median post, ${fmt(median)}.`
  return `${formatMultiple(m)} your median post, ${fmt(median)}.`
}

/* ── Fixtures ───────────────────────────────────────────────────────── */

export const FIXTURE_TODAY = "2026-11-16"

/** Deterministic, so the server and the client draw the same posts. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PEOPLE: Omit<Person, "replyDays" | "answered">[] = [
  { id: "p1", name: "Maya Lund", handle: "mayabuilds" },
  { id: "p2", name: "Tomas Reiersen", handle: "tomasr" },
  { id: "p3", name: "Priya Shah", handle: "priyaships" },
  { id: "p4", name: "Ada Okafor", handle: "adaokafor" },
  { id: "p5", name: "Jonas Berg", handle: "jberg" },
  { id: "p6", name: "Lena Fischer", handle: "lenaf" },
  { id: "p7", name: "Sam Ortiz", handle: "samortiz" },
  { id: "p8", name: "Nora Haugen", handle: "norah" },
  { id: "p9", name: "Ravi Menon", handle: "ravimenon" },
  { id: "p10", name: "Elin Dahl", handle: "elindahl" },
  { id: "p11", name: "Kofi Mensah", handle: "kofim" },
  { id: "p12", name: "Ines Duarte", handle: "inesd" },
]

/** How often each person replies: the first few keep showing up. */
const LOYALTY = [0.55, 0.42, 0.35, 0.28, 0.2, 0.14, 0.1, 0.08, 0.06, 0.05, 0.04, 0.03]

/** Three-beat posts: did / a number on its own line / what it meant. Fictional. */
const STORIES: [string, string, string][] = [
  ["I moved the pricing link from the footer to the first screen.", "Trials this week:\n41 → 68", "Nobody was hiding from the price. They couldn't find it."],
  ["I deleted the onboarding tour and replaced it with one sample project.", "Setups finished on day one:\n2.3×", "People learn a tool by touching it, not by reading about it."],
  ["I answered every reply on my launch post, all 31 of them.", "Signups from that thread:\n19", "The replies were the launch. The post was just the invitation."],
  ["I shipped the export button three customers asked for.", "Accounts that exported in the first week:\n27", "A small thing people asked for beats a big thing I guessed."],
  ["I wrote the changelog for users instead of for the team.", "Clicks on the changelog:\n4×", "If it reads like release notes, nobody reads it."],
  ["I cut the signup form from seven fields to two.", "Completed signups:\n38% → 61%", "Every field is a question the person has to want to answer."],
]

const OPINIONS = [
  "Most dashboards answer a question nobody asked.",
  "The best feature request is the one you already shipped badly.",
  "Small teams win by deciding faster, not by building faster.",
  "If your roadmap fits on one slide, you have a strategy.",
  "Your first ten users are a conversation, not a funnel.",
  "Every settings page is a decision someone didn't make.",
  "A quiet week of shipping beats a loud week of planning.",
  "Writing the docs first is the cheapest prototype there is.",
  "Nobody remembers the launch. They remember the reply.",
  "Pricing is a product decision dressed up as a finance one.",
  "The hard part of building in public is the boring weeks.",
  "Two good customers teach more than two hundred signups.",
  "What does your tool do on the day nothing happens?",
  "Which feature would you delete first, if you had to?",
  "Shipping on Fridays is fine if you can undo on Fridays.",
  "Most onboarding is the team explaining its own org chart.",
]

/** Posts per rolling week, newest first: the real account's shape (DECISION.md). */
const CADENCE = [3, 2, 4, 3, 1, 5, 3, 2, 3, 4, 6, 9, 11, 5, 3, 2, 4, 3, 2, 5, 3, 4, 2, 3, 3, 4]

function views(r: () => number): number {
  // Lognormal around a 700 median; about one post in thirty clears 10×.
  const z = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  return Math.max(120, Math.round(700 * Math.exp(z * 0.95)))
}

export function makeFixtures({ historyWeeks = 26 }: { historyWeeks?: number } = {}): NumbersData {
  const r = rng(29)
  const posts: Post[] = []
  let opinion = 0
  let story = 0
  for (let w = 0; w < historyWeeks; w++) {
    const n = CADENCE[w % CADENCE.length]!
    for (let i = 0; i < n; i++) {
      const day = w * 7 + Math.floor(r() * 7)
      const isStory = r() < 0.22
      let body: string
      if (isStory) {
        const [a, b, c] = STORIES[story++ % STORIES.length]!
        body = `${a}\n\n${b}\n\n${c}`
      } else {
        body = OPINIONS[opinion++ % OPINIONS.length]!
      }
      let v = views(r)
      if (isStory) v = Math.round(v * 1.8)
      // The one post that carries a month, in week 4, the real account's 21K post.
      if (w === 4 && i === 0) v = 21_366
      // Real shape: 46% get none, median 1, p75 2, max 11; more views, a few more replies.
      const replies = r() < 0.46 ? 0 : Math.min(11, Math.max(1, Math.round((0.6 + r() * 1.6) * Math.sqrt(v / 700))))
      const d1 = 0.72 + r() * 0.2
      const climb = Array.from({ length: Math.min(14, Math.max(1, day + 1)) }, (_, k) => Math.round(v * Math.min(1, d1 + (1 - d1) * (1 - Math.exp(-k / 2.2)))))
      climb[climb.length - 1] = v
      posts.push({
        id: `post-${w}-${i}`,
        hook: body.split("\n")[0]!,
        body,
        day,
        views: v,
        replies,
        likes: Math.round(v / 140 + r() * 4),
        reposts: r() < 0.6 ? 0 : Math.round(r() * 3),
        bookmarks: Math.round(v / 600 + r()),
        climb,
        fromQuincy: w < 12 && r() < 0.4,
        repliers: [],
      })
    }
  }

  // Who replied: the loyal few keep coming back.
  const people: Person[] = PEOPLE.map((p) => ({ ...p, replyDays: [], answered: false }))
  for (const post of posts) {
    for (let k = 0; k < post.replies; k++) {
      // Half the replies are from people who never come back; the rest by loyalty.
      if (r() < 0.5) continue
      const total = LOYALTY.reduce((a, b) => a + b, 0)
      let roll = r() * total
      let pick = 0
      while (pick < LOYALTY.length - 1 && roll > LOYALTY[pick]!) roll -= LOYALTY[pick++]!
      const person = people[pick]!
      if (post.repliers.includes(person.id)) continue
      post.repliers.push(person.id)
      person.replyDays.push(post.day!)
    }
  }
  people.forEach((p, i) => {
    p.replyDays.sort((a, b) => a - b)
    p.answered = i % 3 !== 0
  })

  const quincy: QuincyWeek[] = Array.from({ length: historyWeeks }, (_, w) => ({
    read: 6 + Math.round(r() * 14),
    drafted: w < 13 ? 5 + Math.round(r() * 10) : 0,
    approved: w < 13 ? Math.round(r() * 3) : 0,
    posted: w < 13 ? Math.round(r() * 2) : 0,
    costMicros: Math.round((2.6 + r() * 1.4) * 1e6),
  }))

  return {
    source: "fixtures",
    today: FIXTURE_TODAY,
    connected: true,
    historyWeeks,
    posts,
    people: people.filter((p) => p.replyDays.length > 0),
    quincy,
    lastRead: "this morning at 06:00",
    notes: [],
  }
}

export const EMPTY_DATA: NumbersData = {
  source: "fixtures",
  today: FIXTURE_TODAY,
  connected: true,
  historyWeeks: 0,
  posts: [],
  people: [],
  quincy: [],
  lastRead: "this morning at 06:00",
  notes: [],
}

/** The same data as it stood `weeks` weeks ago, so a week back reads like today. */
export function shiftData(data: NumbersData, weeks: number): NumbersData {
  if (weeks <= 0) return data
  const by = weeks * 7
  const d = new Date(`${data.today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - by)
  return {
    ...data,
    today: d.toISOString().slice(0, 10),
    historyWeeks: Math.max(0, data.historyWeeks - weeks),
    posts: data.posts
      .filter((p) => p.day === null || p.day >= by)
      .map((p) => ({ ...p, day: p.day === null ? null : p.day - by })),
    people: data.people
      ? data.people.map((p) => ({ ...p, replyDays: p.replyDays.filter((x) => x >= by).map((x) => x - by) })).filter((p) => p.replyDays.length > 0)
      : null,
    quincy: data.quincy.slice(weeks),
  }
}
