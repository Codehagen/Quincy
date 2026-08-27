import { and, asc, eq, gte, isNotNull, isNull } from "drizzle-orm"

import { db } from "./db"
import { appendLedger } from "./memory-ledger"
import { getNumbers } from "./numbers"
import { metricsBaseline, readPostMetrics } from "./post-metrics"
import { draft, draftVersion, scheduledPost } from "./schema-app"

/**
 * What last week actually did, in one message. Plan 027, 4b.
 *
 * **Two facts, tracked separately: posted, and worked.** Collapsing them is
 * the mistake every weekly digest makes — "you posted three times and got
 * 4,000 impressions" reads as one sentence about one thing, and they are
 * different things with different fixes. Nothing went out is a scheduling
 * problem; everything went out and landed under the median is a writing
 * problem. A message that averages them tells you to fix neither.
 *
 * **No model call.** Every number here is a count or a median, and paying a
 * model to phrase arithmetic is how a review starts saying things the
 * arithmetic does not support. The message is built by `reviewMessage`, which
 * is a pure function and is what the test pins.
 *
 * **No praise and no advice.** "Great week!" is a sentence about the reader;
 * "post more on Tuesdays" is a plan nobody asked this rhythm for. Both are the
 * reason weekly digests get filtered. What is left is what happened.
 */

/** The window. Sunday evening, looking back at the week that just ran. */
export const REVIEW_WINDOW_DAYS = 7

/**
 * The ceiling on the message.
 *
 * Plan 027 asks for 600 characters. It is also what `rhythm_run.summary` can
 * hold after its own 500-character slice, so the builder aims well under this
 * and the constant is the backstop rather than the target.
 */
export const MAX_MESSAGE_CHARS = 600

/** Did anything go out, and what is approved and still has no time. */
export type PostedFact = {
  /** Posts published inside the window. */
  count: number
  /** The channels they went to, distinct, in the order they are printed. */
  channels: string[]
  /** Approved versions with no `scheduled_post` row — "waiting for a time". */
  waiting: number
  /** The one that has waited longest. Null when nothing is waiting. */
  oldest: { idea: string; approvedAt: Date } | null
}

/** How the week's posts did against the account's own baseline. */
export type WorkedFact = {
  /** Posts from the window that carry a `post_metric` reading. */
  measured: number
  above: number
  below: number
  /** The median they were compared against. */
  median: number
  /**
   * Which median. `live` is the last thirty days as measured; `corpus` is
   * every post the import ever read, used only when nothing has been measured
   * yet; `none` means neither exists and no comparison is stated.
   */
  baseline: "live" | "corpus" | "none"
  /** The largest impression count in the window, for the one exact number. */
  best: number
}

export const NO_WORK: WorkedFact = {
  measured: 0,
  above: 0,
  below: 0,
  median: 0,
  baseline: "none",
  best: 0,
}

/* ── The pure layer ───────────────────────────────────────────────────────── */

