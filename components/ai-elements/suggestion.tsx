"use client"

/*
 * Suggestion (AI Elements): one press sends a whole request. Pattern code
 * from ui.shadcn.com/docs/ai-elements/base/suggestion and the chatbot
 * template's suggestions: outline `sm` Buttons, wrapping in a narrow
 * margin. What Quincy read that makes the request worth sending is the
 * tooltip (information not on the chip); the icon says what kind of edit.
 */

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { Tooltip } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Suggestions({
  items,
  onPick,
  disabled,
  className,
}: {
  /** `icon` leads the chip: what kind of edit it is, at a glance. */
  items: readonly { text: string; read?: string; icon?: IconSvgElement }[]
  onPick: (text: string) => void
  disabled?: boolean
  /** Layout only: where the row sits (centred in the empty state). */
  className?: string
}) {
  return (
    <div role="group" aria-label="Suggestions" className={cn("flex flex-wrap gap-2", className)}>
      {items.map((s) => {
        const chip = (
          // Layout only: a long request ("Push in on …") wraps inside the
          // margin instead of running past it, read from the start (not
          // centred under the empty state's text) and without an orphan.
          <Button
            key={s.text}
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-auto min-h-8 max-w-full justify-start py-1 text-start whitespace-normal text-pretty"
            onClick={() => onPick(s.text)}
          >
            {s.icon ? <HugeiconsIcon aria-hidden="true" icon={s.icon} strokeWidth={2} data-icon="inline-start" /> : null}
            {s.text}
          </Button>
        )
        return s.read ? (
          <Tooltip key={s.text} content={s.read}>
            {chip}
          </Tooltip>
        ) : (
          chip
        )
      })}
    </div>
  )
}
