"use client"

/*
 * Trace, on the kit: the line every step of a run is drawn as. One shape for
 * every step (icon, title, a muted meta, optional detail under it), and a
 * collapsible group that opens while the run works and folds to its summary
 * when it ends (the chain-of-thought behaviour: `open ?? running`, so a
 * person who opened or closed it keeps their choice).
 *
 * The anatomy follows shadcn's AI Elements Trace; the look is the kit's.
 * Working is the friend plus words, never a spinner (states.md).
 */

import * as React from "react"
import { Collapsible } from "@base-ui/react/collapsible"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, ArrowDown01Icon, Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Friend } from "@/components/mascot"

export type TraceStatus = "done" | "running" | "waiting" | "error" | "denied"

export function Trace({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col gap-1.5">{children}</ol>
}

export function TraceIcon({ status }: { status: TraceStatus }) {
  if (status === "running") return <Friend size={16} state="writing" />
  const icon = status === "error" ? Alert02Icon : status === "denied" ? Cancel01Icon : Tick02Icon
  return (
    <span
      data-status={status}
      className="grid size-4 shrink-0 place-items-center rounded-full bg-kit-well text-kit-ink data-[status=waiting]:bg-transparent data-[status=waiting]:shadow-kit-inset data-[status=error]:text-kit-danger"
    >
      {status === "waiting" ? null : <HugeiconsIcon icon={icon} size={10} strokeWidth={2.5} aria-hidden />}
    </span>
  )
}

export function TraceLine({
  status,
  title,
  meta,
  children,
}: {
  status: TraceStatus
  title: React.ReactNode
  meta?: React.ReactNode
  /** Detail under the line: frames, reads, a variant's steps. */
  children?: React.ReactNode
}) {
  return (
    <li
      data-status={status}
      className="flex flex-col gap-1.5 transition-[opacity] duration-(--kit-duration-state) ease-kit-out data-[status=waiting]:opacity-45 motion-reduce:transition-none"
    >
      <span className="flex items-start gap-2">
        <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
          <TraceIcon status={status} />
        </span>
        <span className="min-w-0">
          <span className={status === "done" ? "" : "font-kit-strong"}>{title}</span>
          {meta ? <span className="text-kit-ink-muted"> · {meta}</span> : null}
        </span>
      </span>
      {children ? <div className="pl-6">{children}</div> : null}
    </li>
  )
}

/**
 * A group of steps under one line. Open while `running`; folds to the line
 * when the run ends, unless the person has opened or closed it themselves.
 */
export function TraceGroup({
  running,
  line,
  children,
}: {
  running: boolean
  line: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState<boolean>()
  return (
    <Collapsible.Root open={open ?? running} onOpenChange={setOpen} className="flex flex-col">
      <Collapsible.Trigger className="group relative -mx-2 flex min-h-9 items-center gap-2 rounded-kit-control px-2 text-left transition-[background-color] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-control-hover focus-visible:outline-2 focus-visible:outline-kit-focus motion-reduce:transition-none">
        <span className="min-w-0 flex-1">{line}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          aria-hidden
          className="shrink-0 text-kit-ink-muted transition-[rotate] duration-(--kit-duration-state) ease-kit-out group-data-panel-open:rotate-180 motion-reduce:transition-none"
        />
      </Collapsible.Trigger>
      <Collapsible.Panel
        keepMounted
        className="h-(--collapsible-panel-height) overflow-y-clip transition-[height,opacity] duration-(--kit-duration-enter) ease-kit-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        <div className="pt-1.5 pb-1">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
