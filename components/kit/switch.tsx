"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import type { AccessibleName } from "./a11y"
import { FOCUS_RING } from "./control-styles"

type SwitchBase = Omit<
  SwitchPrimitive.Root.Props,
  "className" | "style" | "render" | "children" | "aria-label" | "aria-labelledby"
>

/**
 * Either a visible `label` (the whole row is the hit area: label, gap and
 * track) or an accessible name for a switch that sits beside its own text.
 */
export type SwitchProps = SwitchBase &
  (
    | { label: string; "aria-label"?: never; "aria-labelledby"?: never }
    | ({ label?: never } & AccessibleName)
  )

// 40×24 track, 20px knob, 2px inset: the knob travels 16px. On touch the
// hit area is a 44×44 box centred on the track (2px past each side), an
// ::after so nothing reflows.
const HIT_44_SQUARE =
  "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-0.5 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"

const TRACK =
  "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5 " +
  "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  "data-unchecked:bg-kit-track data-checked:bg-kit-primary " +
  "data-disabled:cursor-default data-disabled:opacity-50 " +
  `${FOCUS_RING} ${HIT_44_SQUARE}`

// The knob takes --kit-knob-on when checked: white on the ink track in
// light, the dark ground on the light-ink track in dark (16.9:1), where a
// white knob would vanish.
const KNOB =
  "pointer-events-none block size-5 rounded-full bg-kit-knob shadow-kit-knob data-checked:bg-kit-knob-on " +
  "transition-[translate,background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  "data-checked:translate-x-4"

/**
 * Ink track when on (the landing's primary fill; no blue in a control),
 * shadowed knob (white, or the dark ground on dark mode's light-ink track). `data-checked` / `data-unchecked` come
 * from Base UI. The knob slides on a transition, so a quick double toggle
 * retargets instead of restarting. Checked or unchecked by `checked` +
 * `onCheckedChange`, or uncontrolled by `defaultChecked`.
 *
 * The off track is 1.31:1 against white by design (as on iOS): the knob's
 * position carries the state, so a switch always sits beside a label.
 */
export function Switch({ label, ...props }: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root {...props} data-slot="kit-switch" className={TRACK}>
      <SwitchPrimitive.Thumb className={KNOB} />
    </SwitchPrimitive.Root>
  )
  if (!label) return control
  return (
    <label
      data-slot="kit-switch-row"
      className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-kit-body text-kit-ink select-none has-data-disabled:cursor-default"
    >
      <span className="min-w-0">{label}</span>
      {control}
    </label>
  )
}
