"use client"

import * as React from "react"
import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import type { AccessibleName } from "./a11y"
import {
  FOCUS_RING,
  HIT_44,
  ICON_DENSE,
  SEGMENT_HEIGHT,
  SEGMENT_ITEM,
  SEGMENT_THUMB,
  SEGMENT_TRACK,
  type ControlSize,
} from "./control-styles"
import { useControllable } from "./use-controllable"

/**
 * `xs` (28) is icon-only: a workspace's view switch (docs/design/workspace.md).
 * `md` (36) is the app default; `lg` (44) beside a hero action.
 */
export type SegmentedSize = "xs" | ControlSize

export type SegmentedOption<V extends string> = {
  value: V
  /** Shown at md and lg. At xs it is the segment's name (aria-label) and its hover hint. */
  label: string
  /** Required at xs, where it is all the segment shows. Ignored at md and lg. */
  icon?: IconSvgElement
  disabled?: boolean
}

// xs: two or three views of the same rows, as icons in one 28px well track,
// the picked one a white chip (not the ink thumb: a toolbar's one ink belongs
// to the view's action, and a second ink pill there would compete with it).
const XS_TRACK = "relative isolate inline-grid h-kit-control-xs auto-cols-fr grid-flow-col rounded-full bg-kit-well p-0.5"
const XS_THUMB =
  "pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full bg-kit-object shadow-kit-control " +
  "transition-[translate] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none"
const XS_ITEM =
  `relative z-[1] grid h-6 w-7 cursor-pointer place-items-center rounded-full text-kit-ink-muted select-none ${FOCUS_RING} focus-visible:outline-offset-0 ${HIT_44} ` +
  "transition-[color,scale] duration-[var(--kit-duration-state),var(--kit-duration-press)] ease-kit-out motion-reduce:transition-none " +
  "hover:text-kit-ink active:scale-(--kit-press-scale) motion-reduce:active:scale-100 data-checked:text-kit-ink " +
  "data-disabled:cursor-default data-disabled:opacity-50"

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
    /**
     * `md` (36px) is the app default; `lg` (44px) beside a hero action.
     * `xs` (28px) is icon-only, for a workspace toolbar's view switch:
     * every option needs an `icon`, and its `label` becomes its name.
     */
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

  if (size === "xs") {
    return (
      <RadioGroup<V>
        {...props}
        value={value}
        onValueChange={(v) => setValue(v)}
        data-slot="kit-segmented"
        data-size={size}
        className={XS_TRACK}
      >
        <span
          aria-hidden
          data-slot="kit-segmented-thumb"
          hidden={index < 0}
          className={XS_THUMB}
          style={{
            width: `calc((100% - 0.25rem) / ${n})`,
            translate: `${Math.max(index, 0) * 100}% 0`,
          }}
        />
        {options.map((o) => (
          <Radio.Root
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            aria-label={o.label}
            title={o.label}
            className={XS_ITEM}
          >
            {o.icon ? <HugeiconsIcon icon={o.icon} {...ICON_DENSE} aria-hidden /> : o.label.slice(0, 1)}
          </Radio.Root>
        ))}
      </RadioGroup>
    )
  }

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
