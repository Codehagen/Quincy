import { and, eq } from "drizzle-orm"

import { db } from "./db"
import { riff } from "./schema-app"

/**
 * Archive one riff, scoped to its owner in the same statement as the write.
 *
 * Shared by `archiveRiff` (app/(app)/ideas/actions.ts) and the keepalive route
 * the Ideas screen calls when the page goes away with a Dismiss still waiting
 * (app/api/riffs/archive/route.ts). One query in one place, so the two paths
 * cannot drift apart on who may archive what.
 *
 * `archived`, not a delete: `getRiffs` filters it out and the scrap survives.
 * Returns false when no row of that user's matched — someone else's id, or
 * no such riff.
 */
export async function archiveRiffFor(
  userId: string,
  riffId: string
): Promise<boolean> {
  if (typeof riffId !== "string" || riffId.length === 0 || riffId.length > 200) {
    return false
  }

  const updated = await db
    .update(riff)
    .set({ state: "archived", updatedAt: new Date() })
    .where(and(eq(riff.id, riffId), eq(riff.userId, userId)))
    .returning({ id: riff.id })

  return updated.length > 0
}
