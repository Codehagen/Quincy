import { createIdGenerator } from "ai"
import { and, eq, inArray } from "drizzle-orm"

import { getAccessToken } from "./channels"
import {
  classifyRead,
  X_READ_COST_MICROS,
  type ImportFailure,
} from "./corpus-x"
import { db } from "./db"
import { sourceItem, usageEvent } from "./schema-app"

/**
 * The X bookmarks read. See plans/016.
 *
 * Deterministic, like lib/corpus-x.ts beside it and for the same reason: this
 * stores what it finds, verbatim, and never interprets it. Which bookmarks are
 * worth anything is `selectAdaptable`'s judgment in lib/adapt.ts, and keeping
 * the two apart is what lets the read be retried freely while the model call
 * stays deliberate and metered.
 *
 * **These are somebody else's words**, which is the one thing that makes this
 * file different from the corpus import. They land under `source: "x-bookmark"`
 * so `compileVoice` cannot see them — its `sources` parameter defaults to the
 * user's own posts, and that default is the guard. A bookmark reaching the
 * voice compile would teach Quincy to write like whoever the user reads.
 *
 * Requires the `bookmark.read` scope, added to lib/channels.ts on 2026-08-08.
 * A connection made before that date returns 403 here and needs reconnecting.
 */

const newItemId = createIdGenerator({ prefix: "si", size: 16 })

/** X allows 1–100 per page. */
const PAGE_SIZE = 100

const FETCH_TIMEOUT_MS = 15_000

/**
 * How many bookmarks one run reads.
 *
 * Lower than the corpus import's 200 because this runs on a schedule rather
 * than on a button, and every post read is bought at `X_READ_COST_MICROS`. The
 * early stop below is what actually keeps the bill down in steady state; this
 * is the ceiling for the first run, when everything is new.
 */
export const DEFAULT_MAX_BOOKMARKS = 50

/**
 * The hard ceiling on posts read in one run, whatever else happens.
 *
 * `maxPosts` bounds what is *kept*; this bounds what is *bought*. They are not
 * the same number and conflating them is what let an earlier version of
 * `collectBookmarks` page through an entire bookmark list while keeping fifty
 * rows. At X_READ_COST_MICROS ($0.005) a post this caps one run at $1.
 */
export const MAX_POSTS_READ = 200

export type BookmarkTweet = {
  id: string
  text: string
  author_id?: string
  created_at?: string
}

export type BookmarkPage = {
  data?: BookmarkTweet[]
  includes?: { users?: { id: string; username?: string }[] }
  meta?: { next_token?: string }
}

export type BookmarkImportResult =
  | {
      ok: true
      /** Rows written this run. */
      imported: number
      /** Posts X returned. What the meter charges for. */
      postsRead: number
      spentMicros: number
      /** True when the run stopped at `maxPosts` with more still there. */
      truncated: boolean
    }
  | { ok: false; reason: ImportFailure; message: string }

export type BookmarkDeps = {
  fetch: typeof fetch
  getToken: typeof getAccessToken
}

const defaultDeps: BookmarkDeps = { fetch, getToken: getAccessToken }

/**
 * Recorded through `usage_event` the same way `x:read` and `x:post` are. A
 * separate label rather than reusing `x:read`, so /credits can say which of
 * the two pay-per-use reads the money went on — they are switched on
 * independently and one of them runs unattended.
 */
async function recordReadCost(userId: string, postsRead: number) {
  if (postsRead === 0) return
  try {
    await db.insert(usageEvent).values({
      id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId,
      model: "x:bookmark-read",
      costMicros: X_READ_COST_MICROS * postsRead,
    })
  } catch (cause) {
    // The rows are already stored. Failing the import because the meter failed
    // would report delivered material as undelivered — the worse lie.
    console.error("[bookmarks-x] cost not recorded:", cause)
  }
}

/** X's `created_at` as a Date, or null — never an Invalid Date, which throws
 *  on insert rather than on read. */
function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at
}

export type CollectedBookmark = BookmarkTweet & { handle: string }

export type CollectBookmarksResult = {
  bookmarks: CollectedBookmark[]
  postsRead: number
  truncated: boolean
  failure?: { reason: ImportFailure; message: string }
}

