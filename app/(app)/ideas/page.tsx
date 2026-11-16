import { Suspense } from "react"

import { channelGaps, CHANNEL_LABELS, getIdeasPace, getRiffs } from "@/lib/riffs"
import { listConnections } from "@/lib/channels"
import { writesPerShape } from "@/lib/drafting"
import { getSession } from "@/lib/session"
import { IdeasWorkspace } from "@/components/riffs/ideas-workspace"
import { constructMetadata } from "@/lib/metadata"

/**
 * Work the raw material. Shown as **Ideas**, at /ideas since 2026-11-16 (it was
 * /riffs, which next.config.ts redirects); the code and the tables keep
 * `riff` until a rename is planned (plans/029).
 *
 * The step between Sources and Drafts: a scrap comes in, Quincy finds ideas
 * (angles) in it, and you decide which is worth writing before a word is
 * committed to a platform. Nothing here is a post.
 *
 * **The list is a working queue, not an archive.** It stays short because
 * acting on an idea removes it, not because it is filtered.
 *
 * **A workspace since 2026-11-16** (docs/design/workspace.md; decisions.md,
 * "Ideas is a working surface — Table"): a toolbar, a dense table of ideas,
 * and the open idea Marked up beside it, worked by key. Capture (Record a
 * thought, Adapt a post) moved into the toolbar; the queue is the page. See
 * components/riffs/ideas-workspace.tsx.
 */

export const metadata = constructMetadata({
  title: "Ideas",
  noIndex: true,
})

export default async function IdeasPage() {
  // The layout is the gate (app/(app)/layout.tsx): it redirects to /login
  // and keeps the query (?idea=…); a redirect here dropped it.
  const session = await getSession()
  if (!session) return null

  // Concurrent: none of the reads needs another, and RiffsRefresh re-runs
  // this page every four seconds while a voice riff processes.
  const [riffs, allConnections, pace] = await Promise.all([
    getRiffs(session.user),
    listConnections(session.user.id),
    getIdeasPace(session.user),
  ])

  /**
   * The channels this account actually publishes to: `active` only, because
   * a connection whose token was revoked is not somewhere Quincy can put a
   * post, so it is not a gap worth nagging about.
   */
  const connected = allConnections
    .filter((c) => c.state === "active")
    .map((c) => CHANNEL_LABELS[c.channel])
    .filter((c) => c !== undefined)

  /**
   * How many drafts "Draft this idea" writes, per shape, from the same
   * `targetsFor` the action uses, so the open idea states what will happen.
   */
  const writes = writesPerShape(connected.map((c) => c.id))

  /** Per riff, the channels none of its ideas reach. Resolved here, once. */
  const gaps = Object.fromEntries(riffs.map((r) => [r.id, channelGaps(r, connected)]))

  // Suspense because `useQueryState` reads which idea is open (`?idea=`).
  return (
    <Suspense>
      <IdeasWorkspace riffs={riffs} gaps={gaps} writes={writes} pace={pace} />
    </Suspense>
  )
}
