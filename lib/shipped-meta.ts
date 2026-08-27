import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "./db"
import { riff, sourceItem, usageEvent } from "./schema-app"
import { MAX_ANSWER_CHARS } from "./shipped-outcome"
import {
  isOpenQuestion,
  readShippedQuestion,
  type ShippedBeats,
  type ShippedMaterial,
  type ShippedQuestion,
} from "./shipped-work"

/**
 * Everything that writes to `source_item.meta` for a merge. See plans/027.
 *
 * A module rather than five call sites, for the reason lib/shipped-outcome.ts
 * gives about the sentence it owns: `meta` is one jsonb column with four
 * independent writers on it — the row's own facts at insert, the material after
 * the ceilings, the brief from a workflow step, the refusal or the question at
 * the end — and every one of them has to be a merge into the live row rather
 * than a read-modify-write. lib/github-repo.ts documents what the alternative
 * costs: a snapshot taken at the top of a request lands last and silently drops
 * a key another writer owns.
 *
 * So every function here is `meta || '{…}'::jsonb`, evaluated by Postgres
 * against the current row. Nothing here reads `meta` in order to write it.
 *
 * **`recordShippedRefusal` is deliberately not moved here.** It lives in
 * lib/riffs.ts beside `startShippedRiff`, which is the pairing that explains
 * it — one merge, one riff or one refusal — and moving it would separate the
 * two halves of a decision to make a file tidy.
 *
 * One function here writes `riff.context` rather than `source_item.meta`, and
 * it is here for the same reason the others are: same column type, same merge
 * discipline, same feature. See `recordAnsweredBeats`.
 */

/**
 * The beats again, once the owner has answered.
 *
 * **The dead end this closes.** `startShippedRiff` derives the riff's id from
 * the `source_item` and inserts with `onConflictDoNothing`, which is what makes
 * a step retry free — and it also means a re-run cannot update the row. So a
 * merge that produced a riff with a hole in the story (`did` quoted, `happened`
 * missing) would have taken the answer, paid for a selection, found the riff
 * already had its angles, and changed nothing anybody could see.
 *
 * The angles are deliberately left alone: `completeSpokenRiff` refuses to write
 * a second set, and that guard is right — a second set at model prices for an
 * answer already given is exactly what it exists to stop. What the answer
 * changes is the *beats*, and the beats are what the writer composes from days
 * later. So the answer reaches the post through `riff.context`, which is the
 * column built for carrying it there.
 *
 * `||` at the top level, so `forUser` and `facts` beside it survive.
 */
