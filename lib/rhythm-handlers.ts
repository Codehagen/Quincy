import { createIdGenerator } from "ai"
import { and, eq, inArray, notInArray, sql } from "drizzle-orm"

import {
  ADAPT_MODEL,
  selectAdaptable,
  type AngleGenerator,
  type Selector,
} from "./adapt"
import { createAdaptedDraft, type AdaptDraftDeps } from "./adapt-draft"
import { importXBookmarks } from "./bookmarks-x"
import { renderBrainForUser, renderStandingBrain } from "./brain"
import { importXCorpus } from "./corpus-x"
import { db } from "./db"
import { createRiffFromPost } from "./riffs"
import { draft, riff, sourceItem } from "./schema-app"
import {
  ORIGIN_LABEL,
  readSignalMaterial,
  readSignals,
  selectSignals,
  SIGNAL_MODEL,
  SIGNAL_ORIGINS,
  type SignalOrigin,
  type SignalSelector,
} from "./signals"
import { runShipLog } from "./ship-log"
import { user } from "./schema"
import { resolveTimeZone } from "./timezone"
import { recordUsage } from "./usage"
import { compileVoice } from "./voice"
import { runWeeklyReview } from "./weekly-review"
import { runWeekPlan } from "./week-plan"

/**
 * What a rhythm actually does, once the dispatcher has decided it should.
 *
 * The registry is the boundary between "the catalogue claims this exists"
 * (lib/rhythms.ts) and "the code can do it". `/rhythm` renders **this** plus
 * `RUNS_ELSEWHERE` below and nothing else, so a card cannot exist without
 * code behind it — there is no longer a boolean on the catalogue entry that
 * could say otherwise.
 *
 * Handlers are given a userId and nothing else. Entitlement, claiming,
 * scheduling and run recording all belong to lib/rhythm-run.ts, and a handler
 * that reached for any of them would be deciding whether it is allowed to run
 * from inside the thing being allowed.
 *
 * **No handler here publishes.** That is not an accident of what has been
 * built — `isClaimStale` in lib/rhythm-schedule.ts lets an abandoned claim be
 * retaken precisely because retrying a rhythm is safe, and a retry that
 * double-posted would not be. A handler that puts text on the internet has to
 * change that rule with it, and docs/vision.md:188 says it needs a deliberate
 * decision rather than arriving as a default.
 */

export type RhythmHandlerResult = {
  /**
   * One line the user reads on the card. Present tense, plain words, no jargon
   * and never a stack trace — this renders in a paragraph, not a log viewer.
   */
  summary: string
  /**
   * `skipped` when the handler ran, decided there was nothing to do, and spent
   * nothing. Defaults to `ok`.
   *
   * The distinction is not cosmetic and it is not for the card. `lastOkRunAt`
   * reads `state = 'ok'` to answer "when did this last buy something", which is
   * what the weekly cooldowns in lib/ship-log.ts and lib/week-plan.ts are
   * built on — so a Monday that found no candidates and reported `ok` would
   * lock the next four Mondays out of a plan they could have written.
   */
  state?: "ok" | "skipped"
  /**
   * What the run produced, in numbers and ids. Plan 027 asks for this on
   * `rhythm_run.result`, and that column now exists — see
   * scripts/rhythm-run-result.sql.
   *
   * Three handlers set it and they answer in three shapes, which is why the
   * column is jsonb: Ship Log returns its merge count and the two ids it made,
   * Weekly Review returns the message and its two facts, Week Plan returns
   * what it proposed, critiqued, drafted and placed. Nothing is obliged to
   * return anything, and most runs do not.
   *
   * `summary` still carries the part a person reads, and this is still not the
   * durable artefact — a riff, a draft and a ledger line are. It is the record
   * behind the receipt, bounded on the way in by `boundResult` in
   * lib/rhythm-run.ts.
   */
  result?: Record<string, unknown>
}

export type RhythmHandlerDeps = {
  adapt?: AdaptDraftDeps["adapt"]
  select?: Selector
  /** Trend Alerts' two model calls, injectable for the same reason the two
   *  above are: a test of a handler should not need a gateway. */
  selectSignals?: SignalSelector
  angles?: AngleGenerator
}

