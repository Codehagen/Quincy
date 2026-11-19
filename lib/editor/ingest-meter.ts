import { and, eq, gte, sql } from "drizzle-orm"

import { db } from "../db"
import { usageEvent } from "../schema-app"
import { spendCooldown } from "../usage"
import {
  DEEPGRAM_USAGE_LABEL,
  INGEST_COOLDOWN_MS,
  INGEST_USAGE_LABEL,
  transcriptionCostMicros,
  VOICE_COOLDOWN_MS,
  VOICE_USAGE_LABEL,
} from "./ingest-limits"

/**
 * The database half of the ingest limits. See ingest-limits.ts for the numbers
 * and the reasons.
 *
 * Everything here writes to and reads from `usage_event`, the same table the
 * model meter uses, with the `model` column as a label (`x:read`, `x:post`,
 * `voice:transcribe` already do this). Deepgram is priced per second, not per
 * token, so `deepgram:transcribe` rows put the **seconds of audio** in
 * `input_tokens`. That is a stretch of the column, the same kind `x:post`
 * makes of `model`, and it is what lets the daily ceiling count the thing
 * bought (seconds) rather than infer it back from a cost that moves with the
 * price. `summariseUsage` leaves label rows out of its token sums for this
 * reason.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function newUsageId(): string {
  return `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
}

/** Seconds of Deepgram audio this person bought in the last rolling day. */
export async function transcribedSecondsToday(
  userId: string,
  now: number = Date.now()
): Promise<number> {
  const [row] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${usageEvent.inputTokens}), 0)::int`,
    })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.userId, userId),
        eq(usageEvent.model, DEEPGRAM_USAGE_LABEL),
        gte(usageEvent.createdAt, new Date(now - DAY_MS))
      )
    )

  return row?.seconds ?? 0
}

/** Whether this person may start another ingest yet. Read-only. */
export function ingestCooldown(userId: string) {
  return spendCooldown(userId, INGEST_USAGE_LABEL, INGEST_COOLDOWN_MS)
}

/**
 * One ingest started. Written before the claim, and awaited: a cooldown whose
 * attempt row failed to write is no cooldown, so a failure here refuses the
 * run rather than letting it go ahead unlogged. Zero cost, because the
 * transcode is function time and not a line on anyone's invoice we can price.
 */
export async function recordIngestStart(userId: string): Promise<void> {
  await db.insert(usageEvent).values({
    id: newUsageId(),
    userId,
    conversationId: INGEST_USAGE_LABEL,
    model: INGEST_USAGE_LABEL,
    costMicros: 0,
  })
}

/** Whether this person may clean another take's voice yet. Read-only. */
export function voiceCooldown(userId: string) {
  return spendCooldown(userId, VOICE_USAGE_LABEL, VOICE_COOLDOWN_MS)
}

/** One voice clean started: the cooldown's row, zero cost, like an ingest. */
export async function recordVoiceStart(userId: string): Promise<void> {
  await db.insert(usageEvent).values({
    id: newUsageId(),
    userId,
    conversationId: VOICE_USAGE_LABEL,
    model: VOICE_USAGE_LABEL,
    costMicros: 0,
  })
}

/**
 * One Deepgram request, metered **before** it is sent.
 *
 * Before rather than after, because a request that times out on our side may
 * still be billed on theirs, and a meter that only writes on success
 * undercounts exactly the runs that went wrong. Awaited and allowed to throw:
 * the transcriber treats a throw as a failed transcript (a warning, not a
 * failed asset), so an unmetered request is never sent.
 */
export async function recordTranscription(
  userId: string,
  assetId: string,
  seconds: number
): Promise<void> {
  if (seconds <= 0) return

  await db.insert(usageEvent).values({
    id: newUsageId(),
    userId,
    conversationId: `asset:${assetId}`,
    model: DEEPGRAM_USAGE_LABEL,
    // Whole seconds, rounded up: Deepgram does not bill a fraction of the
    // first second as free, and the ceiling should not either.
    inputTokens: Math.ceil(seconds),
    costMicros: transcriptionCostMicros(seconds),
  })
}
