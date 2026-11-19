"use client"

/*
 * Subagent (AI Elements): one of several runs started at once, its own steps
 * streaming under it as preliminary outputs, its report under the steps.
 * Pattern code from ui.shadcn.com/docs/ai-elements/base/subagent.
 */

import type * as React from "react"

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"

import { StatusIcon } from "./status-icon"

export function SubagentRow({
  title,
  description,
  done,
  running,
  steps,
  report,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  done: boolean
  running: boolean
  steps: readonly { id: string; title: React.ReactNode; done: boolean }[]
  report?: React.ReactNode
}) {
  const status = done ? undefined : running ? "running" : "error"
  const line = (
    <TraceLine status={status}>
      <TraceIcon>
        <StatusIcon status={status} />
      </TraceIcon>
      <TraceTitle>{title}</TraceTitle>
      {description ? <TraceDescription>{description}</TraceDescription> : null}
    </TraceLine>
  )
  if (steps.length === 0) return line
  return (
    <TraceCollapsible defaultOpen>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted className="flex flex-col gap-3">
        <Trace>
          {steps.map((s) => (
            <TraceLine key={s.id} status={s.done ? undefined : running ? "running" : "pending"}>
              <TraceTitle>{s.title}</TraceTitle>
            </TraceLine>
          ))}
        </Trace>
        {report ? <p>{report}</p> : null}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
