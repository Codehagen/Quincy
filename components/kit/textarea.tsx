"use client"

import * as React from "react"
import { Field as FieldPrimitive } from "@base-ui/react/field"

import { FIELD_SURFACE } from "./control-styles"
import { useModKey } from "./use-mod-key"

export type TextareaProps = Omit<
  React.ComponentPropsWithRef<"textarea">,
  "className" | "style" | "children" | "value" | "defaultValue" | "onChange"
> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /**
   * What ⌘/Ctrl+Enter does. Omitted, it submits the enclosing `<form>`
   * (`requestSubmit`, so the form's validation and onSubmit run). Enter alone
   * always inserts a newline.
   */
  onSubmitShortcut?: () => void
  /** Show the "⌘ ↵" hint in the corner. Default true. */
  shortcutHint?: boolean
  /**
   * `field` (default) grows between 5rem and 20rem, then scrolls: a reply,
   * a description. `document` is for the whole text of a page (a brain page
   * in source view): it opens at 20rem and grows with the text with no
   * ceiling, so the page scrolls rather than a box inside it.
   */
  size?: "field" | "document"
}

const SIZE = {
  field: "min-h-20 max-h-80",
  document: "min-h-80",
} as const

/**
 * Multi-line text on Base UI's Field.Control, so inside a kit `Field` it is
 * labelled, described and validated like Input. Grows with its content
 * (`field-sizing: content`) between 5rem and 20rem; `size="document"` opens
 * at 20rem and has no ceiling.
 *
 * Both modifiers submit; only the hint chooses one, after mount (useModKey),
 * so server and client markup agree.
 */
export function Textarea({
  value,
  defaultValue,
  onValueChange,
  onSubmitShortcut,
  shortcutHint = true,
  size = "field",
  onKeyDown,
  rows = 3,
  // Field-level state goes to Field.Control, so it sets data-disabled (and
  // the rest of Base UI's field state) and the render element gets it too.
  disabled,
  name,
  required,
  readOnly,
  id,
  autoFocus,
  ...props
}: TextareaProps) {
  const mod = useModKey()
  return (
    <div data-slot="kit-textarea" className="relative w-full min-w-0">
      <FieldPrimitive.Control
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange ? (v) => onValueChange(v) : undefined}
        disabled={disabled}
        name={name}
        required={required}
        readOnly={readOnly}
        id={id}
        autoFocus={autoFocus}
        render={
          <textarea
            {...props}
            rows={rows}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            onKeyDown={(e) => {
              onKeyDown?.(e)
              if (e.defaultPrevented) return
              if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return
              e.preventDefault()
              if (onSubmitShortcut) onSubmitShortcut()
              else e.currentTarget.form?.requestSubmit()
            }}
          />
        }
        data-slot="kit-textarea-control"
        data-size={size}
        className={`block field-sizing-content ${SIZE[size]} resize-none py-2 ${shortcutHint ? "pb-7" : ""} ${FIELD_SURFACE}`}
      />
      {shortcutHint ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 bottom-2 font-kit-mono text-kit-mono text-kit-ink-muted select-none"
        >
          {mod} ↵
        </span>
      ) : null}
    </div>
  )
}
