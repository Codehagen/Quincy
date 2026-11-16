"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"

import {
  CONTROL_SURFACE,
  FOCUS_RING,
  ICON_DENSE,
  INPUT_TEXT,
  SEGMENT_HEIGHT,
  type ControlSize,
} from "./control-styles"
import { Kbd } from "./kbd"
import { useControllable } from "./use-controllable"

/** `sm` (32) is a workspace toolbar's search; `md` (36) the app default; `lg` (44) a page's main search. */
export type SearchFieldSize = "sm" | ControlSize

export type SearchFieldProps = Omit<
  InputPrimitive.Props,
  | "className"
  | "style"
  | "render"
  | "type"
  | "size"
  | "value"
  | "defaultValue"
  | "onValueChange"
> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /**
   * The field's name for assistive tech. Defaults to "Search". A placeholder
   * is not a label, so this is always set.
   */
  "aria-label"?: string
  /**
   * `md` (36px) is the app default; `lg` (44px) as a page's main search.
   * `sm` (32px) is a workspace toolbar's search: flat (the inset ring, no
   * fall: a field in a toolbar is a slot, not an object), a hover step, the
   * 13px text (16 on touch).
   */
  size?: SearchFieldSize
  /**
   * The key that reaches this field on its surface ("/"), shown as an 18px
   * cap while the field is empty and unfocused, and announced through
   * `aria-keyshortcuts`. Hidden on touch. The surface's key handler does the
   * focusing; this only shows the key.
   */
  shortcut?: string
  /** The input, for the surface's key handler to focus. */
  ref?: React.Ref<HTMLInputElement>
}

const SIZE_FIELD: Record<SearchFieldSize, string> = {
  sm:
    "h-kit-control-sm pr-9 pl-8 bg-kit-object shadow-kit-inset text-kit-dense text-kit-ink placeholder:text-kit-ink-muted pointer-coarse:text-base focus-visible:outline-offset-0 " +
    "transition-[background-color] duration-(--kit-duration-state) ease-kit-out hover:not-focus:bg-kit-control-hover motion-reduce:transition-none",
  md: `${SEGMENT_HEIGHT.md} pr-10 pl-9 ${CONTROL_SURFACE} ${INPUT_TEXT}`,
  lg: `${SEGMENT_HEIGHT.lg} pr-10 pl-9 ${CONTROL_SURFACE} ${INPUT_TEXT}`,
}

/**
 * Magnifier, input, and a round grey clear button once there is something to
 * clear. The input IS the control: the icons overlay it (the magnifier ignores
 * the pointer, so a click there still lands in the input), and clearing puts
 * focus back in the input. Escape clears too.
 *
 * Spellcheck and autocomplete are off: a search is not prose and not an
 * address. 16px under a coarse pointer so iOS does not zoom on focus.
 */
export function SearchField({
  value: valueProp,
  defaultValue = "",
  onValueChange,
  size = "md",
  "aria-label": ariaLabel = "Search",
  shortcut,
  ref,
  onKeyDown,
  onFocus,
  onBlur,
  ...props
}: SearchFieldProps) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange)
  const input = React.useRef<HTMLInputElement | null>(null)
  const [focused, setFocused] = React.useState(false)
  const sm = size === "sm"
  // The page's key handler focuses the field through `ref`; the clear
  // button through `input`. One element, two handles.
  React.useImperativeHandle(ref, () => input.current as HTMLInputElement, [])

  const clear = () => {
    setValue("")
    input.current?.focus()
  }

  return (
    <div data-slot="kit-search-field" className="relative inline-flex w-full min-w-0">
      <HugeiconsIcon
        icon={Search01Icon}
        {...(sm ? ICON_DENSE : { size: 16, strokeWidth: 2 })}
        aria-hidden
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-kit-ink-muted ${sm ? "left-2.5" : "left-3"}`}
      />
      <InputPrimitive
        {...props}
        ref={input}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
        aria-keyshortcuts={props["aria-keyshortcuts"] ?? shortcut}
        type="search"
        value={value}
        onValueChange={(v) => setValue(v)}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.key === "Escape" && value !== "") {
            e.preventDefault()
            setValue("")
          }
        }}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className={
          `w-full min-w-0 ${sm ? "rounded-full" : "rounded-kit-control"} ${SIZE_FIELD[size]} ${FOCUS_RING} ` +
          "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none " +
          "data-disabled:opacity-50"
        }
      />
      {value !== "" ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className={
            `absolute top-1/2 right-2 grid ${sm ? "size-4.5" : "size-5"} -translate-y-1/2 place-items-center rounded-full bg-kit-track text-kit-ink-muted ${FOCUS_RING} ` +
            "transition-[scale,color] duration-[var(--kit-duration-press),var(--kit-duration-state)] ease-kit-out motion-reduce:transition-none hover:text-kit-ink " +
            "active:scale-(--kit-press-scale) motion-reduce:active:scale-100 " +
            // A 32px square under a mouse (it stays inside the input's 40px
            // right padding, so it never covers the text), 44px on touch:
            // nothing sits beside it inside the field.
            "after:absolute after:top-1/2 after:left-1/2 after:size-8 after:-translate-1/2 pointer-coarse:after:size-11"
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} size={sm ? 10 : 12} strokeWidth={2.5} aria-hidden />
        </button>
      ) : shortcut && !focused ? (
        <span className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 pointer-coarse:hidden">
          <Kbd keys={[shortcut]} size="sm" decorative />
        </span>
      ) : null}
    </div>
  )
}
