import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"

import { db } from "./db"
import { usageEvent } from "./schema-app"
import { estimateCostMicros, type Micros } from "./pricing"

/**
 * Record what a turn consumed.
 *
 * Called from the chat route's `onEnd`, after the answer has already reached
 * the browser — so this costs the user nothing in latency, and a failure costs
 * them nothing at all. The caller swallows errors for exactly that reason.
 *
 * Recorded for everyone, paying or trialing. The point is knowing what a user
 * costs, and a paying user's cost is the more interesting number of the two.
 */
export async function recordUsage(input: {
  userId: string
  conversationId?: string | null
  model: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}): Promise<void> {
  const costMicros = estimateCostMicros(input.model, {
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
  })

  await db.insert(usageEvent).values({
    id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    userId: input.userId,
    conversationId: input.conversationId ?? null,
    model: input.model,
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
    costMicros,
  })
}

export type UsageSummary = {
  turns: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  costMicros: Micros
}

/**
 * One user's usage since a given moment. One query, aggregated in Postgres
 * rather than by pulling rows across the wire — the row count grows with every
 * turn forever, and lib/session.ts's note about ~120ms round trips applies here
 * too.
 */
export async function summariseUsage(
  userId: string,
  since: Date
): Promise<UsageSummary> {
  const [row] = await db
    .select({
      turns: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${usageEvent.inputTokens}), 0)::int`,
      cachedInputTokens: sql<number>`coalesce(sum(${usageEvent.cachedInputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageEvent.outputTokens}), 0)::int`,
      costMicros: sql<number>`coalesce(sum(${usageEvent.costMicros}), 0)::int`,
    })
    .from(usageEvent)
    .where(and(eq(usageEvent.userId, userId), gte(usageEvent.createdAt, since)))

  return (
    row ?? {
      turns: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
    }
  )
}

/**
 * Has this user triggered a generation on any of these models inside the
 * window? The metering row is the attempt log — written whether or not the
 * result was kept, which is exactly what a cooldown must count (a "found
 * nothing" answer still spent).
 *
 * Read-then-act, deliberately: two presses landing inside one round trip
 * both pass, which bounds the race at 2 where there was no bound at all.
 * The voice path gets the truly atomic claim because its per-unit cost is
 * an order of magnitude higher; these are button-presses on cheap calls.
 */
export async function spendCooldown(
  userId: string,
  models: string[],
  cooldownMs: number
): Promise<{ ready: true } | { ready: false; secondsLeft: number }> {
  const [recent] = await db
    .select({ createdAt: usageEvent.createdAt })
    .from(usageEvent)
    .where(
      and(eq(usageEvent.userId, userId), inArray(usageEvent.model, models))
    )
    .orderBy(desc(usageEvent.createdAt))
    .limit(1)

  if (!recent) return { ready: true }

  const elapsed = Date.now() - recent.createdAt.getTime()
  if (elapsed >= cooldownMs) return { ready: true }

  return {
    ready: false,
    secondsLeft: Math.ceil((cooldownMs - elapsed) / 1000),
  }
}

/** The most recent turns, for the activity list on /credits. */
export async function recentUsage(userId: string, limit = 10) {
  return db
    .select({
      id: usageEvent.id,
      model: usageEvent.model,
      inputTokens: usageEvent.inputTokens,
      outputTokens: usageEvent.outputTokens,
      costMicros: usageEvent.costMicros,
      createdAt: usageEvent.createdAt,
    })
    .from(usageEvent)
    .where(eq(usageEvent.userId, userId))
    .orderBy(desc(usageEvent.createdAt))
    .limit(limit)
}
