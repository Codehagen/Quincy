import { createIdGenerator } from "ai"
import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "../db"
import { videoProject } from "../schema-app"
import { documentForAsset } from "./document"
import { RevisionConflictError } from "./ops"
import { us } from "./time"
import { UNLOCKED, type Author, type VideoDocument } from "./types"

/**
 * Reading and writing the edit document.
 *
 * Scoped to a user id in the `where` clause rather than checked after the read,
 * the same as assets.ts: someone else's project id matches no rows and comes
 * back as "not found", which is also the answer for an id that never existed.
 */

const newProjectId = createIdGenerator({ prefix: "vp", size: 16 })

export type VideoProjectRow = typeof videoProject.$inferSelect

/**
 * Re-exported, not redefined.
 *
 * ops.ts already raises this when `applyOps` is given a stale revision, and the
 * storage layer raises it for the same reason at the other end of the same
 * write. Two classes with one name is the bug where an `instanceof` check in a
 * route passes for one path and silently falls through to a 500 on the other —
 * and the two paths are "the client was stale" and "the client was stale",
 * which nobody would ever think to test separately.
 */
export { RevisionConflictError } from "./ops"

export async function createProjectFromAsset(
  userId: string,
  asset: {
    id: string
    filename: string
    durationUs: number | null
    width: number | null
    height: number | null
    fps: number | null
    rotation: number
    thumbnailKey: string | null
  }
): Promise<VideoProjectRow> {
  const document = documentForAsset({
    id: asset.id,
    filename: asset.filename,
    // An asset that reached `ready` has all of these. Defaulting rather than
    // asserting because a project that opens on a zero-length clip is a
    // recoverable annoyance, and a 500 in the middle of an upload is not.
    durationUs: us(asset.durationUs ?? 0),
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    fps: asset.fps,
    rotation: asset.rotation,
  })

  const rows = await db
    .insert(videoProject)
    .values({
      id: newProjectId(),
      userId,
      title: document.metadata.name,
      document,
      revision: 0,
      lock: UNLOCKED,
      // The asset's poster frame, until a render of frame one replaces it. A
      // project list with no thumbnails is a list of filenames.
      thumbnailKey: asset.thumbnailKey,
    })
    .returning()

  return rows[0]
}

export async function getProject(
  id: string,
  userId: string
): Promise<VideoProjectRow | null> {
  const rows = await db
    .select()
    .from(videoProject)
    .where(and(eq(videoProject.id, id), eq(videoProject.userId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function listProjects(
  userId: string,
  limit = 50
): Promise<VideoProjectRow[]> {
  return db
    .select()
    .from(videoProject)
    .where(eq(videoProject.userId, userId))
    .orderBy(desc(videoProject.updatedAt))
    .limit(limit)
}

/**
 * Write the document, but only if nobody moved it first.
 *
 * The revision goes into the `where` clause, so the check and the write are one
 * statement and there is no window between them. That matters more here than
 * almost anywhere else in the app: an agent run reads the document, thinks for
 * a few seconds, and writes back — and in those seconds the person watching may
 * well have dragged a clip. A read-then-write would silently discard the drag,
 * and the person would watch their own edit disappear with no error anywhere.
 *
 * Losing the race is not a failure. It means re-reading and replaying, which is
 * why this raises a typed error rather than returning null: "no rows updated"
 * is indistinguishable from "no such project" at the driver, and only one of
 * those is worth retrying.
 */
export async function saveDocument(
  id: string,
  userId: string,
  document: VideoDocument,
  expectedRevision: number
): Promise<VideoProjectRow> {
  const stamped: VideoDocument = {
    ...document,
    metadata: {
      ...document.metadata,
      updatedAt: new Date().toISOString(),
    },
  }

  const rows = await db
    .update(videoProject)
    .set({
      document: stamped,
      revision: expectedRevision + 1,
      title: stamped.metadata.name,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(videoProject.id, id),
        eq(videoProject.userId, userId),
        eq(videoProject.revision, expectedRevision)
      )
    )
    .returning()

  if (rows[0]) return rows[0]

  // Nothing was written. Read once more to say which of the two happened.
  const current = await getProject(id, userId)
  if (!current) throw new Error("No such project.")

  throw new RevisionConflictError(expectedRevision, current.revision)
}

/**
 * Take the document for the length of an agent run.
 *
 * A lock rather than a merge, and the reasoning is in DocumentLock: a real
 * merge between concurrent human and agent edits is a CRDT and weeks of work,
 * for a case that lasts a few seconds.
 *
 * Conditional on the document being unlocked, in one statement, for the same
 * reason saveDocument puts the revision in the where clause — two runs claiming
 * at once is exactly the case a lock exists to prevent, so it cannot be checked
 * in application code.
 */
export async function lockProject(
  id: string,
  userId: string,
  runId: string,
  lockedBy: Author = "agent"
): Promise<boolean> {
  const claimed = await db
    .update(videoProject)
    .set({
      lock: {
        status: "locked",
        runId,
        lockedBy,
        startedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(videoProject.id, id),
        eq(videoProject.userId, userId),
        // `->>` reads the field as text, which is what a string comparison in
        // SQL needs. Comparing the whole jsonb object would depend on key order.
        sql`${videoProject.lock} ->> 'status' = 'unlocked'`
      )
    )
    .returning({ id: videoProject.id })

  return claimed.length > 0
}

export async function unlockProject(id: string, userId: string): Promise<void> {
  await db
    .update(videoProject)
    .set({ lock: UNLOCKED, updatedAt: new Date() })
    .where(and(eq(videoProject.id, id), eq(videoProject.userId, userId)))
}
