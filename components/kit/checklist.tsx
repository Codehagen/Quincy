"use client"

import * as React from "react"
import { Checkbox } from "@base-ui/react/checkbox"
import { CheckboxGroup } from "@base-ui/react/checkbox-group"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import type { AccessibleName } from "./a11y"
import { FOCUS_RING } from "./control-styles"

const ReadOnly = React.createContext(false)

export type ChecklistProps = Omit<
  CheckboxGroup.Props,
  | "className"
  | "style"
  | "render"
  | "children"
  | "aria-label"
  | "aria-labelledby"
  | "allValues"
> &
  AccessibleName & {
    /** CheckItems, in order. */
    children: React.ReactNode
    /**
     * A record of what is done (Design ✓ Build ✓ Ship ○) rather than a set
     * of choices: the person can read it but not tick it. Items stay in the
     * tab order and announce "read only".
     */
    readOnly?: boolean
  }

/**
 * A list of things done and not yet done. On Base UI's CheckboxGroup: the
 * value is the array of checked item values (`value` + `onValueChange`, or
 * `defaultValue`). A done item stays in ink, never struck through.
 */
export function Checklist({ children, readOnly = false, ...props }: ChecklistProps) {
  return (
    <ReadOnly value={readOnly}>
      <CheckboxGroup
        {...props}
        data-slot="kit-checklist"
        data-readonly={readOnly || undefined}
        className="flex flex-col"
      >
        {children}
      </CheckboxGroup>
    </ReadOnly>
  )
}

export type CheckItemProps = Omit<
  Checkbox.Root.Props,
  | "className"
  | "style"
  | "render"
  | "children"
  | "value"
  | "readOnly"
  | "parent"
  | "indeterminate"
> & {
  /** Its value in the Checklist's array. */
  value: string
  /** The label. The whole row (circle, gap, text) is the hit area. */
  children: React.ReactNode
}

// 22px circle. Empty: a check ring (muted ink, ≥3:1, WCAG 1.4.11). Done: a filled success circle with the
// tick on it (white 3.14:1 light; dark ink 8.08:1 dark).
const CIRCLE =
  "relative grid size-kit-check shrink-0 place-items-center rounded-full " +
  "transition-[background-color,box-shadow] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  "data-unchecked:shadow-kit-unchecked data-checked:bg-kit-success " +
  `${FOCUS_RING}`

const TICK =
  "grid place-items-center text-kit-success-on " +
  "transition-[scale,opacity] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  "data-unchecked:scale-50 data-unchecked:opacity-0 data-starting-style:scale-50 data-starting-style:opacity-0"

export function CheckItem({ children, disabled, ...props }: CheckItemProps) {
  const readOnly = React.useContext(ReadOnly)
  return (
    <label
      data-slot="kit-check-item"
      className={`flex min-h-11 items-center gap-3 text-kit-body text-kit-ink select-none ${readOnly || disabled ? "cursor-default" : "cursor-pointer"} ${disabled ? "opacity-50" : ""}`}
    >
      <Checkbox.Root {...props} disabled={disabled} readOnly={readOnly} className={CIRCLE}>
        <Checkbox.Indicator keepMounted className={TICK}>
          <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.75} aria-hidden />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span className="min-w-0">{children}</span>
    </label>
  )
}
