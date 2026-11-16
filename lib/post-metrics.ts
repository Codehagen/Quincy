import { createIdGenerator } from "ai"
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm"

import { getAccessToken } from "./channels"
import { X_READ_COST_MICROS } from "./corpus-x"
import { db } from "./db"
import {
  channelConnection,
  postMetric,
  sourceItem,
  usageEvent,
  type ConnectableChannel,
} from "./schema-app"

/**
 * The daily reading of what a published post actually did. See plans/027, 2c.
 *
 * Deterministic, like lib/corpus-x.ts beside it: this asks the platform for
 * numbers and stores them verbatim. It never judges them — that is
 * lib/numbers.ts's job — and keeping the two apart is what lets the read be a
 * cheap idempotent cron while the page stays free to change its mind about
 * what a good post is.
 *
 * The reason it exists is one sentence in the plan: **frozen analytics are
 * worse than none.** `source_item.meta.public_metrics` is written once at
 * import, so a post read on the day it went out is currently being compared
 * against a post read three weeks later, and /numbers presents the mismatch as
 * a ranking. A row per post per day fixes that, and only that.
 */

const newMetricId = createIdGenerator({ prefix: "pm", size: 16 })

/* ── The ceiling, and the cooldown ────────────────────────────────────────
   Both, not either — AGENTS.md "Money". This path spends real money on a
   schedule with nobody present, which is the case that section names as the
   one still owed an aggregate bound.
   ────────────────────────────────────────────────────────────────────────── */

/** How far back a refresh looks. Long enough that a post is still moving. */
export const METRICS_WINDOW_DAYS = 30

/** X allows 5–100 per page, and 100 is the whole window for this account. */
export const METRICS_PAGE_SIZE = 100

/**
 * The ceiling, and it counts the thing being *bought* rather than the thing
 * being kept — the distinction AGENTS.md draws after `collectBookmarks`
 * shipped with `maxPosts` bounding stored rows while nothing bounded paid
 * pages. One page per user per run, full stop: no pagination loop exists in
 * this file, so there is nothing for a `next_token` to unroll. A user with
 * more than 100 posts in 30 days gets the newest 100 measured, and the
 * remainder is a decision somebody makes on purpose later.
 */
export const MAX_PAGES_PER_USER = 1

/**
 * And the aggregate one. The route dies at 300 seconds and the loop is
 * sequential, so an unbounded query does not mean "measure everybody" — it
 * means "measure an unpredictable prefix and pay for an unpredictable
 * amount". Fifty users is ~$25 at 100 posts each, which is a number somebody
 * can be shown before it is spent.
 */
export const MAX_USERS_PER_RUN = 50

/**
 * The cooldown, on the job rather than on a person.
 *
 * Nobody triggers this — which is precisely why it needs one. Vercel Cron
 * fires at-least-once, a redeploy can replay a schedule, and a claim released
 * on completion (the shape a lock has) would let every one of those runs buy
 * its own page. Twenty hours rather than twenty-four so a schedule that
 * drifts a few minutes later each day never skips a whole day.
 */
export const METRICS_COOLDOWN_MS = 20 * 60 * 60 * 1000

/**
 * The meter label. Non-model spend uses `usage_event.model` as a label so
 * /credits can say where the money went, the same stretch `x:read`,
 * `x:post` and `x:bookmark-read` already make.
 *
 * Its own label rather than `x:read`: this one runs unattended, and the first
 * question anybody asks about an unattended cost is how much of the bill was
 * it. Sharing a label with the import would make that unanswerable.
 */
export const X_METRICS_LABEL = "x:metrics"

const FETCH_TIMEOUT_MS = 15_000

/* ── The pure layer ───────────────────────────────────────────────────────
   Everything down to "the store" is a function of its arguments (plus an
   injected fetch), so lib/post-metrics.test.ts can drive the page cap, the
   cooldown arithmetic, the day-key and the baseline without a database and
   without spending anything at X.
   ────────────────────────────────────────────────────────────────────────── */

