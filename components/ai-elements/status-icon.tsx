"use client"

/*
 * The status glyph AI Elements puts in a TraceIcon. Copied from the Task
 * pattern and the chatbot template's status-icon (ui.shadcn.com/docs/
 * ai-elements, github.com/shadcn-ui/chatbot-template): a turning loader
 * while it runs, a check when done, an alert on error. Hugeicons for lucide
 * (AGENTS.md). Two states the pattern does not have: pending (an empty
 * ring, a step that never ran) and denied (the gate's "Leave it").
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Cancel01Icon, CheckmarkCircle02Icon, Loading03Icon } from "@hugeicons/core-free-icons"

export type StepStatus = "running" | "error" | "pending" | "denied" | undefined

export function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "running")
    return <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin motion-reduce:animate-none" />
  if (status === "error") return <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
  if (status === "denied") return <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
  if (status === "pending") return <span className="size-3 rounded-full border border-current" />
  return <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
}
