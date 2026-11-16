import { Suspense } from "react"

import { channelGaps, CHANNEL_LABELS, getRiffs } from "@/lib/riffs"
import { listConnections } from "@/lib/channels"
import { writesPerShape } from "@/lib/drafting"
import { getSession } from "@/lib/session"
import { IdeasScreen } from "@/components/riffs/ideas-screen"
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
 * **Capture is the page; the queue is what came back.** Decided from the
 * four-way prototype at /prototypes/riffs on 2026-08-08: the product then held
 * six riffs across two accounts, every one from voice or paste, so the live
 * problem was input rather than the size of the queue.
 *
 * **The list is a working queue, not an archive.** It stays short because
 * acting on a riff removes it, not because it is filtered.
 *
 * **A kit page since 2026-11-16** (plans/029). The stack of riff cards became
 * list and detail in one Stage (docs/design/page.md): the riffs as rows by
 * day, the open one under them as a RiffCard. That is the Fold the 2026-08-08
 * decision named as the next change, taken with the move to the kit. See
 * components/riffs/ideas-screen.tsx.
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

  // Concurrent: neither read needs the other, and RiffsRefresh re-runs this
  // page every four seconds while a voice riff processes.
  const [riffs, allConnections] = await Promise.all([
    getRiffs(session.user),
    listConnections(session.user.id),
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
   * `targetsFor` the action uses, so the card states what will happen.
   */
  const writes = writesPerShape(connected.map((c) => c.id))

  /** Per riff, the channels none of its ideas reach. Resolved here, once. */
  const gaps = Object.fromEntries(riffs.map((r) => [r.id, channelGaps(r, connected)]))

  /**
   * The screen renders KitPage itself, because the summary counts the ideas
   * still waiting (docs/design/page.md, "Where KitPage renders"). Suspense
   * because `useQueryState` reads which idea is open (`?idea=`).
   */
  return (
    <Suspense>
      <IdeasScreen riffs={riffs} gaps={gaps} writes={writes} />
    </Suspense>
  )
}