/** What a reading is, before it has a row. */
export type PostMetricValues = {
  userId: string
  sourceItemId: string
  channel: ConnectableChannel
  externalId: string
  capturedAt: Date
  impressions: number
  likes: number
  replies: number
  reposts: number
  bookmarks: number
  quotes: number
}

export type XMetricTweet = {
  id: string
  created_at?: string
  public_metrics?: Record<string, unknown>
  non_public_metrics?: Record<string, unknown>
}

export type MetricsPage = {
  data?: XMetricTweet[]
  meta?: { next_token?: string }
}

/**
 * A count out of one of the platform's blobs, read defensively.
 *
 * X has changed the shape of `public_metrics` before, an archive import writes
 * none at all, and `Number(undefined)` reaching a median poisons every
 * multiple downstream with NaN. lib/numbers.ts learned this on the meta blob;
 * the lesson survives the move to columns because the wire format did not
 * change, only where we put it.
 */
export function countOf(blob: unknown, key: string): number {
  if (typeof blob !== "object" || blob === null) return 0
  const raw = (blob as Record<string, unknown>)[key]
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : 0
}

/**
 * Whether this connection may ask for `non_public_metrics`.
 *
 * X returns that block only to the author's own token, and the grant Quincy
 * holds is exactly that — the stored scope reads
 * `offline.access bookmark.read tweet.write users.read tweet.read`. The check
 * is on the stored string rather than assumed from the channel, for the reason
 * the column exists at all: a connection made before a scope was added still
 * exists, and asking for a field the token cannot see costs a whole page and
 * returns nothing.
 *
 * It is a fallback, not the source. `public_metrics.impression_count` is
 * present for the author's own posts and is what every number here is read
 * from; `non_public_metrics` is asked for so that a payload without it still
 * yields an impression count rather than a zero that looks like a flop.
 */
export function wantsNonPublicMetrics(scope: string | null | undefined): boolean {
  return /(^|\s)tweet\.read(\s|$)/.test(scope ?? "")
}

/**
 * The UTC midnight a reading belongs to.
 *
 * The day, not the moment, is the unit — see `post_metric.captured_at`. UTC
 * rather than the reader's zone because this is the *sample* clock, not a
 * display clock: two runs of one cron must agree on which day they are
 * writing, and they cannot agree through a per-user timezone.
 */
export function utcDay(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  )
}

/**
 * The cooldown predicate, in TypeScript, next to the SQL that enforces it.
 *
 * The live claim is a conditional UPDATE (see `claimConnection`) — this is the
 * same rule, exported so the test can pin the twenty hours themselves rather
 * than pin a stub that agrees with itself. Two expressions of one rule is a
 * risk; two expressions with one constant between them is the cheapest way to
 * check a number that otherwise only exists inside a query nobody runs.
 */
export function cooledDown(
  lastMetricsAt: Date | null,
  now: Date,
  cooldownMs: number = METRICS_COOLDOWN_MS
): boolean {
  if (!lastMetricsAt) return true
  return now.getTime() - lastMetricsAt.getTime() >= cooldownMs
}

/** One tweet's numbers, as the row they will be stored as. */
export function metricValuesFrom(
  tweet: XMetricTweet,
  base: { userId: string; channel: ConnectableChannel; capturedAt: Date }
): PostMetricValues {
  const publicMetrics = tweet.public_metrics
  const nonPublic = tweet.non_public_metrics

  return {
    userId: base.userId,
    // Filled in by the caller once the corpus has been asked. Empty is a
    // legitimate final answer for a post published since the last import.
    sourceItemId: "",
    channel: base.channel,
    externalId: tweet.id,
    capturedAt: base.capturedAt,
    impressions:
      countOf(publicMetrics, "impression_count") ||
      countOf(nonPublic, "impression_count"),
    likes: countOf(publicMetrics, "like_count"),
    replies: countOf(publicMetrics, "reply_count"),
    reposts: countOf(publicMetrics, "retweet_count"),
    bookmarks: countOf(publicMetrics, "bookmark_count"),
    quotes: countOf(publicMetrics, "quote_count"),
  }
}

