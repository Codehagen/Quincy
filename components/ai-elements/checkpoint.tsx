"use client"

/*
 * Checkpoint (AI Elements): a point in the conversation you return to, a
 * separator Marker after the turn with one button. Pattern code from
 * ui.shadcn.com/docs/ai-elements/base/checkpoint. Here the button is the
 * run's one Undo, and once undone it offers Redo.
 */

import { Button } from "@/components/ui/button"
import { Marker, MarkerContent } from "@/components/ui/marker"

export function Checkpoint({
  label,
  action,
  onAction,
  disabled,
}: {
  label: string
  action: string
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <Marker variant="separator">
      <MarkerContent className="inline-flex items-center gap-2">
        {label}
        <Button size="xs" variant="outline" aria-label={`${action}: ${label}`} disabled={disabled} onClick={onAction}>
          {action}
        </Button>
      </MarkerContent>
    </Marker>
  )
}
