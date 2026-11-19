"use client"

import * as React from "react"

import { FOCUS_RING } from "@/components/kit/control-styles"
import { cn } from "@/lib/utils"

/**
 * The project's name in the top bar, renamable in place.
 *
 * It reads as the title until it is pressed, then it is a field: Enter or
 * leaving it saves (one `rename` op, so ⌘Z takes it back), Escape puts the
 * old name back. An empty name is not a name, so it reverts instead of
 * saving. A real form, so Enter submits without a key handler of its own.
 */
export function ProjectName({
  name,
  onRename,
  disabled,
}: {
  name: string
  onRename: (name: string) => void
  disabled?: boolean
}) {
  // Null while not editing: the field shows the name as it is now (a
  // rename from undo or a run shows at once), and a draft only while typing.
  const [draft, setDraft] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)

  const save = () => {
    const next = draft?.trim()
    setDraft(null)
    if (next && next !== name) onRename(next)
  }

  return (
    <form
      className="min-w-0"
      onSubmit={(event) => {
        event.preventDefault()
        input.current?.blur()
      }}
    >
      <input
        ref={input}
        aria-label="Project name"
        value={draft ?? name}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        onFocus={(event) => {
          setDraft(name)
          event.currentTarget.select()
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // Drop the draft first, so the blur that follows saves nothing.
            setDraft(null)
            requestAnimationFrame(() => input.current?.blur())
          }
        }}
        className={cn(
          "field-sizing-content h-8 max-w-64 min-w-12 truncate rounded-kit-control bg-transparent px-2",
          "text-kit-body font-kit-strong text-kit-ink",
          "transition-[background-color] duration-150 ease-out hover:bg-kit-row-hover focus:bg-kit-object focus:shadow-kit-control",
          "disabled:hover:bg-transparent",
          FOCUS_RING
        )}
      />
    </form>
  )
}
