"use client"

import * as React from "react"
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * An ordered list of short strings. Four things in the brain are exactly this
 * shape — voice rules, hard rules, posting windows, lean-into and avoid lists —
 * so it is one component rather than four near-copies.
 *
 * Controlled only. Every consumer already owns the surrounding form state, and
 * a second source of truth for a list that a server invariant can reject is a
 * way to show the user a value the server refused.
 */
export function StringList({
  value,
  onChange,
  max,
  placeholder,
  addLabel = "Add",
  itemLabel = "item",
  className,
}: {
  value: string[]
  onChange: (next: string[]) => void
  /** Renders a counter and stops adding. The server enforces it too. */
  max?: number
  placeholder?: string
  addLabel?: string
  /** Used for the remove button's accessible name: "Remove rule 2". */
  itemLabel?: string
  className?: string
}) {
  const atCap = max !== undefined && value.length >= max
  // Focus the row we just added rather than leaving the caret where it was.
  const pendingFocus = React.useRef<number | null>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  React.useEffect(() => {
    if (pendingFocus.current === null) return
    const inputs = listRef.current?.querySelectorAll("input")
    inputs?.[pendingFocus.current]?.focus()
    pendingFocus.current = null
  })

  function replace(index: number, next: string) {
    onChange(value.map((item, i) => (i === index ? next : item)))
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ul ref={listRef} role="list" className="flex flex-col gap-2">
        {value.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            <Input
              value={item}
              placeholder={placeholder}
              onChange={(event) => replace(index, event.target.value)}
              onKeyDown={(event) => {
                // Enter adds the next one. In a list you are filling in, the
                // reflex is to keep typing, not to reach for the mouse.
                if (event.key === "Enter" && !atCap) {
                  event.preventDefault()
                  pendingFocus.current = index + 1
                  onChange([
                    ...value.slice(0, index + 1),
                    "",
                    ...value.slice(index + 1),
                  ])
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${itemLabel} ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={atCap}
          onClick={() => {
            pendingFocus.current = value.length
            onChange([...value, ""])
          }}
        >
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          {addLabel}
        </Button>

        {max !== undefined ? (
          // Tabular, because the count changes in place and proportional digits
          // would shift the slash as it ticks between 9 and 10.
          <span
            className={cn(
              "tabular text-caption text-muted-foreground",
              atCap && "text-foreground"
            )}
          >
            {value.length} / {max}
            {atCap ? " — drop one to add one" : null}
          </span>
        ) : null}
      </div>
    </div>
  )
}