/**
 * One row per post per day, decided before the insert rather than by it.
 *
 * The unique index would catch a duplicate anyway — but Postgres refuses a
 * whole `ON CONFLICT` statement that touches the same key twice ("cannot
 * affect row a second time"), so one repeated post inside a single page would
 * lose the entire batch rather than one row. X repeats a post across pages
 * when the timeline moves under a cursor, so this is a real payload, not a
 * defensive one. Last wins: the later reading in the response is the newer.
 */
export function dedupeSameDay(rows: PostMetricValues[]): PostMetricValues[] {
  const byKey = new Map<string, PostMetricValues>()
  for (const row of rows) {
    byKey.set(
      `${row.userId}|${row.channel}|${row.externalId}|${row.capturedAt.toISOString()}`,
      row
    )
  }
  return [...byKey.values()]
}

export type MetricsFailure =
  /** The token is gone or stale. The daily sweep owns that story, not this. */
  | "needs_reauth"
  | "revoked"
  /** Pay-per-use is off on the developer account. Account action. */
  | "billing"
  | "rate-limited"
  /** X refused for a reason we did not anticipate. `message` is its words. */
  | "rejected"

/** X's refusal, classified the way lib/corpus-x.ts classifies one. Shared
 *  vocabulary matters more than shared code here: both read the same API and
 *  must agree about what a 402 means. */
export function classifyMetricsRead(status: number, body: string): MetricsFailure {
  if (status === 401) return "needs_reauth"
  if (status === 402) return "billing"
  if (status === 403 && /payment|billing|subscri|monetiz/i.test(body)) {
    return "billing"
  }
  if (status === 429) return "rate-limited"
  return "rejected"
}

export type MetricsPageResult = {
  tweets: XMetricTweet[]
  /** What X returned. What the meter charges for. */
  postsRead: number
  /** True when X offered another page and the ceiling refused to buy it. */
  more: boolean
  failure?: { reason: MetricsFailure; message: string }
}

/**
 * Buys exactly one page of the owner's own posts, with their numbers.
 *
 * No loop, deliberately. `collectTimeline` in lib/corpus-x.ts pages because a
 * first import is a person waiting for a corpus; this runs every day forever,
 * and a loop here would turn one bad `start_time` into an unbounded bill. The
 * `more` flag says a page was left on the table, so the caller can report it
 * rather than the cap hiding.
 */
