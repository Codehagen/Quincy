import { and, eq, gte, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { channelConnection, draft, draftVersion, postMetric, sourceItem, usageEvent } from "@/lib/schema-app"

import type { NumbersData, Post, QuincyWeek } from "./data"

/**
 * The signed-in account's own numbers, in the lab's shape. Reads only:
 * five SELECTs, nothing written, nothing bought (no X call; every number
 * here was already measured by the morning refresh).
 *
 * What it cannot know, it says rather than invents:
 * - `people` is null: nothing in the schema records who replied.
 * - A post's day is the day it was first measured. Posts that were already
 *   out when the readings began (the first capture day) have no day, so
 *   they count toward your median and not toward a week's cadence.
 * - A post the corpus import has not caught up with has no text in Quincy;
 *   its hook says so.
 */

const DAY = 86_400_000
const HISTORY_DAYS = 26 * 7

function utcDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export async function loadRealNumbers(userId: string): Promise<NumbersData> {
  const now = new Date()
  const today = utcDay(now)
  const since = new Date(today - HISTORY_DAYS * DAY)
  const daysAgo = (d: Date) => Math.round((today - utcDay(d)) / DAY)

  const [readings, connection, usage, drafts, approvals, bookmarks] = await Promise.all([
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
      .where(and(eq(postMetric.userId, userId), gte(postMetric.capturedAt, since)))
      .orderBy(postMetric.externalId, postMetric.capturedAt),
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
  ])

  const byPost = new Map<string, typeof readings>()
  for (const r of readings) {
    const list = byPost.get(r.externalId)
    if (list) list.push(r)
    else byPost.set(r.externalId, [r])
  }
  const firstCapture = readings.reduce<number | null>((min, r) => {
    const d = utcDay(r.capturedAt)
    return min === null || d < min ? d : min
  }, null)

  const matchedIds = [...new Set(readings.map((r) => r.sourceItemId).filter(Boolean))]
  const bodies = matchedIds.length
    ? await db.select({ id: sourceItem.id, body: sourceItem.body }).from(sourceItem).where(inArray(sourceItem.id, matchedIds))
    : []
  const bodyOf = new Map(bodies.map((b) => [b.id, b.body]))

  const posts: Post[] = []
  let undated = 0
  let textless = 0
  for (const [externalId, rs] of byPost) {
    const first = rs[0]!
    const last = rs[rs.length - 1]!
    const startedWithSeries = firstCapture !== null && utcDay(first.capturedAt) === firstCapture
    if (startedWithSeries) undated++
    const body = rs.find((r) => r.sourceItemId && bodyOf.has(r.sourceItemId))
    const text = body ? bodyOf.get(body.sourceItemId)! : null
    if (!text) textless++
    const day = startedWithSeries ? null : daysAgo(first.capturedAt)
    posts.push({
      id: externalId,
      hook: text ? text.split("\n")[0]!.replace(/(?:https?:\/\/t\.co\/\S*\s*)+$/, "").trim() || "A post on X" : `A post on X, first measured ${new Date(first.capturedAt).toISOString().slice(5, 10)}`,
      body: text,
      day,
      views: last.impressions,
      replies: last.replies,
      likes: last.likes,
      reposts: last.reposts,
      bookmarks: last.bookmarks,
      climb: rs.slice(0, 14).map((r) => r.impressions),
      fromQuincy: false,
      repliers: [],
    })
  }

  const weeks = firstCapture === null ? 0 : Math.max(0, Math.floor((today - firstCapture) / DAY / 7))
  const quincy: QuincyWeek[] = Array.from({ length: Math.max(weeks, 1) }, () => ({ read: 0, drafted: 0, approved: 0, posted: 0, costMicros: 0 }))
  const at = (d: Date | null) => (d ? quincy[Math.floor(daysAgo(d) / 7)] : undefined)
  for (const u of usage) {
    const q = at(u.createdAt)
    if (!q) continue
    q.costMicros += u.costMicros
    if (u.model === "x:post") q.posted++
  }
  for (const d of drafts) {
    const q = at(d.createdAt)
    if (q) q.drafted++
  }
  for (const a of approvals) {
    const q = at(a.approvedAt)
    if (q) q.approved++
  }
  for (const b of bookmarks) {
    const q = at(b.createdAt)
    if (q) q.read++
  }

  const notes: string[] = []
  if (undated > 0) notes.push(`${undated} posts were already out when readings began, so they count toward your median but not toward a week.`)
  if (textless > 0) notes.push(`${textless} of ${posts.length} measured posts have no text in Quincy yet: the import has not caught up with them.`)
  notes.push("Who replied is not read yet, so the people panel is a proposal.")

  return {
    source: "yours",
    today: new Date(today).toISOString().slice(0, 10),
    connected: connection[0]?.state === "active",
    historyWeeks: weeks,
    posts,
    people: null,
    quincy,
    lastRead: readings.length ? `on ${new Date(Math.max(...readings.map((r) => utcDay(r.capturedAt)))).toISOString().slice(0, 10)}` : "never",
    notes,
  }
}