export type RhythmHandler = (input: {
  userId: string
  deps?: RhythmHandlerDeps
}) => Promise<RhythmHandlerResult>

/** Matches `newItemId` in lib/corpus-x.ts and lib/bookmarks-x.ts: every
 *  `source_item` row carries an `si` id whatever wrote it. */
const newSignalItemId = createIdGenerator({ prefix: "si", size: 16 })

/**
 * How many bookmarks one run turns into drafts.
 *
 * Three, not "all the good ones". Someone who bookmarks forty posts a week
 * does not want forty drafts on Monday, and a drafting surface with a backlog
 * on it stops being read at all. The selection prompt is already told to
 * return fewer when fewer qualify; this is the ceiling on top of that.
 */
const DRAFTS_PER_RUN = 3

/**
 * How many un-adapted bookmarks the selection prompt reads.
 *
 * Bounded because this is a prompt whose size grows with somebody's bookmark
 * habit. Newest first — a bookmark from March is one they have already had
 * three months to write about.
 */
const CANDIDATE_WINDOW = 40

/**
 * Bookmarks to Posts.
 *
 * Read, select, draft — in that order, and the middle step is the one that
 * makes this a product rather than a loop. "Turns the ones worth adapting into
 * drafts" is the easy sentence; the selection is where
 * "the ones worth adapting" is decided, and it costs one cheap model call to
 * avoid three expensive ones on posts that were links and job ads.
 */