export async function collectMetricsPage({
  fetchImpl,
  accessToken,
  xUserId,
  since,
  nonPublic,
  pageSize = METRICS_PAGE_SIZE,
}: {
  fetchImpl: typeof fetch
  accessToken: string
  xUserId: string
  since: Date
  nonPublic: boolean
  pageSize?: number
}): Promise<MetricsPageResult> {
  const fields = nonPublic
    ? "created_at,public_metrics,non_public_metrics"
    : "created_at,public_metrics"

  const params = new URLSearchParams({
    max_results: String(Math.min(METRICS_PAGE_SIZE, Math.max(5, pageSize))),
    // Replies and retweets are excluded for the same reason the corpus
    // excludes them: this measures what the owner published, and a retweet's
    // numbers belong to somebody else's post.
    exclude: "retweets,replies",
    start_time: since.toISOString(),
    "tweet.fields": fields,
  })

  let response: Response
  try {
    response = await fetchImpl(
      `https://api.x.com/2/users/${xUserId}/tweets?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    )
  } catch (cause) {
    console.error("[post-metrics] fetch failed:", cause)
    return {
      tweets: [],
      postsRead: 0,
      more: false,
      failure: { reason: "rejected", message: String(cause) },
    }
  }

  const body = await response.text()

  if (!response.ok) {
    return {
      tweets: [],
      postsRead: 0,
      more: false,
      failure: {
        reason: classifyMetricsRead(response.status, body),
        message: body.slice(0, 500),
      },
    }
  }

  let page: MetricsPage
  try {
    page = JSON.parse(body)
  } catch {
    // Read and paid for, and unreadable. Reported as a refusal so the run
    // counts it rather than recording a clean zero.
    return {
      tweets: [],
      postsRead: 0,
      more: false,
      failure: { reason: "rejected", message: body.slice(0, 500) },
    }
  }

  const tweets = page.data ?? []

  return {
    tweets,
    postsRead: tweets.length,
    more: Boolean(page.meta?.next_token),
  }
}

/* ── The baseline, for /numbers ───────────────────────────────────────────
   Pure, and separate from the read, so the page that owns lib/numbers.ts can
   compute against a live series without inheriting this file's cron.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Sorted-middle, averaging the pair on an even count. Empty is 0, not NaN.
 *
 * Deliberately a copy of `median` in lib/numbers.ts, rounding included, rather
 * than an import: that file will import *this* one when the wave that owns it
 * switches /numbers onto the series, and a circular import between them is a
 * runtime undefined rather than a compile error. The rounding matches so the
 * page's number does not move when only its source does.
 */
export function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

export type MetricsBaseline = {
  /** Posts the baseline was computed from — one per post, not per reading. */
  posts: number
  /** The unit every multiple on /numbers is stated against. */
  median: number
  mean: number
  /** The best single post in the window. */
  best: number
  /** Likes + replies + reposts + bookmarks + quotes, at the median. */
  medianEngagements: number
  totalImpressions: number
  /**
   * No rows. Every number above is 0 — a real zero, never NaN — and this is
   * how the caller tells "nothing has been measured yet" from "everything you
   * posted did nothing". Rendering the second when the first is true is the
   * most convincing kind of lie a numbers page can tell.
   */
  empty: boolean
}

export function metricsBaseline(
  rows: Pick<
    PostMetricValues,
    "impressions" | "likes" | "replies" | "reposts" | "bookmarks" | "quotes"
  >[]
): MetricsBaseline {
  if (rows.length === 0) {
    return {
      posts: 0,
      median: 0,
      mean: 0,
      best: 0,
      medianEngagements: 0,
      totalImpressions: 0,
      empty: true,
    }
  }

  const impressions = rows.map((r) => r.impressions)
  const total = impressions.reduce((sum, n) => sum + n, 0)

  return {
    posts: rows.length,
    median: medianOf(impressions),
    mean: Math.round(total / rows.length),
    best: impressions.reduce((max, n) => Math.max(max, n), 0),
    medianEngagements: medianOf(
      rows.map(
        (r) => r.likes + r.replies + r.reposts + r.bookmarks + r.quotes
      )
    ),
    totalImpressions: total,
    empty: false,
  }
}

/* ── The read ─────────────────────────────────────────────────────────────── */

export type PostMetricReading = {
  sourceItemId: string
  channel: ConnectableChannel
  externalId: string
  capturedAt: Date
  impressions: number
  likes: number
  replies: number
  reposts: number
  bookmarks: number
  quotes: number
}

/**
 * The newest reading of every post measured in the window.
 *
 * One row per post, not one per reading: the caller wants "what did this post
 * do", and handing it a series would make every median in the product depend
 * on how many days a post happened to be sampled for. The series is still
 * there for anything that wants the shape over time.
 *
 * `DISTINCT ON` in the database rather than a fold in TypeScript, following
 * `corpusSummary`'s rule — this grows by one row per post per day forever, and
 * pulling thirty readings per post across the Neon HTTP wire to keep one of
 * them is a cost that compounds with every day the product stays alive.
 */
export async function readPostMetrics(
  userId: string,
  {
    days = METRICS_WINDOW_DAYS,
    now = new Date(),
  }: { days?: number; now?: Date } = {}
): Promise<PostMetricReading[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  return db
    .selectDistinctOn([postMetric.channel, postMetric.externalId], {
      sourceItemId: postMetric.sourceItemId,
      channel: postMetric.channel,
      externalId: postMetric.externalId,
      capturedAt: postMetric.capturedAt,
      impressions: postMetric.impressions,
      likes: postMetric.likes,
      replies: postMetric.replies,
      reposts: postMetric.reposts,
      bookmarks: postMetric.bookmarks,
      quotes: postMetric.quotes,
    })
    .from(postMetric)
    .where(
      and(
        eq(postMetric.userId, userId),
        gte(postMetric.capturedAt, since)
      )
    )
    // Postgres requires the DISTINCT ON expressions to be the leftmost ORDER
    // BY terms; `captured_at desc` after them is what picks the newest.
    .orderBy(
      asc(postMetric.channel),
      asc(postMetric.externalId),
      sql`${postMetric.capturedAt} desc`
    )
}

/* ── The store, injectable ────────────────────────────────────────────────
   The same shape `MaintenanceDeps` takes next door, for the same reason: the
   decisions worth verifying here are "does the cooldown hold", "is one page
   one page" and "does a repeated post survive the upsert", and none of them
   should need X to be reachable — or a dollar to leave the account — to check.
   ────────────────────────────────────────────────────────────────────────── */

export type MetricsConnection = {
  id: string
  userId: string
  channel: ConnectableChannel
  externalId: string
  scope: string | null
}

export type PostMetricsDeps = {
  fetch: typeof fetch
  /** Live connections, longest-unmeasured first. */
  listDue: (limit: number) => Promise<MetricsConnection[]>
  /** The atomic claim. False means the cooldown is still running. */
  claim: (connectionId: string, now: Date) => Promise<boolean>
  getToken: typeof getAccessToken
  /** `external_id` → `source_item.id`, for the posts just read. */
  resolveItems: (
    userId: string,
    externalIds: string[]
  ) => Promise<Map<string, string>>
  upsert: (rows: PostMetricValues[]) => Promise<number>
  meter: (userId: string, postsRead: number) => Promise<void>
}

/**
 * Live connections that might be due, oldest first.
 *
 * The cooldown is filtered here *and* claimed below. This one bounds the
 * query; the claim is what makes the rule hold — a row can pass this filter
 * and lose the claim to a concurrent run, and that is the case the claim
 * exists for.
 *
 * `needs_reauth` rows are included: the token may have been refreshed by the
 * sweep that runs immediately before this in the same route, and
 * `getAccessToken` is the only thing entitled to decide. `revoked` rows are
 * excluded — terminal, and nothing but a fresh grant leaves that state.
 */
async function listDueConnections(limit: number): Promise<MetricsConnection[]> {
  return db
    .select({
      id: channelConnection.id,
      userId: channelConnection.userId,
      channel: channelConnection.channel,
      externalId: channelConnection.externalId,
      scope: channelConnection.scope,
    })
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.channel, "x"),
        sql`${channelConnection.state} <> 'revoked'`,
        or(
          isNull(channelConnection.lastMetricsAt),
          lt(
            channelConnection.lastMetricsAt,
            new Date(Date.now() - METRICS_COOLDOWN_MS)
          )
        )
      )
    )
    // Never measured first, then longest-unmeasured. A truncated run starves
    // nobody: whoever was skipped today is at the front of the queue tomorrow.
    .orderBy(sql`${channelConnection.lastMetricsAt} asc nulls first`)
    .limit(limit + 1)
}

/**
 * One conditional UPDATE, atomic on the row — the shape `importXCorpus` uses,
 * and the only shape that holds without sessions, advisory locks or
 * interactive transactions on the HTTP driver. A read-then-write here leaves a
 * gap two concurrent cron invocations both walk through.
 *
 * The claim is taken before the token is fetched and before anything is
 * bought, so a run that fails afterwards still consumed its window. Releasing
 * it on failure would reopen the gap, and twenty hours is one skipped day, not
 * a broken feature.
 */
async function claimConnection(connectionId: string, now: Date): Promise<boolean> {
  const claimed = await db
    .update(channelConnection)
    .set({ lastMetricsAt: now })
    .where(
      and(
        eq(channelConnection.id, connectionId),
        or(
          isNull(channelConnection.lastMetricsAt),
          lt(
            channelConnection.lastMetricsAt,
            new Date(now.getTime() - METRICS_COOLDOWN_MS)
          )
        )
      )
    )
    .returning({ id: channelConnection.id })

  return claimed.length > 0
}

/** `external_id` → `source_item.id` for the owner's own X posts. */
async function resolveSourceItems(
  userId: string,
  externalIds: string[]
): Promise<Map<string, string>> {
  if (externalIds.length === 0) return new Map()

  const rows = await db
    .select({ id: sourceItem.id, externalId: sourceItem.externalId })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, userId),
        eq(sourceItem.source, "x"),
        inArray(sourceItem.externalId, externalIds)
      )
    )

  return new Map(rows.map((r) => [r.externalId, r.id]))
}

/**
 * Today's reading, written or replaced.
 *
 * `onConflictDoUpdate` rather than `onConflictDoNothing`: a second run on the
 * same day is a *newer* reading of a post that is still moving, and keeping
 * the older one would freeze the number the whole table exists to unfreeze.
 * `source_item_id` is in the update set for the same reason — the import may
 * have caught up between the two runs.
 */
async function upsertMetrics(rows: PostMetricValues[]): Promise<number> {
  if (rows.length === 0) return 0

  const written = await db
    .insert(postMetric)
    .values(rows.map((row) => ({ id: newMetricId(), ...row })))
    .onConflictDoUpdate({
      target: [
        postMetric.userId,
        postMetric.channel,
        postMetric.externalId,
        postMetric.capturedAt,
      ],
      set: {
        sourceItemId: sql`excluded.source_item_id`,
        impressions: sql`excluded.impressions`,
        likes: sql`excluded.likes`,
        replies: sql`excluded.replies`,
        reposts: sql`excluded.reposts`,
        bookmarks: sql`excluded.bookmarks`,
        quotes: sql`excluded.quotes`,
      },
    })
    .returning({ id: postMetric.id })

  return written.length
}

/**
 * One `usage_event` per page bought, priced at the repo's X read rate.
 *
 * The rate is per *post read*, so a page costs what X returned on it — the
 * same arithmetic `recordReadCost` does for the import, imported from there
 * rather than restated so the two cannot drift into disagreeing about what an
 * X read costs.
 */
async function recordMetricsCost(userId: string, postsRead: number): Promise<void> {
  if (postsRead === 0) return
  try {
    await db.insert(usageEvent).values({
      id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId,
      model: X_METRICS_LABEL,
      costMicros: X_READ_COST_MICROS * postsRead,
    })
  } catch (cause) {
    // The numbers are already read and already charged. Failing the refresh
    // because the meter failed would throw away material that was paid for.
    console.error("[post-metrics] cost not recorded:", cause)
  }
}

const LIVE_DEPS: PostMetricsDeps = {
  fetch,
  listDue: listDueConnections,
  claim: claimConnection,
  getToken: getAccessToken,
  resolveItems: resolveSourceItems,
  upsert: upsertMetrics,
  meter: recordMetricsCost,
}

export type MetricsRefresh = {
  /** Connections the query offered, after the cap. */
  due: number
  /** Connections that took the claim and bought a page. */
  refreshed: number
  /** Held back by the twenty-hour claim. */
  cooldown: number
  /** No usable token. The daily sweep owns that story; this one steps over it. */
  unavailable: number
  /** Posts X returned. What the meter charged for. */
  postsRead: number
  pages: number
  spentMicros: number
  /** Rows written or replaced. */
  stored: number
  /** Refused by X, or threw. Per user, never fatal to the run. */
  failed: number
  /** More connections were waiting than `MAX_USERS_PER_RUN` allows. */
  truncated: boolean
  /** At least one user had a second page this run would not buy. */
  capped: boolean
}

/**
 * The daily refresh. Called by /api/cron/channels, after the sweep that
 * repairs the tokens it is about to use.
 *
 * Fails soft per user, like the sweep: one refused connection must not end the
 * run for everyone behind it, and nothing was written for that user, so
 * tomorrow picks it up unchanged.
 */
export async function refreshPostMetrics({
  deps = LIVE_DEPS,
  now = new Date(),
  maxUsers = MAX_USERS_PER_RUN,
}: {
  deps?: PostMetricsDeps
  now?: Date
  maxUsers?: number
} = {}): Promise<MetricsRefresh> {
  const offered = await deps.listDue(maxUsers)
  const truncated = offered.length > maxUsers
  const batch = truncated ? offered.slice(0, maxUsers) : offered

  if (truncated) {
    // Logged loudly rather than absorbed. A refresh that quietly covers part
    // of the table reads as "everyone is measured" to anyone looking at the
    // counts.
    console.error(
      `[post-metrics] run capped at ${maxUsers} users — more were waiting. ` +
        "Raise the cap or move to a cursor."
    )
  }

  const capturedAt = utcDay(now)
  const since = new Date(now.getTime() - METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const run: MetricsRefresh = {
    due: batch.length,
    refreshed: 0,
    cooldown: 0,
    unavailable: 0,
    postsRead: 0,
    pages: 0,
    spentMicros: 0,
    stored: 0,
    failed: 0,
    truncated,
    capped: false,
  }

  // Sequential, one connection at a time. The same argument the sweep makes:
  // a pool would buy little and would buy it by turning fifty users into fifty
  // simultaneous requests from one IP, which is how a job gets rate-limited
  // and reads the 429 as everybody's numbers being zero.
  for (const connection of batch) {
    try {
      if (!(await deps.claim(connection.id, now))) {
        run.cooldown += 1
        continue
      }

      const access = await deps.getToken(connection.userId, connection.channel)

      if (!access.ok) {
        run.unavailable += 1
        continue
      }

      const page = await collectMetricsPage({
        fetchImpl: deps.fetch,
        accessToken: access.accessToken,
        xUserId: connection.externalId,
        since,
        nonPublic: wantsNonPublicMetrics(connection.scope),
      })

      // Metered before the rows are stored, and metered even on a refusal
      // that returned posts: the charge happened at X regardless of what
      // happens next here.
      if (page.postsRead > 0) {
        run.pages += 1
        run.postsRead += page.postsRead
        run.spentMicros += X_READ_COST_MICROS * page.postsRead
        await deps.meter(connection.userId, page.postsRead)
      }

      if (page.failure) {
        run.failed += 1
        console.error(
          `[post-metrics] ${connection.id} refused (${page.failure.reason}): ${page.failure.message}`
        )
        continue
      }

      run.refreshed += 1
      if (page.more) run.capped = true

      if (page.tweets.length === 0) continue

      const items = await deps.resolveItems(
        connection.userId,
        page.tweets.map((t) => t.id)
      )

      const rows = dedupeSameDay(
        page.tweets.map((tweet) => {
          const values = metricValuesFrom(tweet, {
            userId: connection.userId,
            channel: connection.channel,
            capturedAt,
          })
          return { ...values, sourceItemId: items.get(tweet.id) ?? "" }
        })
      )

      run.stored += await deps.upsert(rows)
    } catch (cause) {
      run.failed += 1
      console.error(`[post-metrics] ${connection.id} refresh failed:`, cause)
    }
  }

  return run
}
