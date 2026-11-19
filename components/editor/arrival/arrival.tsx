"use client"

import * as React from "react"

import { StatusIcon } from "@/components/ai-elements/status-icon"
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"

import { passState, REVEAL_MS, SWEEP_MS, sweepStops, type Pass } from "./passes"
import "./arrival.css"

/*
 * The arrival's two drawn parts (plans/036, phase G).
 *
 * The passes are the lead: each enters as it starts, reads (spinner,
 * shimmer), and resolves to a check with its finding, the next starting just
 * before the last settles. They sit over the noticed block's own space, so
 * nothing moves when the block takes their place.
 *
 * The sweep is carried by the passes: one ink line over the Main lane that
 * reaches a third of the take as each pass resolves.
 */

export function ArrivalPasses({
  passes,
  atMs,
  settled,
}: {
  passes: readonly Pass[]
  atMs: number
  /** The noticed block has arrived: the passes give way. */
  settled: boolean
}) {
  return (
    // Hidden from assistive tech: the margin announces the reading once,
    // when it settles, and the noticed block carries the same facts.
    // The passes are a Task's steps (AI Elements): Trace lines, the one
    // being read running (spinner and shimmer), the read ones checked with
    // their finding as the description.
    <Trace aria-hidden="true" data-settled={settled ? "" : undefined} className="arrival-passes">
      {passes.map((pass, index) => {
        const state = passState(index, atMs)
        const done = state === "done"
        return (
          <TraceLine
            key={pass.label}
            data-state={state}
            status={done ? undefined : "running"}
            className="arrival-pass"
          >
            <TraceIcon>
              <StatusIcon status={done ? undefined : "running"} />
            </TraceIcon>
            <TraceTitle>{pass.label}</TraceTitle>
            {/* Always in the flow, shown when read: the pass never grows. */}
            <TraceDescription className="arrival-found tabular-nums">{pass.found}</TraceDescription>
          </TraceLine>
        )
      })}
    </Trace>
  )
}

/** The ink line over the Main lane, from its first clip to the end of the take. */
export function ScanSweep({ widthPercent }: { widthPercent: number }) {
  const line = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const node = line.current
    if (!node || typeof node.animate !== "function") return
    // One segment per pass, each easing into the moment its pass resolves.
    const travel = node.animate(
      sweepStops().map((stop) => ({
        offset: stop.offset,
        transform: `translateX(${stop.at * 100}%)`,
        easing: "cubic-bezier(0.37, 0, 0.63, 1)",
      })),
      { duration: SWEEP_MS, fill: "forwards" }
    )
    const fade = node.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: 0.08 },
        { opacity: 1, offset: SWEEP_MS / REVEAL_MS - 0.04 },
        { opacity: 0 },
      ],
      // Gone by the reveal, when the sweep is taken off the lane.
      { duration: REVEAL_MS, fill: "forwards" }
    )
    return () => {
      travel.cancel()
      fade.cancel()
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 z-10 overflow-hidden rounded-[3px]"
      style={{ width: `${Math.min(100, Math.max(0, widthPercent))}%` }}
    >
      <div ref={line} className="arrival-sweep absolute inset-0">
        <span className="arrival-sweep-wash" />
        <span className="arrival-sweep-line" />
      </div>
    </div>
  )
}
