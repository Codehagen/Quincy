"use client"

/*
 * Task (AI Elements): a run's steps under one line. Pattern code from
 * ui.shadcn.com/docs/ai-elements/base/task: open while it runs
 * (`open ?? running`), folded to its title when done, every step the same
 * Trace line.
 */

import * as React from "react"

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

import { StatusIcon, type StepStatus } from "./status-icon"

export type TaskStep = { id: string; title: React.ReactNode; status: StepStatus; description?: React.ReactNode }

export function TaskRow({ title, steps }: { title: React.ReactNode; steps: readonly TaskStep[] }) {
  const [open, setOpen] = React.useState<boolean>()
  const status: StepStatus = steps.some((s) => s.status === "error")
    ? "error"
    : steps.some((s) => s.status === "running")
      ? "running"
      : undefined

  return (
    <TraceCollapsible open={open ?? status === "running"} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={status}>
          <TraceIcon>
            <StatusIcon status={status} />
          </TraceIcon>
          <TraceTitle>{title}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted>
        <Trace>
          {steps.map((step) => (
            <TraceLine key={step.id} status={step.status === "denied" ? "error" : step.status}>
              <TraceTitle>{step.title}</TraceTitle>
              {step.description ? <TraceDescription>{step.description}</TraceDescription> : null}
            </TraceLine>
          ))}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

/**
 * The run's Task, as the pattern builds it: one TraceCollapsible, open while
 * the run works (`open ?? running`, like "Thinking" in the Chat demo), its
 * title turning from "Cutting" to "Cut" when it settles, and folded by
 * TraceCollapsibleContent's own height transition (200ms, interruptible).
 * The person's open or close wins over both. Same export and props as the
 * grid fold it replaces, so callers do not change (plans/036, phase H).
 */
export function TaskFold({
  title,
  steps,
  settled,
}: {
  title: React.ReactNode
  steps: readonly TaskStep[]
  settled: boolean
}) {
  const [open, setOpen] = React.useState<boolean>()
  const status: StepStatus = settled ? undefined : "running"
  return (
    <TraceCollapsible open={open ?? !settled} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={status}>
          <TraceIcon>
            <StatusIcon status={status} />
          </TraceIcon>
          <TraceTitle className="tabular-nums">{title}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent keepMounted>
        <Trace>
          {steps.map((step) => (
            // A two-column row: the label wraps, the duration stays right.
            <TraceLine key={step.id} data-row="" status={step.status === "denied" ? "error" : step.status}>
              <TraceIcon>
                <StatusIcon status={step.status} />
              </TraceIcon>
              <TraceTitle>{step.title}</TraceTitle>
              {step.description ? <TraceDescription className="tabular-nums">{step.description}</TraceDescription> : null}
            </TraceLine>
          ))}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
