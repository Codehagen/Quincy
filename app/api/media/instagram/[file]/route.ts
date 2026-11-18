import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { renderCaptionCard } from "@/lib/instagram-card"
import { postIdFromCardFile } from "@/lib/instagram"
import { draftVersion, scheduledPost } from "@/lib/schema-app"

/**
 * The JPEG Meta fetches while publishing an Instagram post.
 *
 * No session. Meta's crawler has no cookie, and proxy.ts leaves paths that
 * end in `.jpg` out of the login redirect for that reason. The id is the
 * scheduled post's own unguessable id, and the row is served only once
 * publishing has started — a queued draft is not on the internet yet.
 *
 * The bytes are the approved caption, drawn as a card. See
 * lib/instagram-card.ts.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params
  const postId = postIdFromCardFile(file)
  if (!postId) return new Response(null, { status: 404 })

  const [row] = await db
    .select({
      state: scheduledPost.state,
      channel: draftVersion.channel,
      body: draftVersion.body,
    })
    .from(scheduledPost)
    .innerJoin(draftVersion, eq(draftVersion.id, scheduledPost.draftVersionId))
    .where(
      and(eq(scheduledPost.id, postId), eq(draftVersion.channel, "instagram"))
    )
    .limit(1)

  if (!row || (row.state !== "sending" && row.state !== "published")) {
    return new Response(null, { status: 404 })
  }

  const jpeg = renderCaptionCard(row.body)
  return new Response(Buffer.from(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=300",
    },
  })
}
