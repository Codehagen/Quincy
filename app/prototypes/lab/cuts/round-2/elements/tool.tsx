"use client"

/*
 * Tool, on the kit: one tool call as one Trace line, following the part from
 * input to output. `input-available` is the step in progress (the friend at
 * work and the words of what it is doing); `output-available` is the line
 * the tool reported, in prose. A denied or failed call says so.
 */

import type * as React from "react"

import type { CutsPart } from "../chat"
import { TraceLine, type TraceStatus } from "./trace"

type ToolPart = Extract<CutsPart, { type: `tool-${string}` }>

export function toolStatus(part: ToolPart, streaming: boolean): TraceStatus {
  switch (part.state) {
    case "output-available":
      return part.preliminary ? (streaming ? "running" : "error") : "done"
    case "output-error":
      return "error"
    case "output-denied":
      return "denied"
    case "approval-requested":
    case "approval-responded":
      return "waiting"
    default:
      return streaming ? "running" : "error"
  }
}

export function ToolRow({
  part,
  streaming,
  children,
}: {
  part: ToolPart
  streaming: boolean
  children?: React.ReactNode
}) {
  const status = toolStatus(part, streaming)
  const out = part.state === "output-available" ? (part.output as { say?: string; detail?: string }) : undefined
  return (
    <TraceLine status={status} title={out?.say ?? part.title ?? part.type.replace("tool-", "")} meta={status === "done" ? out?.detail : undefined}>
      {children}
    </TraceLine>
  )
}
