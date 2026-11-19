"use client"

/*
 * Confirmation (AI Elements): a tool that waits for approval, as an Item
 * with the question, a description and the two answers. Pattern code from
 * ui.shadcn.com/docs/ai-elements/base/confirmation; answer with
 * `addToolApprovalResponse` and `sendAutomaticallyWhen`. Quincy's addition:
 * the plan's lines as checkboxes (untick what to leave alone), and a real
 * form, so Enter is Go.
 */

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Scissor01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemMedia, ItemTitle } from "@/components/ui/item"

export function Confirmation({
  title,
  description,
  lines = [],
  approveLabel = "Go",
  denyLabel = "Not now",
  onRespond,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** The plan's lines, each one can be unticked. None: a plain yes or no. */
  lines?: readonly { id: string; say: string }[]
  approveLabel?: string
  denyLabel?: string
  /** `skipped` are the unticked lines' ids. */
  onRespond: (approved: boolean, skipped: string[]) => void
}) {
  const [kept, setKept] = React.useState<string[]>(() => lines.map((l) => l.id))
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onRespond(true, lines.map((l) => l.id).filter((id) => !kept.includes(id)))
      }}
    >
      <Item variant="outline" size="sm" className="flex-wrap">
        <ItemMedia variant="icon">
          <HugeiconsIcon icon={Scissor01Icon} strokeWidth={2} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          {description ? <ItemDescription>{description}</ItemDescription> : null}
        </ItemContent>
        {lines.length > 0 ? (
        <ItemFooter className="flex-col items-stretch gap-2">
          {lines.map((l) => (
            <label key={l.id} className="flex min-h-7 items-center gap-2 text-sm">
              <Checkbox
                checked={kept.includes(l.id)}
                onCheckedChange={(on) => setKept((k) => (on ? [...k, l.id] : k.filter((x) => x !== l.id)))}
              />
              {l.say}
            </label>
          ))}
        </ItemFooter>
        ) : null}
        <ItemActions className="w-full justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => onRespond(false, [])}>
            {denyLabel}
          </Button>
          <Button type="submit" size="sm" disabled={lines.length > 0 && kept.length === 0}>
            {approveLabel}
          </Button>
        </ItemActions>
      </Item>
    </form>
  )
}
