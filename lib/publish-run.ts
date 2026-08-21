import { and, asc, eq, gt, lte, sql } from "drizzle-orm"

import { isChannelEnabled, PLATFORM_TIMEOUT_MS } from "./channels"
import { db } from "./db"
import { publish, type PublishResult } from "./publish"
import {
  CONNECTABLE_CHANNELS,
  draft,
  draftVersion,
  scheduledPost,
  type ConnectableChannel,
} from "./schema-app"

/**
 * The sweep that sends. Scheduled in vercel.json.
 *
 * This is the first code path in the product that puts text on the internet in
 * someone's name with no human present at the moment it happens, and
 * docs/vision.md:188 files exactly that under what we are deliberately not
 * building — "Every rhythm drafts; you send. The one exception would need to be
 * a decision made on purpose, not one that arrives as a default."
 *
 * This is that decision, and plans/010 is where it was made. It holds because
 * of what a queued row means: a person read the text, pressed Approve, and put
 * it in a slot they created. Everything below carries out an instruction. There
 * is no branch here that forms one — no default time, no "close enough"
 * channel, nothing that sends text nobody approved.
 *
 * The judgment lives here and the authorisation lives in
 * app/api/cron/publish/route.ts, matching lib/channels-maintenance.ts beside
 * it.
 */

/**
 * How late is too late.
 *
 * A cron can miss its turn — a deploy, an outage, a route that started
 * returning 500 while nobody was reading the dashboard. When it comes back the
 * naive query says "everything queued whose time has passed", and a job that
 * was broken for a week answers that with a week of posts fired into the same
 * minute. That is the worst thing this feature can do, and it is worse than
 * publishing nothing at all: the account looks hacked, the writing is stale,
 * and no one approved *that*.
 *
 * So a post has two hours to go out and then it has missed. A sweep that
 * allows days would publish 09:00 writing at 21:00, which is not the post that
 * was approved — this product is about a deliberate rhythm rather than
 * throughput, so the window is the strict answer.
 *
 * Long enough to survive a deploy, a cold start and a few failed runs. Short
 * enough that anything it sends is still recognisably on time.
 */
const CATCH_UP_MS = 2 * 60 * 60 * 1000

/**
 * The slowest one row can plausibly be.
 *
 * Three bounded fetches, each capped at `PLATFORM_TIMEOUT_MS`: a token refresh
 * inside `getAccessToken`, then LinkedIn's `/rest/posts` attempt, then its
 * `/v2/ugcPosts` fallback. X is cheaper — one refresh and one post — so this is
 * the ceiling rather than the average.
 *
 * Expressed in terms of the timeout rather than as 30_000, so that lowering the
 * per-fetch bound in lib/channels.ts moves this with it instead of leaving a
 * number here that used to be right.
 *
 * Exported for lib/publish-run.test.ts.
 */
export const WORST_CASE_ROW_MS = 3 * PLATFORM_TIMEOUT_MS

/**
 * How long the sweep may keep *starting* rows.
 *
 * The route allows `maxDuration = 300` seconds. This is 240, and the 60 seconds
 * of headroom are not slack: the run still has to finish the row it is holding
 * when the budget expires, then call `countUnresolved` and build the response.
 * A budget equal to the limit would be no budget at all — the deadline would
 * arrive at the same moment Vercel's does.
 *
 * The number this protects is not throughput. `claim` moves a row to `sending`
 * *before* calling the platform and nothing moves it back automatically,
 * because a retry of an unknown outcome is a double post. So every row killed
 * mid-flight needs a human with database access to resolve it. Stopping between
 * rows is what keeps that number at zero.
 *
 * Exported for lib/publish-run.test.ts.
 */
export const RUN_BUDGET_MS = 240_000

