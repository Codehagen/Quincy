"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import type { AccessibleName } from "./a11y"
import { PORTAL_TYPE } from "./overlay-styles"
import {
  CONTROL_SURFACE,
  FOCUS_RING,
  HIT_44,
  PANEL,
  PANEL_ROW,
  SEGMENT_HEIGHT,
  type ControlSize,
} from "./control-styles"

export type SelectSize = ControlSize

export type SelectOption<V extends string> = {
  value: V
  label: string
  disabled?: boolean
}

export type SelectProps<V extends string> = Pick<
  SelectPrimitive.Root.Props<V>,
  "name" | "form" | "required" | "disabled" | "readOnly" | "open" | "defaultOpen" | "onOpenChange" | "id"
> &
  /**
   * Inside a kit Field the field's label names it. Standing alone it needs
   * one of these (the types cannot see the Field, so this is on you).
   */
  Partial<AccessibleName> & {
    /** The choices. `V` is inferred from them, so `value` is their union. */
    options: ReadonlyArray<SelectOption<V>>
    value?: V | null
    defaultValue?: V | null
    onValueChange?: (value: V | null) => void
    /** Shown in the trigger, muted, while nothing is picked. */
    placeholder?: string
    /** `md` (36px) is the app default; `lg` (44px) beside a hero action. */
    size?: SelectSize
  }

/**
 * A pill trigger with the value and a chevron, opening the same white panel
 * as Menu. The picked row is action ink with a tick (the plan's "picked menu
 * row"); the highlighted row is the quiet grey. More than a handful of
 * options, or options that are not words, want a different control.
 *
 * On Base UI's Select: typeahead, arrow keys, `name` submits with a form, and
 * inside a kit Field it is labelled by the field.
 */
export function Select<V extends string>({
  options,
  placeholder,
  size = "md",
  value,
  defaultValue,
  onValueChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  ...props
}: SelectProps<V>) {
  const items = React.useMemo(
    () => options.map((o) => ({ value: o.value, label: o.label })),
    [options],
  )
  return (
    <SelectPrimitive.Root<V>
      {...props}
      items={items}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange ? (v) => onValueChange(v) : undefined}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        data-slot="kit-select-trigger"
        className={
          `group relative inline-flex min-w-36 items-center justify-between gap-3 rounded-kit-control pr-3 pl-3.5 text-kit-body text-kit-ink ${SEGMENT_HEIGHT[size]} ${CONTROL_SURFACE} ${FOCUS_RING} ${HIT_44} ` +
          "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
          "hover:not-data-disabled:bg-kit-control-hover data-popup-open:bg-kit-control-hover data-disabled:opacity-50 " +
          "data-invalid:shadow-kit-invalid"
        }
      >
        <SelectPrimitive.Value
          placeholder={placeholder}
          className="min-w-0 truncate font-kit-strong data-placeholder:font-kit-regular data-placeholder:text-kit-ink-muted"
        />
        <SelectPrimitive.Icon className="grid place-items-center text-kit-ink-muted transition-[rotate] duration-(--kit-duration-state) ease-kit-out group-data-popup-open:rotate-180 motion-reduce:transition-none">
          <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={2} aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          alignItemWithTrigger={false}
          side="bottom"
          align="start"
          sideOffset={6}
          className={`z-50 outline-none ${PORTAL_TYPE}`}
        >
          <SelectPrimitive.Popup data-slot="kit-select-panel" className={`${PANEL} min-w-(--anchor-width)`}>
            <SelectPrimitive.List className="outline-none">
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  label={o.label}
                  className={`${PANEL_ROW} justify-between text-kit-ink [&[data-selected]]:font-kit-strong`}
                >
                  <SelectPrimitive.ItemText className="min-w-0 truncate">
                    {o.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="grid shrink-0 place-items-center">
                    <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2.25} aria-hidden />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
