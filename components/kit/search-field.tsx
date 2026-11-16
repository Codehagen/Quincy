"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons"

import {
  CONTROL_SURFACE,
  FOCUS_RING,
  INPUT_TEXT,
  SEGMENT_HEIGHT,
  type ControlSize,
} from "./control-styles"
import { useControllable } from "./use-controllable"

export type SearchFieldSize = ControlSize

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
  /** `md` (36px) is the app default; `lg` (44px) as a page's main search. */
  size?: SearchFieldSize
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
  onKeyDown,
  ...props
}: SearchFieldProps) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange)
  const input = React.useRef<HTMLInputElement>(null)

  const clear = () => {
    setValue("")
    input.current?.focus()
  }

  return (
    <div data-slot="kit-search-field" className="relative inline-flex w-full min-w-0">
      <HugeiconsIcon
        icon={Search01Icon}
        size={16}
        strokeWidth={2}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-kit-ink-muted"
      />
      <InputPrimitive
        {...props}
        ref={input}
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
          `w-full min-w-0 rounded-kit-control pr-10 pl-9 ${SEGMENT_HEIGHT[size]} ${CONTROL_SURFACE} ${INPUT_TEXT} ${FOCUS_RING} ` +
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
            `absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-kit-track text-kit-ink-muted ${FOCUS_RING} ` +
            "transition-[scale,color] duration-[var(--kit-duration-press),var(--kit-duration-state)] ease-kit-out motion-reduce:transition-none hover:text-kit-ink " +
            "active:scale-(--kit-press-scale) motion-reduce:active:scale-100 " +
            // A 32px square under a mouse (it stays inside the input's 40px
            // right padding, so it never covers the text), 44px on touch:
            // nothing sits beside it inside the field.
            "after:absolute after:top-1/2 after:left-1/2 after:size-8 after:-translate-1/2 pointer-coarse:after:size-11"
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
