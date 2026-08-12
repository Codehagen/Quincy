import { redirect } from "next/navigation"
import { dehydrate, HydrationBoundary } from "@tanstack/react-query"

import { brainKeys } from "@/lib/brain-keys"
import { getBrain } from "@/lib/brain"
import { getServerQueryClient } from "@/lib/query-client"
import { getSession } from "@/lib/session"
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
  await queryClient.prefetchQuery({
    queryKey: brainKeys.list(session.user.id),
    queryFn: () => getBrain(session.user.id),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BrainWorkspace userId={session.user.id} />
    </HydrationBoundary>
  )
}