/** "1,240". Grouped, because an impression count is read at a glance. */
function count(value: number): string {
  return value.toLocaleString("en-US")
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

/** "12 August". The date a draft has been waiting since. */
function day(at: Date): string {
  return `${at.getUTCDate()} ${
    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][at.getUTCMonth()]
  }`
}

/**
 * The two facts as one message.
 *
 * Sentence case, plain sentences, exact numbers, and it stops when the facts
 * do. The "nothing posted" branch is a different message rather than the same
 * one with zeros in it: a review that says "0 posts went out, 0 of them beat
 * your median" is a template pretending to be a reading, and the thing the
 * reader actually needs is the name of the draft that was ready and did not go.
 */
export function reviewMessage(
  posted: PostedFact,
  worked: WorkedFact,
  cap = MAX_MESSAGE_CHARS
): string {
  const lines: string[] = []

  if (posted.count === 0) {
    lines.push("Nothing went out this week.")

    if (posted.oldest) {
      lines.push(
        `"${posted.oldest.idea}" has been approved since ${day(posted.oldest.approvedAt)} and still has no time.`
      )
      if (posted.waiting > 1) {
        lines.push(
          `${posted.waiting - 1} other approved ${plural(posted.waiting - 1, "draft")} ${plural(posted.waiting - 1, "is", "are")} waiting behind it.`
        )
      }
    } else {
      lines.push("Nothing is approved and waiting either.")
    }

    return lines.join(" ").slice(0, cap)
  }

  lines.push(
    `${posted.count} ${plural(posted.count, "post")} went out this week, on ${posted.channels.join(" and ")}.`
  )

  if (posted.waiting > 0) {
    lines.push(
      `${posted.waiting} approved ${plural(posted.waiting, "draft")} ${plural(posted.waiting, "has", "have")} no time.`
    )
  }

  if (worked.measured === 0) {
    lines.push("None of them has a reading yet.")
    return lines.join(" ").slice(0, cap)
  }

  const against =
    worked.baseline === "live"
      ? `your 30-day median of ${count(worked.median)}`
      : `your corpus median of ${count(worked.median)}`

  if (worked.baseline === "none") {
    lines.push(
      `${worked.measured} of them ${plural(worked.measured, "has", "have")} a reading; the best did ${count(worked.best)} impressions. There is no median to compare against yet.`
    )
    return lines.join(" ").slice(0, cap)
  }

  lines.push(
    `${worked.measured} of them ${plural(worked.measured, "has", "have")} a reading: ${worked.above} above ${against} impressions, ${worked.below} below.`
  )
  lines.push(`The best did ${count(worked.best)}.`)

  return lines.join(" ").slice(0, cap)
}

/**
 * The impressions of the week's posts, judged against a median.
 *
 * Exported and pure, so the test can pin the split without a database. A
 * reading exactly on the median counts as below: `above` is the claim being
 * made and equality does not support it.
 */
export function workedFrom(
  impressions: number[],
  median: number,
  baseline: WorkedFact["baseline"]
): WorkedFact {
  if (impressions.length === 0) return NO_WORK

  return {
    measured: impressions.length,
    above: impressions.filter((n) => n > median).length,
    below: impressions.filter((n) => n <= median).length,
    median,
    baseline: median > 0 ? baseline : "none",
    best: impressions.reduce((max, n) => Math.max(max, n), 0),
  }
}

/* ── The reads ────────────────────────────────────────────────────────────── */

export type PublishedPost = {
  channel: string
  channelLabel: string
  externalId: string
  publishedAt: Date
}

/** Everything this user actually published inside the window. */
export async function readPublished(
  userId: string,
  since: Date
): Promise<PublishedPost[]> {
  const rows = await db
    .select({
      channel: draftVersion.channel,
      channelLabel: draftVersion.label,
      externalId: scheduledPost.externalId,
      publishedAt: scheduledPost.publishedAt,
    })
    .from(scheduledPost)
    .innerJoin(draftVersion, eq(draftVersion.id, scheduledPost.draftVersionId))
    .where(
      and(
        eq(scheduledPost.userId, userId),
        eq(scheduledPost.state, "published"),
        gte(scheduledPost.publishedAt, since)
      )
    )
    .orderBy(asc(scheduledPost.publishedAt))

  return rows.map((row) => ({
    channel: row.channel,
    channelLabel: row.channelLabel,
    externalId: row.externalId ?? "",
    // Narrowed by the `state` filter above; the column is nullable because a
    // queued row has no time yet.
    publishedAt: row.publishedAt ?? since,
  }))
}

/**
 * Approved versions with no time, oldest first.
 *
 * `scheduled_post` is the only record that a version has a moment — the schema
 * says unscheduling is a delete rather than a state — so "approved and not in
 * that table" is exactly the sentence /drafts already shows. The join is a
 * left join with a null test rather than a `NOT IN`, so a user with two
 * hundred approved versions costs one query either way.
 */
export async function readWaiting(
  userId: string
): Promise<{ idea: string; approvedAt: Date }[]> {
  const rows = await db
    .select({ idea: draft.idea, approvedAt: draftVersion.approvedAt })
    .from(draftVersion)
    .innerJoin(draft, eq(draft.id, draftVersion.draftId))
    .leftJoin(scheduledPost, eq(scheduledPost.draftVersionId, draftVersion.id))
    .where(
      and(
        eq(draft.userId, userId),
        isNotNull(draftVersion.approvedAt),
        isNull(scheduledPost.id)
      )
    )
    .orderBy(asc(draftVersion.approvedAt))

  return rows.map((row) => ({
    idea: row.idea,
    approvedAt: row.approvedAt ?? new Date(0),
  }))
}

/* ── The run ──────────────────────────────────────────────────────────────── */

export type WeeklyReviewRecord = {
  message: string
  posted: PostedFact
  worked: WorkedFact
  /** True when the message also landed on the ledger. */
  remembered: boolean
}

export type WeeklyReviewDeps = {
  published: (userId: string, since: Date) => Promise<PublishedPost[]>
  waiting: (userId: string) => Promise<{ idea: string; approvedAt: Date }[]>
  readings: typeof readPostMetrics
  /** The corpus median, read only when nothing has been measured. */
  corpusMedian: (userId: string, zone: string) => Promise<number>
  remember: (
    userId: string,
    input: { text: string; at: Date; timezone: string }
  ) => Promise<boolean>
}

const defaultDeps: WeeklyReviewDeps = {
  published: readPublished,
  waiting: readWaiting,
  readings: readPostMetrics,
  corpusMedian: async (userId, zone) => (await getNumbers(userId, zone)).median,
  remember: async (userId, input) => {
    /**
     * The ledger, not a page of its own. Plan 027, 3c.
     *
     * `type: "fact"` because that is what this is — a count of what happened,
     * with no preference and no correction in it. `source: "heartbeat"`
     * because the ledger's sources name *who wrote the line*, and a rhythm
     * writing about the account's own week is the same author as the weekly
     * compile. The dedupe rule then does something useful for free: a week
     * with the same two facts as the last one is refused rather than repeated,
     * which is the failure a reference product ships (the same line four times
     * in forty minutes).
     */
    const result = await appendLedger(userId, {
      type: "fact",
      text: input.text,
      source: "heartbeat",
      at: input.at,
      timezone: input.timezone,
    })

    return result.written
  },
}

/**
 * The week, read and written down.
 *
 * Nothing here spends. The one thing it can be slow about is the corpus
 * median, which is why that read only happens when there is no live baseline
 * to use instead — `getNumbers` reads the whole corpus, and a rhythm should
 * not pay for it every Sunday to print a number it already had.
 */
export async function runWeeklyReview({
  userId,
  timezone = "UTC",
  now = new Date(),
  deps = {},
}: {
  userId: string
  timezone?: string
  now?: Date
  deps?: Partial<WeeklyReviewDeps>
}): Promise<WeeklyReviewRecord> {
  const { published, waiting, readings, corpusMedian, remember } = {
    ...defaultDeps,
    ...deps,
  }

  const since = new Date(now.getTime() - REVIEW_WINDOW_DAYS * 86_400_000)

  const [week, approved, measured] = await Promise.all([
    published(userId, since),
    waiting(userId),
    readings(userId, { now }),
  ])

  const posted: PostedFact = {
    count: week.length,
    // Labels rather than ids, and distinct: two X posts are one channel.
    channels: [...new Set(week.map((post) => post.channelLabel))].sort(),
    waiting: approved.length,
    oldest: approved[0] ?? null,
  }

  /**
   * The readings, keyed the way `post_metric` keys them.
   *
   * `source_item_id` is empty for a post published since the last corpus
   * import — which is every post in this window — so the join has to be on the
   * platform's own id. That is the same key the unique index uses.
   */
  const byPost = new Map(
    measured.map((row) => [`${row.channel}:${row.externalId}`, row])
  )

  const impressions = week
    .map((post) => byPost.get(`${post.channel}:${post.externalId}`))
    .filter((reading) => reading !== undefined)
    .map((reading) => reading.impressions)

  const live = metricsBaseline(measured)

  /**
   * The live median first, the corpus median only when there is no live one.
   *
   * Two different questions, and lib/numbers.ts already refuses to collapse
   * them: the live median is "what am I doing now" and the corpus median is
   * "what does a post of mine normally do". A week judged against the corpus
   * when a live baseline exists would be judged against two years of writing.
   */
  const worked =
    impressions.length === 0
      ? NO_WORK
      : live.empty
        ? workedFrom(
            impressions,
            await corpusMedian(userId, timezone),
            "corpus"
          )
        : workedFrom(impressions, live.median, "live")

  const message = reviewMessage(posted, worked)

  let remembered = false
  try {
    remembered = await remember(userId, { text: message, at: now, timezone })
  } catch (cause) {
    // The message is the product and the ledger line is the copy. Losing the
    // copy must not lose the message — the same posture every meter in this
    // codebase takes about a bookkeeping failure after the work is done.
    console.error("[weekly-review] could not write the ledger line:", cause)
  }

  return { message, posted, worked, remembered }
}
