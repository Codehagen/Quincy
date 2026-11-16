"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

export type ProgressProps = {
  /** What is happening, in words: "Reading your sources". Names the bar. */
  label: string
  /** Done so far. `null` when nobody can say yet; the bar then only says "working". */
  value: number | null
  /** Default 100. With a count, the number of things: 3 sources. */
  max?: number
  /**
   * Show "1 of 3" at the row's end, in Mono. For counted things (sources,
   * posts); leave it off for a percentage nobody counts.
   */
  count?: boolean
}

/**
 * How far a job Quincy is doing has got, when it takes long enough to watch:
 * reading sources, importing posts. The label above in ink, the count at its
 * end in Mono, a 6px bar under them: the track grey, the fill ink. Under a
 * second, or with nothing to count, it is not a Progress: a pending Button
 * label or a LiveDot says it.
 *
 * The fill eases to each new value (320ms); reduced motion jumps. With no
 * value the bar holds a short ink segment that slides, and under reduced
 * motion that segment stands still.
 */
export function Progress({ label, value, max = 100, count = false }: ProgressProps) {
  const known = value != null
  return (
    <ProgressPrimitive.Root
      value={value}
      max={max}
      // "1 of 3" is what is said, not "33%".
      getAriaValueText={(_formatted, v) => (v == null ? `${label}, working` : count ? `${v} of ${max}` : `${Math.round((v / max) * 100)}%`)}
      data-slot="kit-progress"
      className="flex w-full flex-col gap-kit-tight"
    >
      <div className="flex items-baseline justify-between gap-kit-related">
        <ProgressPrimitive.Label className="min-w-0 text-kit-body text-kit-ink">{label}</ProgressPrimitive.Label>
        {count && known ? (
          <span className="shrink-0 font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">
            {value} of {max}
          </span>
        ) : null}
      </div>
      <ProgressPrimitive.Track className="relative h-1.5 w-full overflow-hidden rounded-full bg-kit-track">
        <ProgressPrimitive.Indicator
          className={
            known
              ? "block h-full rounded-full bg-kit-ink transition-[width] duration-(--kit-duration-enter) ease-kit-out motion-reduce:transition-none"
              : "absolute inset-y-0 left-0 block w-1/3 rounded-full bg-kit-ink animate-kit-progress-slide motion-reduce:left-1/3 motion-reduce:animate-none"
          }
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}
