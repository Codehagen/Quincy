"use client"

/*
 * Tool (AI Elements): one tool call as one Trace line that follows the call
 * from input to output. Pattern code from
 * ui.shadcn.com/docs/ai-elements/base/tool, on @/components/ui/trace.
 * Done: the line the tool reported, with its detail as the description;
 * detail under it (frames, reads) opens from the line. Running: the friend
 * and what it is doing.
 */

import type * as React from "react"

import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"

import { StatusIcon, type StepStatus } from "./status-icon"

export function ToolRow({
  status,
  title,
  description,
  defaultOpen,
  children,
}: {
  status: StepStatus
  title: React.ReactNode
  description?: React.ReactNode
  defaultOpen?: boolean
  /** What opens under the line once the call has an output. */
  children?: React.ReactNode
}) {
  const line = (
    <TraceLine status={status === "denied" ? "error" : status}>
      <TraceIcon>
        <StatusIcon status={status} />
      </TraceIcon>
      <TraceTitle>{title}</TraceTitle>
      {description ? <TraceDescription>{description}</TraceDescription> : null}
    </TraceLine>
  )
  if (!children || status === "running") return line
  return (
    <TraceCollapsible defaultOpen={defaultOpen}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>{children}</TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