/**
 * Pages through the bookmarks, newest first. Pure aside from the injected
 * fetch — no `db`, no module state — which is what lets pagination, the early
 * stop and refusal handling be driven directly from a test.
 *
 * **`alreadyStored` is the cost control.** Bookmarks have no `since_id`, so
 * without it every run would re-read and re-pay for the same page forever.
 * When a page comes back entirely known, there is nothing newer behind it and
 * the walk stops. Partially-known pages continue, because a bookmark added to
 * an old post appears at the top and says nothing about what is below it.
 */
export async function collectBookmarks({
  fetchImpl,
  accessToken,
  xUserId,
  maxPosts,
  alreadyStored,
}: {
  fetchImpl: typeof fetch
  accessToken: string
  xUserId: string
  maxPosts: number
  alreadyStored: (ids: string[]) => Promise<Set<string>>
}): Promise<CollectBookmarksResult> {
  const collected: CollectedBookmark[] = []
  let postsRead = 0
  let paginationToken: string | undefined
  let truncated = false

  while (collected.length < maxPosts) {
    const params = new URLSearchParams({
      max_results: String(
        Math.min(PAGE_SIZE, Math.max(1, maxPosts - collected.length))
      ),
      "tweet.fields": "created_at,author_id",
      // The handle. Without the expansion a bookmark carries an author id and
      // nothing a person can read, and the prompt in lib/adapt.ts needs a name
      // to tell the model whose specifics are off limits.
      expansions: "author_id",
      "user.fields": "username",
    })
    if (paginationToken) params.set("pagination_token", paginationToken)

    let response: Response
    try {
      response = await fetchImpl(
        `https://api.x.com/2/users/${xUserId}/bookmarks?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }
      )
    } catch (cause) {
      console.error("[bookmarks-x] fetch failed:", cause)
      truncated = true
      break
    }

    const body = await response.text()

    if (!response.ok) {
      // A refusal on the first page is the whole story. On a later page the
      // rows already read are real and were paid for, so ending there is a
      // partial success rather than a clean one. Same split as
      // collectTimeline in lib/corpus-x.ts.
      if (collected.length === 0 && postsRead === 0) {
        return {
          bookmarks: [],
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

    let page: BookmarkPage
    try {
      page = JSON.parse(body)
    } catch {
      truncated = true
      break
    }

    const tweets = page.data ?? []
    if (tweets.length === 0) break

    postsRead += tweets.length

    const handles = new Map(
      (page.includes?.users ?? []).map((u) => [u.id, u.username ?? ""])
    )

    const known = await alreadyStored(tweets.map((t) => t.id))

    /**
     * A bookmark of your own post is not material to adapt — it is your own
     * writing, and lib/voice.ts already reads that.
     *
     * Skipped, and **counted as resolved** for the exhaustion test below. That
     * second half is load-bearing and its absence was a real bug: a
     * self-bookmark is dropped from `collected` and never stored, so it is
     * never `known` either. The page therefore never looked exhausted, the
     * walk carried on to the next one, and `collected.length < maxPosts`
     * stayed true — so `maxPosts` bounded what was *kept* and nothing at all
     * bounded what was *read and paid for*. Somebody who bookmarks their own
     * posts would have re-paged their entire bookmark list at
     * X_READ_COST_MICROS a post, every single day.
     */
    const isSelf = (t: BookmarkTweet) => t.author_id === xUserId

    for (const tweet of tweets) {
      if (collected.length >= maxPosts) break
      if (known.has(tweet.id) || isSelf(tweet)) continue

      collected.push({
        ...tweet,
        handle: handles.get(tweet.author_id ?? "") ?? "",
      })
    }

    // Nothing on this page is new to us, so there is nothing newer behind it.
    // This is what makes a daily run cost one page instead of ten.
    if (tweets.every((t) => known.has(t.id) || isSelf(t))) break

    /**
     * The ceiling on what one run will pay for, whatever the page contents.
     *
     * Defence in depth behind the exhaustion test above rather than a
     * duplicate of it: that test depends on classifying every tweet correctly,
     * and the bug it just replaced proves a mistake there is invisible until
     * the bill arrives. This one cannot be reasoned wrong — it counts money.
     */
    if (postsRead >= MAX_POSTS_READ) {
      truncated = true
      console.warn(
        `[bookmarks-x] stopped at ${postsRead} posts read — the read ceiling. ` +
          `More bookmarks exist; the next run picks up from the top again.`
      )
      break
    }

    paginationToken = page.meta?.next_token
    if (!paginationToken) break
    if (collected.length >= maxPosts) {
      truncated = true
      break
    }
  }

  return { bookmarks: collected, postsRead, truncated }
}

/**
 * Read the user's bookmarks into `source_item`.
 *
 * Idempotent by construction: the unique key on (user, source, external_id)
 * makes a crashed run safe to repeat, and `alreadyStored` makes the repeat
 * cheap rather than merely harmless.
 *
 * No cooldown claim of its own, unlike `importXCorpus` — but not because none
 * is needed. The first version of this comment argued the dispatcher's claim
 * was enough, and that was wrong: a claim stops two runs *overlapping* and is
 * released the instant one ends, so "Run now" pressed repeatedly bought a
 * fresh paid read every time. The guard lives in `runRhythmOnce`
 * (`MANUAL_RUN_COOLDOWN_MS`), where it covers every rhythm rather than only
 * the one that happened to spend money first.
 */
export async function importXBookmarks({
  userId,
  maxPosts = DEFAULT_MAX_BOOKMARKS,
  deps = defaultDeps,
}: {
  userId: string
  maxPosts?: number
  deps?: BookmarkDeps
}): Promise<BookmarkImportResult> {
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
            ? "Access to X was revoked. Reconnect on Channels."
            : "The X connection needs reconnecting on Channels.",
    }
  }

  const collected = await collectBookmarks({
    fetchImpl: deps.fetch,
    accessToken: access.accessToken,
    xUserId: access.connection.externalId,
    maxPosts,
    alreadyStored: (ids) => storedIds(userId, ids),
  })

  if (collected.failure) {
    // A 403 here is almost always the missing `bookmark.read` scope on a
    // connection made before 2026-08-08, and "X refused" would send someone
    // hunting through a developer portal for a problem one button fixes.
    const message =
      collected.failure.reason === "rejected" &&
      /scope|unsupported|unauthorized/i.test(collected.failure.message)
        ? "Quincy cannot read your bookmarks yet. Reconnect X on Channels to grant the new permission."
        : collected.failure.message

    return { ok: false, reason: collected.failure.reason, message }
  }

  await recordReadCost(userId, collected.postsRead)

  if (collected.bookmarks.length === 0) {
    return {
      ok: true,
      imported: 0,
      postsRead: collected.postsRead,
      spentMicros: X_READ_COST_MICROS * collected.postsRead,
      truncated: false,
    }
  }

  let inserted: { id: string }[]
  try {
    inserted = await db
      .insert(sourceItem)
      .values(
        collected.bookmarks.map((tweet) => ({
          id: newItemId(),
          userId,
          source: "x-bookmark" as const,
          externalId: tweet.id,
          url: tweet.handle
            ? `https://x.com/${tweet.handle}/status/${tweet.id}`
            : `https://x.com/i/status/${tweet.id}`,
          postedAt: parseDate(tweet.created_at),
          body: tweet.text,
          // The handle lives in `meta` rather than a column: `source_item` is
          // shared with the user's own corpus, where "who wrote this" is never
          // a question. meta is never parsed for logic — the same rule
          // brain_page.data enforces — and the handle is recovered from the URL
          // when a draft needs it.
          meta: tweet.handle ? { handle: tweet.handle } : {},
        }))
      )
      .onConflictDoNothing()
      .returning({ id: sourceItem.id })
  } catch (cause) {
    console.error("[bookmarks-x] store failed after read was charged:", cause)
    return {
      ok: false,
      reason: "store-failed",
      message:
        "Your bookmarks were read (and charged) but could not be stored. Try again in a few minutes.",
    }
  }

  return {
    ok: true,
    imported: inserted.length,
    postsRead: collected.postsRead,
    spentMicros: X_READ_COST_MICROS * collected.postsRead,
    truncated: collected.truncated,
  }
}

/** Which of these ids this user already has stored as bookmarks. */
async function storedIds(
  userId: string,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()

  const rows = await db
    .select({ externalId: sourceItem.externalId })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, userId),
        eq(sourceItem.source, "x-bookmark"),
        inArray(sourceItem.externalId, ids)
      )
    )

  return new Set(rows.map((r) => r.externalId))
}
