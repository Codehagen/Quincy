import { KitRoot } from "@/components/kit"
import { IdeasScreen } from "@/components/riffs/ideas-screen"

import { RIFFS } from "./data"

/**
 * The shipped Ideas screen (/riffs) on fixture riffs, to see the filled
 * states without seeding the shared dev account. Pressing Draft, Dismiss or
 * Ask calls the real server actions, which answer "Not signed in." or find
 * no such row here: look, do not press.
 *
 * `?empty` shows the empty page.
 */
export const metadata = {
  title: "Ideas (fixtures)",
  robots: { index: false, follow: false },
}

export default async function IdeasFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { empty } = await searchParams
  const riffs = empty !== undefined ? [] : RIFFS
  // One riff reaches no LinkedIn, so the channel-gap row shows.
  const gaps = Object.fromEntries(
    riffs.map((r, i) => [r.id, i === 0 ? [{ id: "linkedin", label: "LinkedIn" }] : []])
  )
  return (
    <KitRoot>
      <IdeasScreen
        riffs={riffs}
        gaps={gaps}
        writes={{ "Short post": 2, Thread: 1, Carousel: 1, Essay: 0 }}
      />
    </KitRoot>
  )
}
