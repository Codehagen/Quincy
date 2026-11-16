"use client"

import * as React from "react"
import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"

import type { AccessibleName } from "./a11y"
import {
  SEGMENT_HEIGHT,
  SEGMENT_ITEM,
  SEGMENT_THUMB,
  SEGMENT_TRACK,
  type ControlSize,
} from "./control-styles"
import { useControllable } from "./use-controllable"

export type SegmentedSize = ControlSize

export type SegmentedOption<V extends string> = {
  value: V
  label: string
  disabled?: boolean
}

export type SegmentedProps<V extends string> = Omit<
  RadioGroup.Props<V>,
  | "className"
  | "style"
  | "render"
  | "children"
  | "value"
  | "defaultValue"
  | "onValueChange"
  | "aria-label"
  | "aria-labelledby"
> &
  AccessibleName & {
    /**
     * Two to five segments, equal width. More than five is a Select.
     * Pass a literal array (`as const` not needed) and `V` is inferred, so
     * `value` and `onValueChange` are typed as the union of the values.
     */
    options: ReadonlyArray<SegmentedOption<V>>
    value?: V
    /** Uncontrolled start. Defaults to the first option. */
    defaultValue?: V
    onValueChange?: (value: V) => void
    /** `md` (36px) is the app default; `lg` (44px) beside a hero action. */
    size?: SegmentedSize
  }

/**
 * Day / Week / Month: one value out of a few, always exactly one. The picked
 * segment is an ink pill with the ground on it, after the landing's picked
 * reply chip, and the pill slides between segments (a transition, so a quick
 * second press retargets).
 *
 * On Base UI's RadioGroup, because that is the semantics: arrow keys move AND
 * select, Tab enters and leaves the group as one stop (roving tabindex), and
 * `name` submits it with a form. When picking a segment swaps a panel of
 * content, use Tabs instead — same look, tab/tabpanel semantics.
 */
export function Segmented<V extends string>({
  options,
  value: valueProp,
  defaultValue,
  onValueChange,
  size = "md",
  ...props
}: SegmentedProps<V>) {
  const [value, setValue] = useControllable<V | undefined>(
    valueProp,
    defaultValue ?? options[0]?.value,
    onValueChange as ((v: V | undefined) => void) | undefined,
  )
  const index = options.findIndex((o) => o.value === value)
  const n = Math.max(options.length, 1)

  return (
    <RadioGroup<V>
      {...props}
      value={value}
      onValueChange={(v) => setValue(v)}
      data-slot="kit-segmented"
      data-size={size}
      className={`${SEGMENT_TRACK} ${SEGMENT_HEIGHT[size]} inline-grid auto-cols-fr grid-flow-col`}
    >
      <span
        aria-hidden
        data-slot="kit-segmented-thumb"
        hidden={index < 0}
        className={`${SEGMENT_THUMB} inset-y-1 left-1`}
        style={{
          width: `calc((100% - 0.5rem) / ${n})`,
          translate: `${Math.max(index, 0) * 100}% 0`,
        }}
      />
      {options.map((o) => (
        <Radio.Root
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={`${SEGMENT_ITEM} data-checked:text-kit-primary-on data-checked:hover:text-kit-primary-on`}
        >
          {o.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}