/**
 * The most rows one run will take.
 *
 * Derived, not chosen. It is how many worst-case rows fit inside the budget —
 * so the cap and the clock can never disagree, and changing a timeout moves it
 * automatically.
 *
 * The previous value was 100, borrowed from MAX_ROWS_PER_RUN in
 * lib/channels-maintenance.ts, and the reasoning did not transfer: that sweep
 * does one cheap request per row and its skipped work waits for tomorrow. Here
 * ten slow rows can exhaust a five-minute function, and work skipped by this
 * sweep expires rather than waiting.
 *
 * It works out at 8, which is a guarantee rather than a throughput target: a
 * typical row costs a fraction of the worst case, so a run usually empties its
 * batch in seconds and the deadline below never fires. A queue deeper than this
 * is served across consecutive runs — at five-minute intervals inside a
 * two-hour window, that is 24 chances, and `truncated` says so out loud rather
 * than letting the depth go unnoticed.
 *
 * Exported for lib/publish-run.test.ts.
 */
export const MAX_ROWS_PER_RUN = Math.floor(RUN_BUDGET_MS / WORST_CASE_ROW_MS)

/**
 * The two-hour rule, in one place.
 *
 * It was inline arithmetic in three: the query's lower bound, the query's upper
 * bound, and the re-check inside `attempt` that catches a slow batch drifting
 * past the deadline its first row was measured against. Three copies of a
 * product decision is three chances for one of them to disagree, and the one
 * that disagrees decides whether a post goes out.
 *
 * - `due` — anything at or before this has arrived. It is `now`.
 * - `cutoff` — before this, the window has closed and nothing may be sent.
 * - `floor` — how far back the sweep bothers to look at all. Rows older than
 *   this are left alone rather than marked, so a queue abandoned for a month is
 *   not re-read on every run; /lineup shows them for what they are.
 *
 * Exported for lib/publish-run.test.ts. The boundary is the whole safety
 * argument for a catch-up window, so it is the thing worth pinning.
 */
export function windowFor(now: Date) {
  return {
    due: now,
    cutoff: new Date(now.getTime() - CATCH_UP_MS),
    floor: new Date(now.getTime() - 2 * CATCH_UP_MS),
  }
}

/**
 * Has this post's window closed?
 *
 * Strictly before the cutoff, so a post exactly two hours late is still sent.
 * The alternative would make the boundary itself unsendable, which is a rule
 * nobody can predict from "two hours".
 */
export function isMissed(scheduledFor: Date, cutoff: Date): boolean {
  return scheduledFor.getTime() < cutoff.getTime()
}

export type PublishOutcome =
  /** It went out. `postUrl` is the receipt. */
  | "published"
  /** The platform read it and refused. `lastError` has its words. */
  | "failed"
  /**
   * The platform took it and we could not read the id back. Parked in
   * `sending` for a human, never retried. See PublishFailure in lib/publish.ts.
   */
  | "unconfirmed"
  /**
   * Its window closed before anything sent it. Marked `failed` with a message
   * that says so, because "we did not send this" is a thing the user has to be
   * able to find out without comparing two screens.
   */
  | "missed"
  /**
   * The channel has no credentials in this environment. Nothing was claimed and
   * nothing was written — an operator's problem, and the row is left queued so
   * that fixing the deploy inside the window still sends it.
   */
  | "unconfigured"
  /**
   * Scheduled to a channel Quincy cannot publish to. Only reachable through
   * seed data or a channel losing support after something was queued for it.
   */
  | "unsupported"
  /**
   * Another run took it between the query and the claim. Not an error and not
   * a state change — whoever holds the claim records the real outcome. Counted
   * so that a run reporting `due: 8, published: 0` is legible.
   */
  | "claimed-elsewhere"

export type PostAttempt = {
  postId: string
  userId: string
  channel: string
  outcome: PublishOutcome
  detail?: string
}

/**
 * The one thing this module does to the outside world, injectable.
 *
 * Same shape and same reason as MaintenanceDeps in
 * lib/channels-maintenance.ts: the decisions worth verifying are "does a
 * claimed row stay claimed", "does a missed window send anything" and "what
 * does an unconfirmed result leave behind", and none of them should need X or
 * LinkedIn to be reachable — or a real post to leave the building — to be
 * checked.
 */