export const bookmarksToPosts: RhythmHandler = async ({ userId, deps }) => {
  const imported = await importXBookmarks({ userId })

  if (!imported.ok) {
    // A failed read is a real outcome the user has to be able to act on —
    // "reconnect X" is a sentence with a button behind it. Thrown as an error
    // so the dispatcher records the run as `failed` rather than `ok`.
    throw new Error(imported.message)
  }

  const candidates = await unadaptedBookmarks(userId, CANDIDATE_WINDOW)

  if (candidates.length === 0) {
    return {
      summary: imported.imported
        ? `Read ${imported.imported} new bookmark${imported.imported === 1 ? "" : "s"}, nothing new left to adapt.`
        : "No new bookmarks.",
    }
  }

  const brain = await renderBrainForUser(userId)
  const select = deps?.select ?? selectAdaptable

  const selection = await select({
    candidates: candidates.map((c) => ({
      id: c.id,
      body: c.body,
      handle: c.handle,
    })),
    brain,
    limit: DRAFTS_PER_RUN,
  })

  // Metered here rather than inside lib/adapt.ts, matching every other model
  // call site: this is the layer that knows the userId. The call already
  // happened, so a bookkeeping failure logs and is dropped.
  if (selection.usage) {
    try {
      await recordUsage({
        userId,
        model: ADAPT_MODEL,
        inputTokens: selection.usage.inputTokens,
        cachedInputTokens: selection.usage.cachedInputTokens,
        outputTokens: selection.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[rhythm] could not record selection usage:", cause)
    }
  }

  if (selection.picks.length === 0) {
    return {
      summary: `Read ${candidates.length} bookmark${candidates.length === 1 ? "" : "s"}, none worth adapting.`,
    }
  }

  const byId = new Map(candidates.map((c) => [c.id, c]))
  let written = 0
  const failures: string[] = []

  for (const pick of selection.picks) {
    const candidate = byId.get(pick.id)
    if (!candidate) continue

    /**
     * One draft at a time, and one failure never stops the rest.
     *
     * Sequential rather than concurrent on purpose: each iteration is a model
     * call, and three in flight against one account is how a rate limit turns
     * a partial success into nothing at all. The dispatcher's time budget is
     * what bounds the whole thing.
     */
    try {
      const result = await createAdaptedDraft({
        userId,
        source: {
          body: candidate.body,
          handle: candidate.handle,
          url: candidate.url,
        },
        note: pick.why,
        sourceId: "x",
        sourceLabel: "Bookmark",
        ...(deps?.adapt ? { deps: { adapt: deps.adapt } } : {}),
      })

      if (result.ok && !result.existing) written += 1
      if (!result.ok) failures.push(result.message)
    } catch (cause) {
      console.error("[rhythm] bookmark draft failed:", cause)
      failures.push("one draft could not be written")
    }
  }

  if (written === 0) {
    // Everything failed. Thrown rather than reported as a quiet `ok`, because
    // a run that produced nothing while spending money is not a success.
    throw new Error(
      failures[0] ?? "Nothing could be drafted from those bookmarks."
    )
  }

  const suffix = failures.length > 0 ? ` (${failures.length} failed)` : ""

  return {
    summary: `Drafted ${written} post${written === 1 ? "" : "s"} from your bookmarks${suffix}.`,
  }
}

/**
 * Voice Refresh.
 *
 * `voice/x` is compiled once at import and goes stale the moment the user
 * posts again. Nothing refreshed it before this.
 *
 * The compile is skipped when the import brought nothing new: recompiling an
 * unchanged corpus is a model call that buys a rewrite of the same page.
 */
export const refreshVoice: RhythmHandler = async ({ userId }) => {
  const imported = await importXCorpus({ userId })

  if (!imported.ok) {
    // A cooldown is not a failure — something else read the timeline minutes
    // ago and there is nothing new to do. Reported as an ordinary outcome so a
    // manual run followed by the scheduled one does not show up as an error.
    if (imported.reason === "cooldown") {
      return { summary: "Your posts were read very recently — nothing to do." }
    }
    throw new Error(imported.message)
  }

  if (imported.imported === 0) {
    return { summary: "No new posts since last time." }
  }

  const compiled = await compileVoice({ userId })

  return {
    summary: `Read ${imported.imported} new post${imported.imported === 1 ? "" : "s"} and rewrote ${compiled.rulesWritten} voice rule${compiled.rulesWritten === 1 ? "" : "s"}.`,
  }
}

/**
 * How many topics one run turns into riffs.
 *
 * Two, where Bookmarks allows three, and the difference is who chose the
 * material. A bookmark is something the user already stopped and saved; a
 * signal is something Quincy went and found, so the case for it being worth a
 * morning is weaker and the cost of being wrong is a card that teaches the
 * user to ignore the surface. `selectSignals` is told to return fewer, and
 * usually should.
 */
const ANGLES_PER_RUN = 2

/**
 * How many stored signals the selection prompt reads.
 *
 * Bounded like `CANDIDATE_WINDOW` above, and the ceiling matters less because
 * the readers are already bounded at `HN_LIMIT + GITHUB_LIMIT`. What this
 * actually bounds is the backlog: a rhythm switched on after a week away has
 * a week of unriffed rows behind it, and the prompt should see this morning's
 * fifty rather than last Tuesday's three hundred.
 */
const SIGNAL_WINDOW = 50

/**
 * Trend Alerts.
 *
 * Read, select, riff — the same three steps as Bookmarks, with the judgment
 * doing more work. A bookmark arrived with a human's implicit endorsement;
 * these fifty arrived because the internet was loud, and `selectSignals` is
 * the only thing standing between "a topic is trending" and a card in the
 * user's morning. Its prompt names refusal as the common answer for that
 * reason.
 *
 * It makes riffs rather than drafts, unlike Bookmarks. The promise is that
 * Quincy hands you *the angle* early — a riff is one scrap plus the angles
 * Quincy sees in it, which is exactly that, and it leaves the decision where
 * it belongs. A finished draft about a topic the user has not decided to
 * enter is a paragraph of somebody else's news in their voice.
 *
 * Nothing here is charged for a read. Both origins are free, so the only spend
 * is the selection call plus one angle generation per pick — and the angle
 * generations only happen for material that survived the selection.
 */
export const trendAlerts: RhythmHandler = async ({ userId, deps }) => {
  const signals = await readSignals()

  if (signals.length > 0) {
    try {
      await db
        .insert(sourceItem)
        .values(
          signals.map((signal) => ({
            id: newSignalItemId(),
            userId,
            source: signal.origin,
            externalId: signal.externalId,
            url: signal.url,
            postedAt: signal.postedAt,
            // The title and whatever one-line description the origin gave.
            // **Not** the discussion or the README: those are fetched per pick
            // in `readSignalMaterial`, and storing them for all fifty would
            // buy fifty round trips to keep material nobody will read.
            body: [signal.title, signal.blurb].filter(Boolean).join("\n\n"),
            meta: { ...signal.meta, heat: signal.heat, handle: signal.handle },
          }))
        )
        // Re-reading the same story tomorrow is the normal case, not an error.
        .onConflictDoNothing()
    } catch (cause) {
      // The read cost nothing, so this is recoverable by simply running again.
      console.error("[rhythm] could not store signals:", cause)
      throw new Error("Quincy could not store what it read. Try again shortly.")
    }
  }

  const candidates = await unriffedSignals(userId, SIGNAL_WINDOW)

  if (candidates.length === 0) {
    // Both origins empty *and* nothing left over is the only way here. Worth
    // saying plainly rather than as a zero: it usually means both APIs were
    // unreachable, which is a different fact from "nothing qualified".
    return { summary: "Nothing new came back from Hacker News or GitHub." }
  }

  // Standing, not voice — see `renderStandingBrain`. The angles are written
  // later by `createRiffFromPost`, which reads the whole brain because writing
  // is what it is for; this call only decides which topics get that far.
  const brain = await renderStandingBrain(userId)
  const select = deps?.selectSignals ?? selectSignals

  const selection = await select({
    candidates: candidates.map((c) => ({
      id: c.id,
      origin: c.origin,
      text: c.body,
      heat: c.heat,
    })),
    brain,
    limit: ANGLES_PER_RUN,
  })

  // Metered here rather than inside lib/signals.ts, matching every other model
  // call site: this is the layer that knows the userId. The call already
  // happened, so a bookkeeping failure logs and is dropped.
  if (selection.usage) {
    try {
      await recordUsage({
        userId,
        model: SIGNAL_MODEL,
        inputTokens: selection.usage.inputTokens,
        cachedInputTokens: selection.usage.cachedInputTokens,
        outputTokens: selection.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[rhythm] could not record selection usage:", cause)
    }
  }

  if (selection.picks.length === 0) {
    /**
     * The expected outcome most days, and the summary says so without
     * apologising. "Nothing qualified" reads as a broken rhythm; naming the
     * bar it failed is what makes a run of empty days legible rather than
     * worrying.
     */
    return {
      summary: `Read ${candidates.length} topic${candidates.length === 1 ? "" : "s"}, none you have standing on.`,
    }
  }

  const byId = new Map(candidates.map((c) => [c.id, c]))
  let written = 0
  const failures: string[] = []

  for (const pick of selection.picks) {
    const candidate = byId.get(pick.id)
    if (!candidate) continue

    // Sequential for the reason `bookmarksToPosts` is: each iteration is a
    // model call, and the dispatcher's time budget is what bounds the whole.
    try {
      const material = await readSignalMaterial({
        origin: candidate.origin,
        externalId: candidate.externalId,
        stored: candidate.body,
      })

      const result = await createRiffFromPost({
        userId,
        source: {
          body: material,
          handle: candidate.handle,
          url: candidate.url,
        },
        note: pick.why,
        sourceId: candidate.origin,
        sourceLabel: ORIGIN_LABEL[candidate.origin],
        ...(deps?.angles ? { deps: { angles: deps.angles } } : {}),
      })

      if (result.ok && !result.existing) written += 1
      if (!result.ok) failures.push(result.message)
    } catch (cause) {
      console.error("[rhythm] signal riff failed:", cause)
      failures.push("one angle could not be written")
    }
  }

  if (written === 0) {
    throw new Error(
      failures[0] ?? "Quincy found nothing worth an angle in today's topics."
    )
  }

  const suffix = failures.length > 0 ? ` (${failures.length} failed)` : ""

  return {
    summary: `${written} angle${written === 1 ? "" : "s"} waiting from today's discussion${suffix}.`,
  }
}

/**
 * The zone this account's week is measured in.
 *
 * Read off the user row rather than taken from the dispatcher, which resolves
 * it for scheduling and does not pass it on. `session.user` is cookie-cached
 * and there is no session here anyway; `resolveTimeZone` answers UTC for an
 * account that has never reported one, which is lib/timezone.ts's honest
 * default.
 */
async function zoneOf(userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: user.timezone })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  return resolveTimeZone(row?.timezone)
}

/**
 * Ship Log. Plan 027, 2d.
 *
 * A week of merges nobody posted about becomes one riff and one draft. The
 * judgment — which merges, the minimum of two, the caps, the cooldown — is in
 * lib/ship-log.ts, and this is the four lines that turn its answer into a card.
 *
 * A refusal is a `skipped` run rather than a thrown error. Two merges in a
 * quiet week is not a fault, and a red card every Sunday for a rhythm behaving
 * exactly as designed is how a surface stops being read.
 */
export const shipLog: RhythmHandler = async ({ userId }) => {
  const run = await runShipLog({ userId })

  return run.ok
    ? { summary: run.summary, result: run.result }
    : { summary: run.summary, state: "skipped" }
}

/**
 * Weekly Review. Plan 027, 4b.
 *
 * Sunday evening, two facts, no model call. The message is the product; the
 * ledger line is the copy that survives the card scrolling away.
 *
 * Never `skipped`: "nothing went out this week" is the review, not the absence
 * of one, and it is the week the owner most needs to read.
 */
export const weeklyReview: RhythmHandler = async ({ userId }) => {
  const review = await runWeeklyReview({
    userId,
    timezone: await zoneOf(userId),
  })

  return { summary: review.message, result: { ...review } }
}

/**
 * Week Plan. Plan 027, 4c.
 *
 * Read strategy, propose, critique, draft. Nothing is approved and nothing is
 * scheduled — see the header of lib/week-plan.ts for why a draft cannot be put
 * in a slot without the user's press, and what is recorded instead.
 */
export const weekPlan: RhythmHandler = async ({ userId }) => {
  const plan = await runWeekPlan({ userId, timezone: await zoneOf(userId) })

  return plan.ok
    ? { summary: plan.summary, result: plan.result }
    : { summary: plan.summary, state: "skipped" }
}

/**
 * Which rhythms actually do something.
 *
 * Keyed by the `id` in lib/rhythms.ts. Adding a rhythm to the catalogue does
 * not make it runnable; adding it here does.
 */
export const RHYTHM_HANDLERS: Record<string, RhythmHandler> = {
  "bookmarks-to-posts": bookmarksToPosts,
  "voice-refresh": refreshVoice,
  "trend-alerts": trendAlerts,
  "ship-log": shipLog,
  "weekly-review": weeklyReview,
  "week-plan": weekPlan,
}

export function hasHandler(rhythmId: string): boolean {
  return rhythmId in RHYTHM_HANDLERS
}

/**
 * The rhythms that run without going through the dispatcher.
 *
 * `RHYTHM_HANDLERS` is the whole answer for a clock rhythm and cannot be the
 * answer for these four. Voice Notes, Meeting Notes and Shipped Work fire on
 * an event — a recording finishing, a transcript arriving, a pull request
 * merging — so a handler for one of them would be a clock trying to run
 * something that only happens when a person does something. Heartbeat runs
 * system-wide from vercel.json for everybody and has no per-user row at all.
 *
 * They are listed because `/rhythm` asks this file one question — is there
 * code behind this card — and for these four the honest answer is yes. The
 * value is where the user controls it, which is never a switch on the card:
 * an event rhythm is turned on by connecting its source, and Heartbeat is not
 * a choice.
 *
 * Hand-written, and the alternative was worse. Importing the routes to prove
 * they exist would pull `node:crypto` and a database connection into a module
 * every page in the app renders; a `Rhythm.available` boolean was the thing
 * this replaces. What keeps it honest is that it is four lines next to the
 * registry it completes, rather than a flag on the far side of a catalogue.
 */
export type ElsewhereRun =
  /** Fires on something the user did. `switchedAt` is where they stop it. */
  | { kind: "event"; runs: string; switchedAt: string }
  /** Runs for everybody on a system cron. Not a choice, so no control. */
  | { kind: "system"; runs: string }

export const RUNS_ELSEWHERE: Record<string, ElsewhereRun> = {
  "voice-notes": {
    kind: "event",
    runs: "workflows/run-voice-riff.ts",
    switchedAt: "/sources",
  },
  "meeting-notes": {
    kind: "event",
    runs: "app/api/webhooks/circleback/[token]/route.ts",
    switchedAt: "/sources",
  },
  "shipped-work": {
    kind: "event",
    runs: "app/api/webhooks/github/route.ts",
    switchedAt: "/sources",
  },
  heartbeat: { kind: "system", runs: "lib/heartbeat.ts" },
}

/** Whether code runs this rhythm at all, by either route. */
export function runsToday(rhythmId: string): boolean {
  return hasHandler(rhythmId) || rhythmId in RUNS_ELSEWHERE
}

/**
 * Bookmarks this user has stored and not yet turned into a draft.
 *
 * Two queries rather than a `NOT EXISTS` subquery, for legibility and because
 * the exclusion set is small: a user has at most a few hundred adapted drafts,
 * and `adapted_from_url` is exactly the column that records one. The
 * alternative — re-reading every bookmark every run — is what would make this
 * rhythm draft the same post every day forever.
 */
async function unadaptedBookmarks(
  userId: string,
  limit: number
): Promise<{ id: string; body: string; url: string; handle: string }[]> {
  const adapted = await db
    .select({ url: draft.adaptedFromUrl })
    .from(draft)
    .where(and(eq(draft.userId, userId), sql`${draft.adaptedFromUrl} <> ''`))

  const used = adapted.map((row) => row.url)

  const rows = await db
    .select({
      id: sourceItem.id,
      body: sourceItem.body,
      url: sourceItem.url,
      meta: sourceItem.meta,
    })
    .from(sourceItem)
    .where(
      used.length > 0
        ? and(
            eq(sourceItem.userId, userId),
            eq(sourceItem.source, "x-bookmark"),
            notInArray(sourceItem.url, used)
          )
        : and(
            eq(sourceItem.userId, userId),
            eq(sourceItem.source, "x-bookmark")
          )
    )
    // NULLS LAST rather than Postgres's default NULLS FIRST for DESC: an
    // undated row must not win the newest-N window ahead of rows that have a
    // date. Same correction lib/voice.ts makes, for the same reason.
    .orderBy(sql`${sourceItem.postedAt} desc nulls last`)
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    url: row.url,
    handle: typeof row.meta?.handle === "string" ? row.meta.handle : "",
  }))
}

