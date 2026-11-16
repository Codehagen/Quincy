import { Suspense } from "react"

import { Screen } from "./screen"

/**
 * Filled states for the three setup pages (Channels, Rhythm's neighbours,
 * Numbers), laid out from fixtures against the real screen components the
 * pages render. The dev account has no channels and no corpus, so without
 * this the filled pages could only be seen on a real account.
 *
 * ?s=channels | channel | channel-stale | numbers. Nothing here writes.
 */
export const metadata = {
  title: "Prototype — Setup pages",
  robots: { index: false, follow: false },
}

export default function SetupPagesPrototype({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense>
      <Screen searchParams={searchParams} />
    </Suspense>
  )
}