export type PublishDeps = {
  send: typeof publish
}

const LIVE_DEPS: PublishDeps = { send: publish }

function isConnectable(channel: string): channel is ConnectableChannel {
  return (CONNECTABLE_CHANNELS as readonly string[]).includes(channel)
}

/**
 * Take the row, or find out somebody else already did.
 *
 * **This is the whole safety argument of the module and it is four lines.** The
 * `where` carries `state = 'queued'`, so two runs racing over the same post
 * both issue this update and exactly one of them gets a row back; the loser
 * sees an empty array and moves on. Postgres does the arbitration, which is the
 * only place it can be done correctly — a read-then-write in application code
 * has a gap between the two halves, and that gap is a double post.
 *
 * It runs **before** the platform call rather than after. That ordering is what
 * makes a crash safe: a run that dies between here and the response leaves the
 * row in `sending`, where the next sweep will not see it. The post may have
 * gone out or it may not have, and the honest thing is to stop and let a person
 * look rather than to guess. The same conclusion falls out of a retry policy
 * set to a single attempt, and for the same reason: a retry of a publish whose
 * outcome you do not know is a second post.
 *
 * The cost is that a genuine crash strands a row until someone clears it. That
 * is the right trade. Stranded is visible and fixable; double-posted is
 * neither.
 */
async function claim(postId: string): Promise<boolean> {
  const claimed = await db
    .update(scheduledPost)
    .set({ state: "sending", attemptedAt: new Date() })
    .where(and(eq(scheduledPost.id, postId), eq(scheduledPost.state, "queued")))
    .returning({ id: scheduledPost.id })

  return claimed.length === 1
}

async function record(
  postId: string,
  result: PublishResult
): Promise<PublishOutcome> {
  if (result.ok) {
    await db
      .update(scheduledPost)
      .set({
        state: "published",
        publishedAt: new Date(),
        postUrl: result.url,
        externalId: result.externalId,
        lastError: null,
      })
      .where(eq(scheduledPost.id, postId))

    return "published"
  }

  if (result.reason === "unconfirmed") {
    // Left in `sending`. The state is the message: this went out, or it did
    // not, and nothing automated is allowed to decide which. `lastError`
    // carries the platform-specific wording telling the user where to look.
    await db
      .update(scheduledPost)
      .set({ lastError: result.message })
      .where(eq(scheduledPost.id, postId))

    return "unconfirmed"
  }

  await db
    .update(scheduledPost)
    .set({ state: "failed", lastError: result.message })
    .where(eq(scheduledPost.id, postId))

  return "failed"
}

type DueRow = {
  postId: string
  userId: string
  channel: string
  body: string
  scheduledFor: Date
  idea: string
}