/**
 * Signals this user has stored and not yet turned into a riff.
 *
 * The same two-query shape as `unadaptedBookmarks` above, reading `riff`
 * rather than `draft` because that is what Trend Alerts leaves behind. Without
 * it the selection prompt would be shown the same story every morning for as
 * long as it stayed inside the window, and would keep picking it — a model
 * asked twice about the same material gives the same answer.
 *
 * `createRiffFromPost` also deduplicates on the URL, so a race here costs a
 * wasted selection rather than a duplicate riff. This is what stops the
 * selection being wasted in the first place.
 */
async function unriffedSignals(
  userId: string,
  limit: number
): Promise<
  {
    id: string
    origin: SignalOrigin
    externalId: string
    url: string
    body: string
    heat: string
    handle: string
  }[]
> {
  const riffed = await db
    .select({ url: riff.adaptedFromUrl })
    .from(riff)
    .where(and(eq(riff.userId, userId), sql`${riff.adaptedFromUrl} <> ''`))

  const used = riffed.map((row) => row.url)

  const mine = and(
    eq(sourceItem.userId, userId),
    inArray(sourceItem.source, [...SIGNAL_ORIGINS])
  )

  const rows = await db
    .select({
      id: sourceItem.id,
      source: sourceItem.source,
      externalId: sourceItem.externalId,
      url: sourceItem.url,
      body: sourceItem.body,
      meta: sourceItem.meta,
    })
    .from(sourceItem)
    .where(used.length > 0 ? and(mine, notInArray(sourceItem.url, used)) : mine)
    // NULLS LAST rather than Postgres's default NULLS FIRST for DESC, the same
    // correction `unadaptedBookmarks` makes: an undated row must not win the
    // newest-N window ahead of rows that have a date.
    .orderBy(sql`${sourceItem.postedAt} desc nulls last`)
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    // Narrowed by the `inArray` above; the column's type is the whole enum.
    origin: row.source as SignalOrigin,
    externalId: row.externalId,
    url: row.url,
    body: row.body,
    // Strings read out of `meta`, never parsed for logic — the contract the
    // column carries everywhere else. Both degrade to empty rather than throw,
    // because a row written by an older version of the reader is not a bug.
    heat: typeof row.meta?.heat === "string" ? row.meta.heat : "",
    handle: typeof row.meta?.handle === "string" ? row.meta.handle : "",
  }))
}
