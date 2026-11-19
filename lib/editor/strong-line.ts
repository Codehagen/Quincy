import { generateText, Output } from "ai"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "../db"
import { videoAsset } from "../schema-app"
import { recordUsage } from "../usage"
import { spokenSentences } from "./gate"
import { STRONG_LINE_KEY, strongLineSlot, type StrongLineSlot } from "./reading"
import { wordsFromDeepgram } from "./transcript"

/**
 * The strong line of a take (plans/036, phase C, step 2): one cheap model
 * call that picks the sentence worth pushing in on, at most once per asset.
 *
 * **Money (AGENTS.md).** The ceiling counts what is bought: the call sees at
 * most MAX_SENTENCES sentences and MAX_WORDS words and answers in at most a
 * few tokens, and it is made at most once per asset, ever. "Once" is an
 * atomic claim on the asset row (a `pending` slot written only where no slot
 * exists), so two tabs opening the same cut cannot both pay. The usage row
 * is written whether or not the call answered, and a failed call is never
 * retried: the slot stays `failed`.
 *
 * A claim whose request died before it settled (the function was killed, or
 * the write that settles it failed) would otherwise stay `pending` for good,
 * and the asset would never get its line. So a `pending` older than
 * `PENDING_STALE_MS` counts as no claim, and the next request may take it:
 * at most one more call, and only after a minute in which the first could
 * not have finished.
 */

/** Far past the one call's time to answer, so a live claim is never retaken. */
export const PENDING_STALE_MS = 60_000

/** Cheap, priced in lib/pricing.ts. */
export const STRONG_LINE_MODEL = "openai/gpt-5.6-luna"

export const MAX_SENTENCES = 60
export const MAX_WORDS = 1200

/** A take with fewer sentences has no choice to make: its first line is it. */
const MIN_SENTENCES = 2

/** The sentences the model chooses from, capped. Pure, for the test. */
export function candidateSentences(transcript: unknown): string[] {
  const sentences: string[] = []
  let words = 0
  for (const sentence of spokenSentences(wordsFromDeepgram(transcript))) {
    if (sentences.length >= MAX_SENTENCES || words + sentence.length > MAX_WORDS) break
    words += sentence.length
    sentences.push(sentence.map((w) => w.text.trim()).join(" "))
  }
  return sentences
}

/**
 * Take the asset's one call. True only for the caller that wrote the claim;
 * everyone else reads what is (or will be) in the slot.
 */
export async function claimStrongLine(
  assetId: string,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - PENDING_STALE_MS).toISOString()
  const slot = sql`${videoAsset.transcript} -> ${STRONG_LINE_KEY}`
  const claimed = await db
    .update(videoAsset)
    .set({
      transcript: sql`${videoAsset.transcript} || jsonb_build_object(${STRONG_LINE_KEY}::text, jsonb_build_object('state', 'pending', 'at', ${now.toISOString()}::text))`,
    })
    .where(
      and(
        eq(videoAsset.id, assetId),
        eq(videoAsset.userId, userId),
        isNotNull(videoAsset.transcript),
        // No slot yet, or a pending one left behind by a request that died.
        // A pending claim with no `at` predates the stamp and is long dead.
        sql`(not (${videoAsset.transcript} ? ${STRONG_LINE_KEY}) or (${slot} ->> 'state' = 'pending' and coalesce((${slot} ->> 'at')::timestamptz, 'epoch'::timestamptz) < ${staleBefore}::timestamptz))`
      )
    )
    .returning({ id: videoAsset.id })
  return claimed.length > 0
}

async function settle(assetId: string, userId: string, slot: StrongLineSlot): Promise<void> {
  await db
    .update(videoAsset)
    .set({
      transcript: sql`${videoAsset.transcript} || jsonb_build_object(${STRONG_LINE_KEY}::text, ${JSON.stringify(slot)}::jsonb)`,
    })
    .where(and(eq(videoAsset.id, assetId), eq(videoAsset.userId, userId), isNotNull(videoAsset.transcript)))
}

/**
 * The strong line for an asset: the cached one, or one call to choose it.
 * Returns null when there is none to give (no transcript, too short, the
 * call failed earlier, or another request holds the claim).
 */
export async function fillStrongLine(asset: {
  id: string
  userId: string
  transcript: unknown
}): Promise<string | null> {
  const cached = strongLineSlot(asset.transcript)
  if (cached && !(cached.state === "pending" && isStalePending(cached.at))) {
    return cached.state === "done" ? cached.line : null
  }

  const sentences = candidateSentences(asset.transcript)
  if (sentences.length < MIN_SENTENCES) return null

  if (!(await claimStrongLine(asset.id, asset.userId))) return null

  let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }
  let slot: StrongLineSlot = { state: "failed" }
  try {
    const result = await generateText({
      model: STRONG_LINE_MODEL,
      output: Output.object({
        schema: z.object({ index: z.number().int().min(0).max(sentences.length - 1) }),
      }),
      maxOutputTokens: 60,
      prompt: `These are the sentences of one spoken video take, numbered. Pick the one line worth a slow push-in: the claim, the turn or the number the take is about. Answer with its number only.\n\n${sentences
        .map((sentence, index) => `${index}. ${sentence}`)
        .join("\n")}`,
    })
    usage = {
      inputTokens: result.usage.inputTokens ?? 0,
      cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    }
    const line = sentences[result.output.index]
    if (line) slot = { state: "done", line }
  } catch (cause) {
    console.error(`[strong line] ${asset.id} failed:`, cause)
  } finally {
    // Settled first and each on its own: a metering write that throws must
    // not leave the claim pending, and a settle that throws must not leave
    // the call unmetered.
    await settle(asset.id, asset.userId, slot).catch((cause) =>
      console.error(`[strong line] could not settle ${asset.id}:`, cause)
    )
    // Metered whether or not it answered; the slot keeps it from asking again.
    await recordUsage({
      userId: asset.userId,
      conversationId: `strong-line:${asset.id}`,
      model: STRONG_LINE_MODEL,
      ...usage,
    }).catch((cause) => console.error(`[strong line] could not meter ${asset.id}:`, cause))
  }

  return slot.state === "done" ? slot.line : null
}

/** Whether a pending claim stamped `at` is old enough to be taken again. */
export function isStalePending(at: string | undefined, now = Date.now()): boolean {
  const time = at ? Date.parse(at) : Number.NaN
  return !Number.isFinite(time) || now - time >= PENDING_STALE_MS
}
