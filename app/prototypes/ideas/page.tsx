import { Suspense } from "react"

import type { Riff } from "@/lib/riffs"
import { markFor } from "@/lib/source-span"
import { IdeasWorkspace } from "@/components/riffs/ideas-workspace"

import { LAB_RIFFS, readingsFor } from "../ideas-lab/fixtures"
import { Shell } from "../shell"

/**
 * The shipped Ideas workspace (/ideas) on fixture riffs, inside the real app
 * shell, to see the filled states without seeding the shared dev account.
 * The fixtures carry quoted lines, resolved to marks by the same `markFor`
 * the loader uses; a few riffs have none, so unmarked ideas show too.
 *
 * Draft, Not this one, Dismiss and Ask call the real server actions, which
 * answer "Not signed in." or find no such row here: nothing is written and
 * nothing spends. Look; pressing proves only that the call stops there.
 *
 * `?empty` shows the empty page; `?pace` states a usual week.
 */
export const metadata = {
  title: "Ideas (fixtures)",
  robots: { index: false, follow: false },
}

function withMarks(riffs: readonly Riff[]): Riff[] {
  return riffs.map((riff) => {
    const readings = readingsFor(riff)
    return {
      ...riff,
      angles: riff.angles.map((a) => {
        const mark = markFor(riff.scrap, readings[a.id]?.line)
        return mark ? { ...a, mark } : a
      }),
    }
  })
}

export default async function IdeasFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { empty, pace } = await searchParams
  const riffs = empty !== undefined ? [] : withMarks(LAB_RIFFS)
  // The first riff reaches no LinkedIn, so the channel-gap row shows.
  const gaps = Object.fromEntries(
    riffs.map((r, i) => [r.id, i === 0 ? [{ id: "linkedin", label: "LinkedIn" }] : []])
  )
  return (
    <Shell>
      <Suspense>
        <IdeasWorkspace
          riffs={riffs}
          gaps={gaps}
          writes={{ "Short post": 2, Thread: 1, Carousel: 1, Essay: 0 }}
          pace={pace !== undefined ? { thisWeek: 0, usual: 4 } : { thisWeek: 0, usual: null }}
        />
      </Suspense>
    </Shell>
  )
}
