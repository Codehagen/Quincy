import * as React from "react"

import type { Metric } from "../data"

/**
 * The card's one number: what it is and over what window on the left, the
 * number on the right, tabular. Against the person's own usual when the
 * history holds one ("usual 22"), never a bare total, never a follower count.
 */
export function MetricRow({ m }: { m: Metric }) {
  return (
    <div className="flex items-baseline justify-between gap-kit-related text-kit-small">
      <span className="min-w-0 truncate text-kit-ink-muted">
        {m.label}
        {m.window !== "now" ? <span> · {m.window}</span> : null}
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
        <span className="font-kit-strong text-kit-ink">{m.value}</span>
        {m.usual != null ? <span className="text-kit-meta text-kit-ink-muted">· usual {m.usual}</span> : null}
      </span>
    </div>
  )
}
