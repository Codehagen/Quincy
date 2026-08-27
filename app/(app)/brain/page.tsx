import { redirect } from "next/navigation"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import { brainKeys } from "@/lib/brain-keys"
import { getBrain } from "@/lib/brain"
import { corpusSummary } from "@/lib/corpus-x"
import { getServerQueryClient } from "@/lib/query-client"
import { getSession } from "@/lib/session"
import { storyGaps } from "@/lib/story-gaps"
import { strategyChannels, strategyNotice } from "@/lib/strategy"
import { BrainWorkspace } from "@/components/brain/brain-workspace"
import { constructMetadata } from "@/lib/metadata"

/**
 * The brain, edited.
 *
 * This route is a shell now: it authenticates, prefetches, and hands the cache
 * to the client. The page list only changes when you save one, and every tree
 * click used to spend a fresh round trip re-reading it — measured from this
 * app, the query executes in 0.06ms and the round trip to Neon is ~120ms, so
 * the whole cost was the network, paid again on every navigation.
 *
 * Prefetch and dehydrate rather than letting the client fetch on mount. The
 * data ships inside the HTML, so the first paint already has the tree in it and
 * there is no spinner-then-content waterfall on a cold load.
 *
 * The write path has not moved. `data` is still the authoritative
 * representation for voice and instructions, saves still go through
 * lib/brain.ts, and the invariants still reject a brain the agent would refuse
 * — see docs/brain.md. Channel strategy left entirely; it is configuration for
 * a place you publish, not knowledge about you, and it lives at /channels.
 */
export const metadata = constructMetadata({
  title: "Brain",
  noIndex: true,
})

export default async function BrainPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/brain")
  }

  const queryClient = getServerQueryClient()

  // Seeded from the database directly rather than through /api/brain. The data
  // is already reachable from here, and prefetching through the route would
  // make the server issue an HTTP request to itself to read a database it is
  // holding a connection to.
  const pages = await queryClient.fetchQuery({
    queryKey: brainKeys.list(session.user.id),
    queryFn: () => getBrain(session.user.id),
  })

  /**
   * The four things the client cannot work out for itself, resolved together.
   *
   * The gap list is counted in Postgres, the channel list is a connection
   * read, the corpus count is one aggregate and the cooldown is one row —
   * none of them are in the brain, and all of them are read-only. They run
   * concurrently, and the story pages the gap count needs are the ones
   * `fetchQuery` just returned rather than a second read of the same table.
   */
  const [gaps, channels, corpus, notice] = await Promise.all([
    storyGaps(
      session.user.id,
      pages.filter((page) => page.kind === "story")
    ),
    strategyChannels(session.user.id),
    corpusSummary(session.user.id),
    strategyNotice(session.user.id, session.user.timezone),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BrainWorkspace
        userId={session.user.id}
        gaps={gaps}
        strategyChannels={channels}
        corpusPosts={corpus.items}
        proposeNotice={notice}
      />
    </HydrationBoundary>
  )
}