export async function recordAnsweredBeats(input: {
  userId: string
  riffId: string
  beats: ShippedBeats
}): Promise<void> {
  await db
    .update(riff)
    .set({
      context: sql`${riff.context} || ${JSON.stringify({ beats: input.beats })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(eq(riff.id, input.riffId), eq(riff.userId, input.userId)))
}

/**
 * The material, written after the ceilings rather than at the insert.
 *
 * The row is written before entitlement, before `paused` and before the daily
 * ceiling, because the merge happened and the fact is true whether or not
 * anything is spent on it. The material costs GitHub requests, so it is fetched
 * below all three and merged into a row that already exists.
 */
export async function recordShippedMaterial(
  sourceItemId: string,
  material: ShippedMaterial
): Promise<void> {
  await merge(sourceItemId, { material })
}

/** The brief, written by the workflow step that paid for it. */
export async function recordShippedBrief(
  sourceItemId: string,
  brief: string
): Promise<void> {
  if (!brief) return
  await merge(sourceItemId, { brief })
}

/**
 * Why a merge was stored and never read.
 *
 * **This is the gap plan 027 found, and it is a gap in the route rather than in
 * the function it names.** `recordShippedRefusal` has exactly one call site —
 * inside `runShippedRiffWorkflow` — so it can only ever record a verdict the
 * *model* reached. The webhook has four exits after the row is written that
 * never start that workflow: an unentitled account, a paused connection, the
 * daily ceiling, and a `start()` that threw. Each of those leaves a
 * `source_item` with no riff, no refusal and nothing anywhere saying which of
 * them happened, which is exactly what the live rows show. The backfill action
 * has a fifth, on the same `start()`.
 *
 * A stop is not a refusal and is written under its own key for that reason.
 * "There was no post in it" is a judgement about the merge; "your subscription
 * lapsed" is a fact about the account, and putting the second one behind the
 * first sentence would be Quincy blaming the work for the billing.
 */
export type ShippedStop =
  "unentitled" | "paused" | "daily-ceiling" | "not-started"

export async function recordShippedStop(input: {
  sourceItemId: string
  reason: ShippedStop
  why: string
}): Promise<void> {
  await merge(input.sourceItemId, {
    stopped: input.reason,
    stoppedWhy: input.why.slice(0, MAX_STOP_CHARS),
  })
}

/** Long enough for the sentence, short enough not to store an essay. */
const MAX_STOP_CHARS = 300

/**
 * The one question, written only when there is no other one open.
 *
 * **The ceiling is the product.** Plan 027 asks for *one* question, and the
 * restraint is not a rate limit dressed up: a page that asks about five merges
 * is a form, and a form is what nobody fills in. So this reads first — the one
 * read-before-write in this file, and it is safe to lose the race, because the
 * worst outcome of two questions landing together is two questions.
 *
 * Returns false when it wrote nothing, so the caller can log the difference
 * between "asked" and "already asking".
 */
export async function recordShippedQuestion(input: {
  userId: string
  sourceItemId: string
  text: string
}): Promise<boolean> {
  if (!input.text) return false

  const open = await openShippedQuestion(input.userId)
  if (open) return false

  const question: ShippedQuestion = {
    text: input.text,
    askedAt: new Date().toISOString(),
  }

  await merge(input.sourceItemId, { question })

  return true
}

export type OpenShippedQuestion = {
  sourceItemId: string
  question: ShippedQuestion
  /** `owner/repo#number`, for the row to say what it is asking about. */
  about: string
  url: string
}

/**
 * The question waiting on this user, or null.
 *
 * `meta ? 'question'` narrows in the index-free way jsonb allows, and the
 * answer key is checked in SQL rather than in TypeScript so a user with a
 * hundred answered merges does not pull a hundred rows across the wire to find
 * the one that is open. Newest first: if two ever land together, the one that
 * is asked about is the one that just happened.
 */
export async function openShippedQuestion(
  userId: string
): Promise<OpenShippedQuestion | null> {
  const [row] = await db
    .select({
      id: sourceItem.id,
      url: sourceItem.url,
      meta: sourceItem.meta,
    })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, userId),
        eq(sourceItem.source, "github"),
        sql`${sourceItem.meta} ? 'question'`,
        sql`coalesce(${sourceItem.meta} -> 'question' ->> 'answer', '') = ''`
      )
    )
    .orderBy(desc(sourceItem.createdAt))
    .limit(1)

  if (!row) return null

  const question = readShippedQuestion(row.meta?.question)
  if (!isOpenQuestion(question) || !question) return null

  return {
    sourceItemId: row.id,
    question,
    about: describeMerge(row.meta),
    url: row.url,
  }
}

/**
 * `owner/repo#282`, or as much of it as the row holds.
 *
 * Read off `meta`, which the insert wrote and nothing since has touched.
 */
function describeMerge(meta: Record<string, unknown> | null): string {
  const repository = typeof meta?.repository === "string" ? meta.repository : ""
  const number = typeof meta?.number === "number" ? meta.number : 0

  if (repository && number) return `${repository}#${number}`
  if (repository) return repository
  if (number) return `#${number}`
  return "your last merge"
}

export type AnsweredQuestion = {
  sourceItemId: string
  answer: string
  meta: Record<string, unknown>
  body: string
  postedAt: Date | null
}

