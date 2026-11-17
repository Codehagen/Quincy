import { and, eq, gte, inArray } from "drizzle-orm"

import { db } from "./db"
import { HISTORY_DAYS, shapeNumbers, type NumbersData, type Person } from "./numbers-read"
import { channelConnection, draft, draftVersion, postMetric, sourceItem, usageEvent } from "./schema-app"

/**
 * The loaders behind /numbers. Reads only: six SELECTs, nothing written,
 * nothing bought. Every number was already measured by the morning refresh
 * (lib/post-metrics.ts), which is where the X read, its ceiling and its
 * cooldown live. The arithmetic is lib/numbers-read.ts.
 */

const DAY = 86_400_000

export async function loadNumbers(userId: string, now = new Date()): Promise<NumbersData> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - HISTORY_DAYS * DAY)

  const [readings, connection, usage, drafts, approvals, bookmarks, people] = await Promise.all([
    db
      .select({
        externalId: postMetric.externalId,
        sourceItemId: postMetric.sourceItemId,
        capturedAt: postMetric.capturedAt,
        impressions: postMetric.impressions,
        replies: postMetric.replies,
        likes: postMetric.likes,
        reposts: postMetric.reposts,
        bookmarks: postMetric.bookmarks,
      })
      .from(postMetric)
      .where(and(eq(postMetric.userId, userId), gte(postMetric.capturedAt, since))),
    db
      .select({ state: channelConnection.state })
      .from(channelConnection)
      .where(and(eq(channelConnection.userId, userId), eq(channelConnection.channel, "x")))
      .limit(1),
    db
      .select({ model: usageEvent.model, createdAt: usageEvent.createdAt, costMicros: usageEvent.costMicros })
      .from(usageEvent)
      .where(and(eq(usageEvent.userId, userId), gte(usageEvent.createdAt, since))),
    db
      .select({ createdAt: draft.createdAt })
      .from(draft)
      .where(and(eq(draft.userId, userId), gte(draft.createdAt, since))),
    db
      .select({ approvedAt: draftVersion.approvedAt })
      .from(draftVersion)
      .innerJoin(draft, eq(draft.id, draftVersion.draftId))
      .where(and(eq(draft.userId, userId), gte(draftVersion.approvedAt, since))),
    db
      .select({ createdAt: sourceItem.createdAt })
      .from(sourceItem)
      .where(and(eq(sourceItem.userId, userId), eq(sourceItem.source, "x-bookmark"), gte(sourceItem.createdAt, since))),
    readRepliers(userId),
  ])

  const ids = [...new Set(readings.map((r) => r.sourceItemId).filter(Boolean))]
  const bodies = ids.length
    ? await db
        .select({ id: sourceItem.id, body: sourceItem.body })
        .from(sourceItem)
        .where(and(eq(sourceItem.userId, userId), inArray(sourceItem.id, ids)))
    : []

  return shapeNumbers({
    now,
    readings,
    bodies: new Map(bodies.map((b) => [b.id, b.body])),
    connected: connection[0]?.state === "active",
    usage,
    drafted: drafts.map((d) => d.createdAt),
    approved: approvals.flatMap((a) => (a.approvedAt ? [a.approvedAt] : [])),
    read: bookmarks.map((b) => b.createdAt),
    people,
  })
}

/**
 * Who replied, and when. Not stored anywhere yet, so this answers null and
 * the page says "Not read yet" rather than a number.
 *
 * The seam for an `x:replies` read: one read of each recent post's replies
 * in the morning refresh, metered under its own `usage_event` label, with a
 * ceiling on the pages it buys and a cooldown (AGENTS.md, "Money"), stored
 * as one row per reply (post, author handle, day, answered). When that table
 * exists, this SELECTs it and returns `Person[]`; nothing else changes.
 * It is deliberately not built here: it spends, and its ceiling and
 * cooldown are a decision of their own.
 */
async function readRepliers(userId: string): Promise<Person[] | null> {
  void userId
  return null
}
