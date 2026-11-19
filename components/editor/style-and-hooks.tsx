"use client"

import * as React from "react"
import {
  ArrowDown01Icon,
  FishingHookIcon,
  Film01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Suggestions } from "@/components/ai-elements/suggestion"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { EDIT_STYLES } from "@/lib/editor/edit-styles"
import { HOOK_TEMPLATES } from "@/lib/editor/hooks"

/**
 * The edit styles and hook templates, folded under one control in the chat
 * margin. Sixteen hooks and five styles are too many to sit as starters, and
 * too useful to leave for the person to guess the names of, so they wait
 * behind "Styles and hooks" and, once open, are chips like any other: one
 * press sends the request in words (the agent picks it up with
 * apply_edit_style or apply_hook), and the tooltip says when it fits.
 *
 * Part of the Cuts chat margin, so shadcn (AGENTS.md, "the Cuts chat margin").
 */

export function styleRequest(label: string): string {
  return `Edit this as a ${label.toLowerCase()}`
}

export function hookRequest(label: string): string {
  return `Open with a “${label}” hook`
}

const STYLE_ITEMS = EDIT_STYLES.map((style) => ({
  text: styleRequest(style.label),
  read: style.hint,
  icon: Film01Icon,
}))

const HOOK_ITEMS = HOOK_TEMPLATES.map((hook) => ({
  text: hookRequest(hook.label),
  read: `${hook.when}. For example: “${hook.example}”`,
  icon: FishingHookIcon,
}))

export function StyleAndHooks({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground" />
        }
      >
        Styles and hooks
        <HugeiconsIcon
          aria-hidden="true"
          icon={ArrowDown01Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className={open ? "rotate-180" : undefined}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-2 text-start">
        <section aria-label="Edit styles" className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Edit style
          </h4>
          <Suggestions
            items={STYLE_ITEMS}
            onPick={onPick}
            disabled={disabled}
          />
        </section>
        <section aria-label="Hooks" className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Hook for the opening
          </h4>
          <Suggestions items={HOOK_ITEMS} onPick={onPick} disabled={disabled} />
        </section>
      </CollapsibleContent>
    </Collapsible>
  )
}