async function attempt(
  row: DueRow,
  cutoff: Date,
  deps: PublishDeps
): Promise<PostAttempt> {
  const base = { postId: row.postId, userId: row.userId, channel: row.channel }

  /**
   * The window is re-checked here, not just in the query.
   *
   * A run can spend its whole budget on the rows ahead of this one — a hundred
   * posts at up to twenty seconds each is well past two hours of drift on
   * paper. Trusting the query would mean the last row in a slow batch goes out
   * long after the deadline the first row was measured against.
   */
  if (isMissed(row.scheduledFor, cutoff)) {
    const lateBy = Math.round(
      (Date.now() - row.scheduledFor.getTime()) / 60_000
    )

    if (!(await claim(row.postId))) {
      return { ...base, outcome: "claimed-elsewhere" }
    }

    await db
      .update(scheduledPost)
      .set({
        state: "failed",
        lastError:
          `Not sent. It was due ${lateBy} minutes ago and Quincy only ` +
          "publishes within two hours of the time you chose — writing this " +
          "late is not the post you approved. Reschedule it if you still " +
          "want it out.",
      })
      .where(eq(scheduledPost.id, row.postId))

    return { ...base, outcome: "missed", detail: `${lateBy} minutes late` }
  }

  if (!isConnectable(row.channel)) {
    // Marked rather than left queued: no deploy fixes this, so leaving it to
    // rot until the window closes would report it as "missed" and imply it
    // nearly made it.
    if (!(await claim(row.postId))) {
      return { ...base, outcome: "claimed-elsewhere" }
    }

    await db
      .update(scheduledPost)
      .set({
        state: "failed",
        lastError: `Quincy cannot publish to ${row.channel} yet.`,
      })
      .where(eq(scheduledPost.id, row.postId))

    return { ...base, outcome: "unsupported" }
  }

  /**
   * Before the row is claimed, and before a request is spent.
   *
   * lib/channels-maintenance.ts checks the same thing for a longer reason: a
   * channel whose client id is missing from the environment sends `undefined`
   * and the platform answers 401. There it would mark real connections broken.
   * Here it would mark real posts failed — permanently, since `failed` is not
   * retried — over a missing environment variable.
   *
   * So nothing is claimed and nothing is written. The row stays queued, and if
   * somebody fixes the deploy inside the two hours it still goes out.
   */
  if (!isChannelEnabled(row.channel)) {
    return { ...base, outcome: "unconfigured" }
  }

  if (!(await claim(row.postId))) {
    return { ...base, outcome: "claimed-elsewhere" }
  }

  const result = await deps.send({
    userId: row.userId,
    channel: row.channel,
    text: row.body,
  })

  const outcome = await record(row.postId, result)

  if (outcome !== "published") {
    console.error(
      `[publish] ${row.postId} (${row.channel}, "${row.idea}") ${outcome}: ` +
        (result.ok ? "" : result.message)
    )
  }

  return {
    ...base,
    outcome,
    detail: result.ok ? result.url : result.message,
  }
}

export type PublishRun = {
  due: number
  truncated: boolean
  /**
   * Rows this run declined to *start* because the clock ran out.
   *
   * Deliberately not folded into `truncated`. They are different diagnoses
   * demanding different answers: `truncated` says the queue is deeper than one
   * run's cap, so raise the cap or shorten the interval; `deferred` says the
   * platform was slow enough that the sweep ran out of time before the queue
   * ran out of rows. One number could not tell an operator which.
   */
  deferred: number
  outcomes: Record<PublishOutcome, number>
  failed: number
}

