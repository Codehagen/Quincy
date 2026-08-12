import { createIdGenerator } from "ai"
import { and, count, eq, inArray, isNull, lt, max, or, sql } from "drizzle-orm"

import { getAccessToken } from "./channels"
import { db } from "./db"
import { channelConnection, sourceItem, usageEvent } from "./schema-app"

/**
 * The X corpus import. See plans/011.
 *
 * Deterministic on purpose: this module reads the user's own timeline and
 * stores what it finds, verbatim. It never interprets content — judgment is
 * lib/voice.ts's job, and keeping the two apart is what lets the import be
 * retried freely while the model call stays deliberate and metered.
 */

const newItemId = createIdGenerator({ prefix: "si", size: 16 })

/**
 * X's pay-per-use read rate, in micro-dollars to match lib/pricing.ts.
 * ~$0.005 per post read as of 2026-08 — the free tier was removed in February
 * 2026, so every page of the timeline is bought, which is why `maxPosts`
 * defaults low and why this file meters.
 */
export const X_READ_COST_MICROS = 5_000

/** One import per user per window. Long enough to stop spam, short enough
 *  that a genuine "try again" after a failure is not locked out for long. */
export const IMPORT_COOLDOWN_MS = 10 * 60 * 1000

/**
 * 200 posts ≈ $1, and plenty for the first voice compile. Raising it is a
 * caller's decision, made after the output justifies the spend.
 */
export const DEFAULT_MAX_POSTS = 200

/** X allows 5–100 per page. */
const PAGE_SIZE = 100

const FETCH_TIMEOUT_MS = 15_000

/**
 * Recorded through `usage_event`, the same stretch `x:post` already makes —
 * `model` still answers "what was bought". lib/publish.ts:81 said a third
 * non-model cost is the moment to add a `kind` discriminator; this is that
 * third kind, and the discriminator is deliberately deferred until something
 * needs to *query* the difference rather than display it. /credits shows the
 * label as-is.
 */
async function recordReadCost(userId: string, postsRead: number): Promise<void> {
  if (postsRead === 0) return
  try {
    await db.insert(usageEvent).values({
      id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId,
      model: "x:read",
      costMicros: X_READ_COST_MICROS * postsRead,
    })
  } catch (cause) {
    // The rows are already stored. Failing the import because the meter
    // failed would report delivered material as undelivered — the worse lie.
    console.error("[corpus-x] cost not recorded:", cause)
  }
}

export type ImportFailure =
  /** No X connection, or the token died. The fix lives on /channels. */
  | "not-connected"
  | "needs_reauth"
  | "revoked"
  /** Pay-per-use is not enabled on the developer account. Account action. */
  | "billing"
  | "rate-limited"
  /** X refused for a reason we did not anticipate. `message` is its words. */
  | "rejected"
  /** Claimed by a run in the last IMPORT_COOLDOWN_MS. The concurrency guard. */
  | "cooldown"
  /** Reads were already charged at X; the batch insert failed afterward. */
  | "store-failed"

export type ImportResult =
  | {
      ok: true
      /** Rows written this run. */
      imported: number
      /** Posts X returned. What the meter charges for. */
      postsRead: number
      spentMicros: number
      /** True when the timeline had more than `maxPosts`. Must reach the UI. */
      truncated: boolean
    }
  | { ok: false; reason: ImportFailure; message: string }

/** Injectable so tests exercise pagination and refusal without touching X. */
export type CorpusDeps = {
  fetch: typeof fetch
  getToken: typeof getAccessToken
}

const defaultDeps: CorpusDeps = { fetch, getToken: getAccessToken }

export type XTweet = {
  id: string
  text: string
  created_at?: string
  public_metrics?: Record<string, unknown>
}

export type TimelinePage = { data?: XTweet[]; meta?: { next_token?: string } }

/**
 * The platform's refusal, read the way lib/publish.ts reads one. 402 is the
 * pay-per-use gate; X has also answered 403 with a payment message for the
 * same condition, so the body is consulted, not just the status.
 *
 * Exported for the test, matching how the repo treats other internals.
 */
export function classifyRead(status: number, body: string): ImportFailure {
  if (status === 401) return "needs_reauth"
  if (status === 402) return "billing"
  if (status === 403 && /payment|billing|subscri|monetiz/i.test(body)) {
    return "billing"
  }
  if (status === 429) return "rate-limited"
  return "rejected"
}

/** X's `created_at` as a Date, or null when it is missing or unparsable —
 *  never an Invalid Date, which throws on insert rather than on read. */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * Newest and oldest stored tweet ids, compared numerically rather than
 * derived from `posted_at`. `external_id` is an int64 snowflake as a decimal
 * string — numerically time-ordered, so the cursor can come from the ids
 * themselves and a NULL `posted_at` (the schema allows one, for future
 * archive imports) stops being able to corrupt it. `posted_at` ordering
 * breaks the same way: `ORDER BY ... DESC` is `NULLS FIRST` in Postgres, so
 * one undated row would otherwise become the resume cursor.
 */