/**
 * Store the answer, and hand back what the re-run needs.
 *
 * **Conditional on the question still being open**, in the `where` rather than
 * in a branch above it. Two submits of the same form — a double tap, a
 * resubmitted form, a second tab — must write one answer and start one
 * workflow, and a read-then-write would let both through. `RETURNING` is what
 * tells the caller which of the two it was: no row means somebody else got
 * there first, and the caller spends nothing.
 */
export async function answerShippedQuestion(input: {
  userId: string
  sourceItemId: string
  answer: string
}): Promise<AnsweredQuestion | null> {
  const answer = input.answer
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ANSWER_CHARS)
  if (!answer) return null

  const patch = JSON.stringify({
    answer,
    answeredAt: new Date().toISOString(),
  })

  const [row] = await db
    .update(sourceItem)
    .set({
      /**
       * Merged into `question` rather than replacing it, so `text` and
       * `askedAt` survive. `jsonb_set` would need the key to exist and `||` at
       * the top level would drop the question wholesale — this is the same
       * nested merge lib/github-repo.ts writes for the repository cache, and
       * for the same reason.
       */
      meta: sql`${sourceItem.meta} || jsonb_build_object('question', (${sourceItem.meta} -> 'question') || ${patch}::jsonb)`,
    })
    .where(
      and(
        eq(sourceItem.id, input.sourceItemId),
        // The ownership check. The id travels to the browser and comes back.
        eq(sourceItem.userId, input.userId),
        sql`${sourceItem.meta} ? 'question'`,
        sql`coalesce(${sourceItem.meta} -> 'question' ->> 'answer', '') = ''`
      )
    )
    .returning({
      id: sourceItem.id,
      meta: sourceItem.meta,
      body: sourceItem.body,
      postedAt: sourceItem.postedAt,
    })

  if (!row) return null

  return {
    sourceItemId: row.id,
    answer,
    meta: row.meta ?? {},
    body: row.body,
    postedAt: row.postedAt,
  }
}

/**
 * What the GitHub reads cost, recorded where /credits can say so.
 *
 * AGENTS.md: non-model spend uses the `model` column as a label, the way
 * `x:read`, `x:post` and `x:bookmark-read` already do. **The money is zero and
 * the row is written anyway**, because what this path spends is rate-limit
 * quota against one installation, and a quota nobody can see is a ceiling
 * nobody can check. One row per merge rather than one per request: seven
 * zero-cost rows a merge would bury the model calls on the same page.
 *
 * **The callers pass the ceiling rather than the count.** `materialFor` may buy
 * fewer requests than `MAX_MATERIAL_REQUESTS` — a description with no linked
 * issues buys two — and reporting the worst case over-reports. That is the
 * direction lib/pricing.ts already argues for on an unpriced model: of the two
 * ways to be wrong, only over-reporting is recoverable.
 */
export async function recordGithubReads(
  userId: string,
  requests: number
): Promise<void> {
  if (requests <= 0) return

  try {
    await db.insert(usageEvent).values({
      id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId,
      model: "github:read",
      // The reads are free in money and are counted in requests. Stored where
      // the token counts go so that one row answers "how much was bought".
      inputTokens: requests,
      costMicros: 0,
    })
  } catch (cause) {
    // The material is already stored. Failing the ingest because the meter
    // failed would lose the merge to keep the books, which is backwards.
    console.error("[shipped-meta] github read cost not recorded:", cause)
  }
}

/**
 * `meta || {…}`, evaluated against the live row.
 *
 * Never `{ ...meta, key }` from a snapshot. The interleaving that matters is
 * the one lib/github-repo.ts documents: a webhook writes back a `meta` it read
 * at the top of the request and a key another writer added in between
 * disappears. Here the row is written by the route, the material by the route a
 * moment later, and the brief and the question by workflow steps seconds after
 * that — four writers, one column.
 */
async function merge(
  sourceItemId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await db
    .update(sourceItem)
    .set({
      meta: sql`${sourceItem.meta} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(sourceItem.id, sourceItemId))
}
