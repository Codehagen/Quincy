"use client"

/*
 * Task, on the kit: a run's edits as one task. While it works the steps
 * show one under another, every step the same shape; when it ends it folds
 * to one summary line ("5 edits · 37.0 → 32.5 s") that opens on press.
 */

import type * as React from "react"

import { Trace, TraceGroup, TraceLine } from "./trace"

export function Task({
  running,
  title,
  summary,
  children,
}: {
  running: boolean
  /** While it works. */
  title: React.ReactNode
  /** Once it ended. */
  summary: React.ReactNode
  /** ToolRows. */
  children: React.ReactNode
}) {
  return (
    <TraceGroup
      running={running}
      line={
        <Trace>
          <TraceLine status={running ? "running" : "done"} title={running ? title : summary} />
        </Trace>
      }
    >
      <Trace>{children}</Trace>
    </TraceGroup>
  )
}