async function storedBoundaries(
  userId: string
): Promise<{ newestId?: string; oldestId?: string }> {
  const [row] = await db
    .select({
      newestId: sql<string | null>`max(${sourceItem.externalId}::numeric)::text`,
      oldestId: sql<string | null>`min(${sourceItem.externalId}::numeric)::text`,
    })
    .from(sourceItem)
    .where(and(eq(sourceItem.userId, userId), eq(sourceItem.source, "x")))

  return { newestId: row?.newestId ?? undefined, oldestId: row?.oldestId ?? undefined }
}

export type CollectResult = {
  tweets: XTweet[]
  postsRead: number
  truncated: boolean
  /** Set when the FIRST page refused — the whole run failed. */
  failure?: { reason: ImportFailure; message: string }
}

/**
 * Pages through the timeline once, in one direction. Pure aside from the
 * injected fetch: no `db`, no module state — what lets the pagination and
 * refusal behavior be driven directly in tests rather than through a stub
 * database.
 *
 * `sinceId` walks forward from a stored post (newer); `untilId` walks
 * backward from one (older, the backfill direction); passing neither reads
 * from the top of the timeline. Giving both would be contradictory and is
 * not a case any caller here constructs.
 */
export async function collectTimeline({
  fetchImpl,
  accessToken,
  xUserId,
  sinceId,
  untilId,
  maxPosts,
}: {
  fetchImpl: typeof fetch
  accessToken: string
  xUserId: string
  sinceId?: string
  untilId?: string
  maxPosts: number
}): Promise<CollectResult> {
  const collected: XTweet[] = []
  let postsRead = 0
  let paginationToken: string | undefined
  let truncated = false

  while (collected.length < maxPosts) {
    const params = new URLSearchParams({
      // X's floor is 5. Asking for less than we intend to keep is not
      // possible, so the last page may overshoot; the slice below drops the
      // excess before it is stored, but it was still read and is still paid
      // for — which the meter reflects by counting what X returned.
      max_results: String(
        Math.min(PAGE_SIZE, Math.max(5, maxPosts - collected.length))
      ),
      exclude: "retweets,replies",
      "tweet.fields": "created_at,public_metrics",
    })
    if (sinceId) params.set("since_id", sinceId)
    if (untilId) params.set("until_id", untilId)
    if (paginationToken) params.set("pagination_token", paginationToken)

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
      // Network death, at any page: the rows already read are real and were
      // paid for, and there is more out there we simply could not reach —
      // never reported as a silent clean success.
      console.error("[corpus-x] fetch failed:", cause)
      truncated = true
      break
    }

    const body = await response.text()

    if (!response.ok) {
      // A refusal on the first page is the whole story — nothing was read
      // yet, so there is nothing to salvage and the caller needs the reason.
      // On a later page the rows already read are real and were paid for;
      // ending the run there is a partial success, not a clean one.
      if (collected.length === 0 && postsRead === 0) {
        return {
          tweets: [],
          postsRead: 0,
          truncated: false,
          failure: {
            reason: classifyRead(response.status, body),
            message: body.slice(0, 500),
          },
        }
      }
      truncated = true
      break
    }

    let page: TimelinePage
    try {
      page = JSON.parse(body)
    } catch {
      truncated = true
      break
    }

    const tweets = page.data ?? []
    postsRead += tweets.length
    collected.push(...tweets.slice(0, maxPosts - collected.length))

    paginationToken = page.meta?.next_token
    if (!paginationToken) break
    if (collected.length >= maxPosts) {
      truncated = true
      break
    }
  }

  return { tweets: collected, postsRead, truncated }
}

/**
 * Read the user's own posts into `source_item`.
 *
 * Idempotent by construction: the unique key on (user, source, external_id)
 * makes a crashed run safe to press again, and `since_id` makes the retry
 * cheap rather than merely harmless. Retweets are excluded — someone else's
 * words teach the voice compile nothing about this user. Replies stay out of
 * v1 for the same reason the plan gives: voice first, the reply wedge later.
 */
