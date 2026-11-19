"use client"

/*
 * Checkpoint, on the kit: a point in the conversation you return to. A
 * marker after a run, with its revision and Undo; once undone it says so and
 * offers Redo. One run is one revision, so one press takes all of it back.
 */

import { Redo02Icon, Undo02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/kit"

export function Checkpoint({
  label,
  revision,
  undone,
  disabled,
  onUndo,
  onRedo,
  undoLabel = "Undo the run",
}: {
  label: string
  revision: number
  undone: boolean
  disabled?: boolean
  onUndo: () => void
  onRedo: () => void
  undoLabel?: string
}) {
  return (
    <div role="separator" aria-label={`Checkpoint r${revision}: ${label}`} className="flex items-center gap-2">
      <span className="h-px flex-1 bg-kit-hairline" />
      <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
        r{revision} · {undone ? "undone" : label}
      </span>
      <Button
        size="xs"
        variant="quiet"
        icon={undone ? Redo02Icon : Undo02Icon}
        reserve={["Redo", undoLabel]}
        disabled={disabled}
        onClick={undone ? onRedo : onUndo}
      >
        {undone ? "Redo" : undoLabel}
      </Button>
      <span className="h-px w-3 bg-kit-hairline" />
    </div>
  )
}
