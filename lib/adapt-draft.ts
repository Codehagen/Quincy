import { createIdGenerator } from "ai"
import { and, eq } from "drizzle-orm"

import {
  ADAPT_MODEL,
  adaptTargets,
  generateAdaptation,
  type Adapter,
  type SourcePost,
} from "./adapt"
import { renderBrainForUser } from "./brain"
import { listConnections } from "./channels"
import { db } from "./db"
import { measurePost } from "./post-length"
import { draft, draftVersion } from "./schema-app"
import { recordUsage } from "./usage"

/**
 * Somebody else's post becomes a draft of yours.
 *
 * Deliberately a library function rather than living inside the server action,
 * which is where `draftAngle` puts the same orchestration
 * (`app/(app)/riffs/actions.ts`). The difference is that this one has **two**
 * call sites — the paste box on /drafts and the Bookmarks rhythm — and they
 * disagree about exactly the things a server action owns: one has a session
 * and one has a cron, one revalidates paths and one does not, one gates on
 * `resolveEntitlementForRequest` and one on the pure `resolveEntitlement`.
 *
 * So the split is: **this owns what a draft made from a foreign post is**, and
 * the caller owns who is allowed to ask for one. Entitlement, revalidation and
 * rate limiting are all deliberately absent here — see both call sites.
 */

const newDraftId = createIdGenerator({ prefix: "drf", size: 16 })

/** Injectable so tests and verify scripts never need a model. */
export type AdaptDraftDeps = { adapt: Adapter }

const defaultDeps: AdaptDraftDeps = { adapt: generateAdaptation }

export type AdaptDraftResult =
  | {
      ok: true
      draftId: string
      /** Channels written, in order. */
      channels: string[]
      /** The transferable point the model found, stored as `draft.idea`. */
      idea: string
      /**
       * What of the user's own material it leaned on. Empty when nothing —
       * which the UI must show rather than swallow. See lib/adapt.ts.
       */
      groundedIn: string
      /** Channels whose generated body exceeds the platform ceiling. */
      overLimit: string[]
      /** True when a draft for this source already existed and was returned. */
      existing: boolean
    }
  | { ok: false; reason: "empty" | "too-long" | "model-failed"; message: string }

/**
 * The most source text one adaptation reads.
 *
 * A long-form X post or a LinkedIn article can run to thousands of characters,
 * and the transferable idea is never in the last two thousand of them. This is
 * a ceiling on what a single paste can cost, not an opinion about what is
 * worth reading.
 */
export const MAX_SOURCE_CHARS = 6_000

export async function createAdaptedDraft({
  userId,
  source,
  note = "",
  sourceId,
  sourceLabel,
  deps = defaultDeps,
}: {
  userId: string
  source: SourcePost
  note?: string
  /** A source id from lib/sources.ts, or the bookmark's row id. */
  sourceId: string
  /** What the card says this came out of. "Bookmark", "Pasted post". */
  sourceLabel: string
  deps?: AdaptDraftDeps
}): Promise<AdaptDraftResult> {
  const body = source.body.trim()

  if (!body) {
    return { ok: false, reason: "empty", message: "There is no post here." }
  }

  if (body.length > MAX_SOURCE_CHARS) {
    return {
      ok: false,
      reason: "too-long",
      message: `That post is ${body.length} characters. Paste at most ${MAX_SOURCE_CHARS}.`,
    }
  }

  /**
   * Idempotency, keyed on the source URL.
   *
   * The same shape `draftAngle` uses with `riffHook`, and here it does real
   * work rather than guarding a double click: the Bookmarks rhythm re-reads
   * the same bookmarks every run, and without this a bookmark that was already
   * adapted would produce a new draft — and a new model call — every day until
   * the user unbookmarked it.
   *
   * A pasted post with no URL cannot be deduplicated this way and is not: two
   * pastes of the same text are two deliberate presses, and refusing the
   * second would be surprising in a way the bookmark case is not.
   */
  if (source.url) {
    const [existing] = await db
      .select({ id: draft.id })
      .from(draft)
      .where(
        and(eq(draft.userId, userId), eq(draft.adaptedFromUrl, source.url))
      )
      .limit(1)

    if (existing) {
      const versions = await db
        .select({ channel: draftVersion.channel })
        .from(draftVersion)
        .where(eq(draftVersion.draftId, existing.id))

      return {
        ok: true,
        draftId: existing.id,
        channels: versions.map((v) => v.channel),
        idea: "",
        groundedIn: "",
        overLimit: [],
        existing: true,
      }
    }
  }

  const connections = await listConnections(userId)
  const targets = adaptTargets(
    connections.filter((c) => c.state === "active").map((c) => c.channel)
  )

  const brain = await renderBrainForUser(userId)

  let generation
  try {
    generation = await deps.adapt({
      source: { ...source, body },
      channels: targets,
      brain,
      note,
    })
  } catch (cause) {
    /**
     * No fallback body, unlike `draftAngle`.
     *
     * There, a model failure still leaves a draft carrying the hook — the user
     * chose that line, so it is theirs and it is worth keeping. Here the only
     * text available to fall back to is the stranger's post, and writing that
     * into a draft under the user's name is precisely the failure this whole
     * file is built to prevent. Better to report nothing happened.
     */
    console.error("[adapt] generation failed:", cause)
    return {
      ok: false,
      reason: "model-failed",
      message: "Quincy could not write this one. Try again in a moment.",
    }
  }

  // Metered here rather than inside lib/adapt.ts: this is the layer that knows
  // the userId, matching lib/voice.ts and app/(app)/riffs/actions.ts. The
  // generation already ran, so a bookkeeping failure logs and is dropped
  // rather than undoing work that already happened.
  if (generation.usage) {
    try {
      await recordUsage({
        userId,
        model: ADAPT_MODEL,
        inputTokens: generation.usage.inputTokens,
        cachedInputTokens: generation.usage.cachedInputTokens,
        outputTokens: generation.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[adapt] could not record usage:", cause)
    }
  }

  const bodies = new Map(generation.versions.map((v) => [v.channel, v.body]))
  const overLimit: string[] = []

  const written = targets
    .map((target) => ({ target, body: bodies.get(target.id)?.trim() ?? "" }))
    // A channel the model skipped is dropped rather than filled. There is
    // nothing honest to put in it — see the catch above.
    .filter((v) => v.body.length > 0)

  if (written.length === 0) {
    return {
      ok: false,
      reason: "model-failed",
      message: "Quincy could not write this one. Try again in a moment.",
    }
  }

  for (const { target, body: text } of written) {
    if (measurePost(text, target.id).over > 0) overLimit.push(target.id)
  }

  const id = newDraftId()

  await db.insert(draft).values({
    id,
    userId,
    idea: generation.idea,
    sourceId,
    sourceLabel,
    adaptedFromUrl: source.url,
    adaptedFromHandle: source.handle,
  })

  await db.insert(draftVersion).values(
    written.map(({ target, body: text }) => ({
      id: `${id}-${target.id}`,
      draftId: id,
      channel: target.id,
      label: target.label,
      body: text,
      state: "writing" as const,
    }))
  )

  return {
    ok: true,
    draftId: id,
    channels: written.map((v) => v.target.id),
    idea: generation.idea,
    groundedIn: generation.groundedIn,
    overLimit,
    existing: false,
  }
}