export async function importXCorpus({
  userId,
  maxPosts = DEFAULT_MAX_POSTS,
  deps = defaultDeps,
}: {
  userId: string
  maxPosts?: number
  deps?: CorpusDeps
}): Promise<ImportResult> {
  const access = await deps.getToken(userId, "x")

  if (!access.ok) {
    const reason = access.reason === "missing" ? "not-connected" : access.reason
    return {
      ok: false,
      reason,
      message:
        reason === "not-connected"
          ? "X is not connected."
          : reason === "revoked"
            ? "Access to X was revoked. Reconnect on Channels to import."
            : "The X connection needs reconnecting on Channels.",
    }
  }

  // The concurrency guard: one conditional UPDATE, atomic on the row. This
  // is what makes "one import per window" hold with no session, no advisory
  // locks, and no interactive transactions on the HTTP driver — a read-then-
  // write here would leave a gap two concurrent requests could both pass
  // through. An import that fails after this point still consumed its
  // window; releasing the claim on failure would reopen that gap, and ten
  // minutes is short enough that a genuine retry is not locked out for long.
  const claimed = await db
    .update(channelConnection)
    .set({ lastImportAt: new Date() })
    .where(
      and(
        eq(channelConnection.id, access.connection.id),
        or(
          isNull(channelConnection.lastImportAt),
          lt(channelConnection.lastImportAt, new Date(Date.now() - IMPORT_COOLDOWN_MS))
        )
      )
    )
    .returning({ id: channelConnection.id })

  if (claimed.length === 0) {
    return {
      ok: false,
      reason: "cooldown",
      message: "Posts were imported recently. Try again in a few minutes.",
    }
  }

  const { newestId, oldestId } = await storedBoundaries(userId)
  // The stored handle may carry a leading @ (it does for connections made
  // through the current profile fetch). A proof URL should be canonical.
  const handle = access.connection.handle?.replace(/^@/, "") ?? null

  // Pass 1 (newer): the ordinary "check for new posts" read, pinned to the
  // newest stored id. This is the only pass that ever ran before this file
  // had two cursors.
  const pass1 = await collectTimeline({
    fetchImpl: deps.fetch,
    accessToken: access.accessToken,
    xUserId: access.connection.externalId,
    sinceId: newestId,
    maxPosts,
  })

  if (pass1.failure) {
    return { ok: false, reason: pass1.failure.reason, message: pass1.failure.message }
  }

  let tweets = pass1.tweets
  let postsRead = pass1.postsRead
  let truncated = pass1.truncated

  // Pass 2 (older, the backfill): only when pass 1 came back with nothing
  // new and there is a floor to backfill from. Without this, since_id always
  // pins to the newest stored post and a truncated first import can never
  // reach further back — the exact bug the "import again for older posts"
  // copy promised was fixed.
  if (pass1.postsRead === 0 && oldestId) {
    const pass2 = await collectTimeline({
      fetchImpl: deps.fetch,
      accessToken: access.accessToken,
      xUserId: access.connection.externalId,
      untilId: oldestId,
      maxPosts,
    })

    if (pass2.failure) {
      return { ok: false, reason: pass2.failure.reason, message: pass2.failure.message }
    }

    tweets = [...tweets, ...pass2.tweets]
    postsRead += pass2.postsRead
    // Zero from pass 2 means the archive is exhausted, not that a page
    // failed. collectTimeline's `truncated` only means "there is more to
    // fetch on this pass" — there is nothing further behind the oldest
    // stored post once it reads nothing.
    truncated = pass2.postsRead === 0 ? false : pass2.truncated
  }

  await recordReadCost(userId, postsRead)

  if (tweets.length === 0) {
    return {
      ok: true,
      imported: 0,
      postsRead,
      spentMicros: X_READ_COST_MICROS * postsRead,
      truncated: false,
    }
  }

  let inserted: { id: string }[]
  try {
    inserted = await db
      .insert(sourceItem)
      .values(
        tweets.map((tweet) => ({
          id: newItemId(),
          userId,
          source: "x" as const,
          externalId: tweet.id,
          url: handle ? `https://x.com/${handle}/status/${tweet.id}` : "",
          postedAt: parseDate(tweet.created_at),
          body: tweet.text,
          meta: tweet.public_metrics ? { public_metrics: tweet.public_metrics } : {},
        }))
      )
      .onConflictDoNothing()
      .returning({ id: sourceItem.id })
  } catch (cause) {
    // The reads above are already charged at X — recordReadCost ran first,
    // deliberately, because the charge happened there regardless of what
    // happens to the rows. This branch only decides what the caller is told.
    console.error("[corpus-x] store failed after read was charged:", cause)
    return {
      ok: false,
      reason: "store-failed",
      message:
        "Your posts were read (and charged) but could not be stored. Try again in a few minutes — already-read posts are not re-imported.",
    }
  }

  return {
    ok: true,
    imported: inserted.length,
    postsRead,
    spentMicros: X_READ_COST_MICROS * postsRead,
    truncated,
  }
}

/**
 * What the /sources row needs to describe the corpus: how much material is
 * in, and where it came from. One query, no tokens.
 *
 * Aggregated in Postgres rather than by pulling every row across the Neon
 * HTTP wire — the same rule lib/usage.ts's summariseUsage follows, for the
 * same reason: this grows with every import, and a future archive upload
 * would otherwise make the page pay for thousands of timestamps per render
 * just to report one count and one date. `max()` ignores NULLs by SQL
 * semantics, which also closes the NULLS-FIRST hazard the row-pulling
 * version had.
 */
export async function corpusSummary(
  userId: string,
  sources: ("x" | "x-archive")[] = ["x", "x-archive"]
): Promise<{ items: number; newestPostedAt: Date | null }> {
  const [row] = await db
    .select({
      items: count(),
      newestPostedAt: max(sourceItem.postedAt),
    })
    .from(sourceItem)
    .where(
      and(eq(sourceItem.userId, userId), inArray(sourceItem.source, sources))
    )

  return { items: row?.items ?? 0, newestPostedAt: row?.newestPostedAt ?? null }
}
