import { and, eq, inArray } from "drizzle-orm"

import { db } from "./db"
import { channelConnection, postMetric } from "./schema-app"

/**
 * Delete what Quincy stored from Instagram for one Meta user.
 *
 * The id is the app-scoped Facebook user id in the signed request. It is
 * matched on `meta_user_id` only. `external_id` is the Instagram professional
 * account, a different id, and querying it would delete the wrong row if the
 * two numbers ever coincided.
 *
 * Removed: the Instagram connection, tokens included, and Instagram insight
 * rows (`post_metric`) for the Quincy accounts those connections belonged
 * to. Drafts, the account, and X or LinkedIn stay. Those belong to the
 * account-deletion email, not to this callback.
 *
 * Returns how many connection rows were deleted. Zero is a completed
 * request: Meta still needs a confirmation when we held nothing.
 */
export async function deleteInstagramDataForMetaUser(
  metaUserId: string
): Promise<number> {
  const rows = await db
    .select({ userId: channelConnection.userId })
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.channel, "instagram"),
        eq(channelConnection.metaUserId, metaUserId)
      )
    )

  if (rows.length === 0) return 0

  const userIds = [...new Set(rows.map((row) => row.userId))]

  await db
    .delete(postMetric)
    .where(
      and(
        eq(postMetric.channel, "instagram"),
        inArray(postMetric.userId, userIds)
      )
    )

  const deleted = await db
    .delete(channelConnection)
    .where(
      and(
        eq(channelConnection.channel, "instagram"),
        eq(channelConnection.metaUserId, metaUserId)
      )
    )
    .returning({ id: channelConnection.id })

  return deleted.length
}
