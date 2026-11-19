"use client"

/*
 * Confirmation, on the kit: a tool that waits for approval, shown as the
 * receipt written in advance. Each line can be unticked; Go (or Enter, it is
 * a real form) approves, and the unticked lines ride on the approval's
 * reason so the continuation skips them. A pending approval is a prompt,
 * not activity, so it sits outside the Trace.
 */

import * as React from "react"

import { Button, CheckItem, Checklist, Kbd, Text } from "@/components/kit"

export function Confirmation({
  title,
  lead,
  lines,
  onRespond,
}: {
  title: string
  lead?: React.ReactNode
  lines: readonly { id: string; say: string }[]
  onRespond: (approved: boolean, skipped: string[]) => void
}) {
  const [kept, setKept] = React.useState<string[]>(lines.map((l) => l.id))
  return (
    <form
      className="flex flex-col gap-3 rounded-kit-object bg-kit-object p-4 shadow-kit-object"
      onSubmit={(e) => {
        e.preventDefault()
        onRespond(true, lines.map((l) => l.id).filter((id) => !kept.includes(id)))
      }}
    >
      <div>
        <Text weight="strong">{title}</Text>
        {lead ? (
          <Text variant="small" tone="muted">
            {lead}
          </Text>
        ) : null}
      </div>
      <Checklist aria-label={title} value={kept} onValueChange={(v) => setKept(v as string[])}>
        {lines.map((l) => (
          <CheckItem key={l.id} value={l.id}>
            {l.say}
          </CheckItem>
        ))}
      </Checklist>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="action" disabled={kept.length === 0}>
          Go
        </Button>
        <Button variant="ghost" onClick={() => onRespond(false, [])}>
          Not now
        </Button>
        <span className="ml-auto flex items-center gap-1 text-kit-meta text-kit-ink-muted">
          <Kbd keys={["enter"]} size="sm" />
        </span>
      </div>
    </form>
  )
}
