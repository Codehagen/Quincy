import { and, eq, notInArray, sql } from "drizzle-orm"

import { ADAPT_MODEL, selectAdaptable, type Selector } from "./adapt"
import { createAdaptedDraft, type AdaptDraftDeps } from "./adapt-draft"
import { importXBookmarks } from "./bookmarks-x"
import { renderBrainForUser } from "./brain"
import { importXCorpus } from "./corpus-x"
import { db } from "./db"
import { draft, sourceItem } from "./schema-app"
import { recordUsage } from "./usage"
import { compileVoice } from "./voice"

/**
 * What a rhythm actually does, once the dispatcher has decided it should.
 *
 * The registry is the boundary between "the catalogue claims this exists"
 * (lib/rhythms.ts) and "the code can do it". `/rhythm` reads **this**, not
 * `Rhythm.available`, so the switch a user sees can never be ahead of the
 * machinery — a catalogue entry with no handler renders inert whatever its
 * `available` flag says.
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
}

export type RhythmHandlerDeps = {
  adapt?: AdaptDraftDeps["adapt"]
  select?: Selector
}

export type RhythmHandler = (input: {
  userId: string
  deps?: RhythmHandlerDeps
}) => Promise<RhythmHandlerResult>

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
 * makes this a product rather than a loop. Stanley's card describes the same
 * shape ("turns the ones worth adapting into drafts"); the selection is where
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
 * Which rhythms actually do something.
 *
 * Keyed by the `id` in lib/rhythms.ts. Adding a rhythm to the catalogue does
 * not make it runnable; adding it here does.
 */
export const RHYTHM_HANDLERS: Record<string, RhythmHandler> = {
  "bookmarks-to-posts": bookmarksToPosts,
  "voice-refresh": refreshVoice,
}

export function hasHandler(rhythmId: string): boolean {
  return rhythmId in RHYTHM_HANDLERS
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
