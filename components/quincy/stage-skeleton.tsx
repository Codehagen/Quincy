import * as React from "react"

import { Card, KitPage, Skeleton, type SkeletonWidth } from "@/components/kit"

/** One bar on a body line's height, so a stack of them is as tall as the copy it stands for. */
function Line({ width }: { width: SkeletonWidth }) {
  return (
    <span className="flex h-[1lh] items-center">
      <Skeleton width={width} />
    </span>
  )
}

/**
 * A Stage while its object loads, for a page's Suspense fallback under the
 * real KitPage title: the lead's line, then a Card of bars at body height.
 * Static (no shimmer), so it needs no reduced-motion path. Inert and hidden
 * from assistive tech: the title above already says where you are.
 *
 * `lead={null}` for a Stage that has none (an object that opens with its own
 * words). Vary `lines`: equal bars read as a table.
 */
export function StageSkeleton({
  lead = "62%",
  lines,
}: {
  lead?: SkeletonWidth | null
  lines: readonly SkeletonWidth[]
}) {
  return (
    <div aria-hidden inert data-slot="stage-skeleton" className="flex flex-col text-kit-body">
      {lead != null ? (
        <div className="mb-kit-lead-gap max-w-kit-lead">
          <Line width={lead} />
        </div>
      ) : null}
      <Card>
        <span className="flex flex-col">
          {lines.map((w, i) => (
            <Line key={i} width={w} />
          ))}
        </span>
      </Card>
    </div>
  )
}

/**
 * A KitPage whose title is not known until the reads land (a rhythm's or a
 * channel's name, from the URL). The title line is held by a blank, not by
 * a word that would be swapped for another, so the name arrives in place.
 * The frame is inert and hidden; `status` is what a screen reader hears.
 */
export function UntitledPageSkeleton({
  status,
  actions,
  children,
}: {
  status: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <span role="status" className="sr-only">
        {status}
      </span>
      <div aria-hidden inert className="contents">
        <KitPage title={"\u00a0"} summary={<Line width="48%" />} actions={actions}>
          {children}
        </KitPage>
      </div>
    </>
  )
}