export async function runScheduledPublish({
  userId,
  now = new Date(),
  deps = LIVE_DEPS,
}: {
  /**
   * Restrict the sweep to one person. The cron passes nothing and sweeps
   * everybody; scripts/verify-publish-run.ts passes its throwaway account,
   * which is what stops a verification run from publishing a real person's
   * queued writing to a real timeline.
   */
  userId?: string
  now?: Date
  deps?: PublishDeps
} = {}): Promise<PublishRun> {
  const { due, cutoff, floor } = windowFor(now)

  /**
   * `queued` only. `sending` is deliberately excluded and that exclusion is the
   * feature — see `claim`. A row parked there is one whose outcome nobody
   * knows, and the sweep picking it up again is precisely the double post the
   * claim exists to prevent.
   *
   * The lower bound is `floor`, not `cutoff`: rows that fell out of the window
   * still have to be *seen* to be marked missed, or they sit in `queued`
   * forever looking like they are about to go out. See `windowFor`.
   */
  const scope = [
    eq(scheduledPost.state, "queued"),
    lte(scheduledPost.scheduledFor, due),
    gt(scheduledPost.scheduledFor, floor),
    ...(userId ? [eq(scheduledPost.userId, userId)] : []),
  ]

  const rows = await db
    .select({
      postId: scheduledPost.id,
      userId: scheduledPost.userId,
      channel: draftVersion.channel,
      body: draftVersion.body,
      scheduledFor: scheduledPost.scheduledFor,
      idea: draft.idea,
    })
    .from(scheduledPost)
    .innerJoin(draftVersion, eq(scheduledPost.draftVersionId, draftVersion.id))
    .innerJoin(draft, eq(draftVersion.draftId, draft.id))
    .where(and(...scope))
    // Oldest first. A truncated run then serves the posts closest to missing
    // their window, rather than an arbitrary prefix.
    .orderBy(asc(scheduledPost.scheduledFor))
    .limit(MAX_ROWS_PER_RUN + 1)

  const truncated = rows.length > MAX_ROWS_PER_RUN
  const batch = truncated ? rows.slice(0, MAX_ROWS_PER_RUN) : rows

  if (truncated) {
    // Louder than the equivalent in lib/channels-maintenance.ts, because the
    // consequence is worse: rows left behind here do not wait for the next run,
    // they run out of time.
    console.error(
      `[publish] sweep truncated at ${MAX_ROWS_PER_RUN} rows — posts are ` +
        "waiting and their windows are closing. Raise the cap or shorten the " +
        "interval."
    )
  }

  const outcomes: Record<PublishOutcome, number> = {
    published: 0,
    failed: 0,
    unconfirmed: 0,
    missed: 0,
    unconfigured: 0,
    unsupported: 0,
    "claimed-elsewhere": 0,
  }

  let failed = 0
  let deferred = 0

  /**
   * Wall clock, not `now`.
   *
   * `now` is injectable and the tests pass a fixed instant, which is right for
   * window arithmetic and useless as a deadline — measured against a frozen
   * clock the budget never expires. This one has to be the real elapsed time of
   * the run.
   */
  const startedAt = Date.now()

  /**
   * Sequential, one post at a time, for the reason the maintenance sweep gives
   * and one this sweep adds: publishing several posts from one account in the
   * same instant is what a compromised account looks like, to a platform's
   * abuse heuristics and to a reader's timeline both.
   */
  for (const [index, row] of batch.entries()) {
    /**
     * Before the claim, never after.
     *
     * `attempt` moves the row to `sending` and only then calls the platform, so
     * a deadline checked anywhere inside or after it would strand exactly the
     * row it was added to protect. Checked here, an expired budget costs a post
     * five more minutes in the queue; checked one line later, it costs somebody
     * a manual database read to find out whether that post went out.
     */
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      deferred = batch.length - index
      console.error(
        `[publish] sweep stopped after ${RUN_BUDGET_MS / 1000}s with ` +
          `${deferred} row(s) unstarted — they are still queued and their ` +
          "windows are still closing. The next run has five minutes to reach " +
          "them. A platform is answering slowly, or the queue is deeper than " +
          "one run."
      )
      break
    }

    try {
      const result = await attempt(row, cutoff, deps)
      outcomes[result.outcome] += 1
    } catch (cause) {
      /**
       * The row is left wherever the throw found it, which is the point. If it
       * threw before the claim it is still `queued` and the next run tries
       * again; if it threw after, it is `sending` and the next run will not
       * touch it. Neither branch guesses whether the post went out.
       */
      failed += 1
      console.error(`[publish] ${row.postId} attempt threw:`, cause)
    }
  }

  if (outcomes.unconfigured > 0) {
    console.error(
      `[publish] ${outcomes.unconfigured} post(s) not attempted — the channel ` +
        "has no client id/secret in this environment. These are due now and " +
        "will be marked missed in under two hours. Check the env vars."
    )
  }

  return { due: batch.length, truncated, deferred, outcomes, failed }
}

/**
 * Posts stuck mid-flight, for anything that needs to ask.
 *
 * Nothing automated resolves these — that is the design — so the count is the
 * only way the condition becomes visible to an operator rather than to whoever
 * happens to open /lineup.
 */
export async function countUnresolved(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scheduledPost)
    .where(eq(scheduledPost.state, "sending"))

  return row?.n ?? 0
}
