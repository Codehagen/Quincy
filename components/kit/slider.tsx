"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

export type SliderProps = Omit<
  SliderPrimitive.Root.Props<number>,
  | "className"
  | "style"
  | "render"
  | "children"
  | "value"
  | "defaultValue"
  | "onValueChange"
  | "onValueCommitted"
  | "orientation"
  | "minStepsBetweenValues"
  | "thumbCollisionBehavior"
  | "thumbAlignment"
  | "aria-label"
  | "aria-labelledby"
> & {
    /** Read on the knob's input ("Volume"). Required: a slider has no text of its own. */
    "aria-label": string
    value?: number
    defaultValue?: number
    /** Every move while dragging. Keep it cheap. */
    onValueChange?: (value: number) => void
    /** Once, on release. Save here, not in onValueChange. */
    onValueCommitted?: (value: number) => void
    /** What a screen reader says for a value, when the number on the track
        is not the number a person means ("2.0×" for a log scale). */
    getAriaValueText?: (value: number) => string
  }

/**
 * Ink fill (the primary), big white knob on a grey track. In dark mode
 * the fill is light ink, so the knob carries a ring of the dark ground
 * (shadow-kit-knob-on-fill) to separate it from the fill. One value; a range is not a kit
 * control. On Base UI's Slider: arrow keys (Shift for `largeStep`), Home/End,
 * pointer drag and track press, and `name` submits with a form.
 *
 * The control is 44px tall so the whole track is a touch target; the track
 * itself is 6px. Nothing transitions while dragging (the fill follows the
 * finger); the knob grows a little in the hand.
 */
export function Slider({
  onValueChange,
  onValueCommitted,
  "aria-label": ariaLabel,
  getAriaValueText,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root<number>
      {...props}
      thumbAlignment="edge"
      onValueChange={onValueChange ? (v) => onValueChange(v) : undefined}
      onValueCommitted={onValueCommitted ? (v) => onValueCommitted(v) : undefined}
      data-slot="kit-slider"
      className="group w-full min-w-0 data-disabled:opacity-50"
    >
      <SliderPrimitive.Control className="flex h-11 w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="relative h-1.5 w-full rounded-full bg-kit-track">
          <SliderPrimitive.Indicator className="h-full rounded-full bg-kit-primary" />
          <SliderPrimitive.Thumb
            getAriaLabel={() => ariaLabel}
            getAriaValueText={getAriaValueText ? (_formatted, v) => getAriaValueText(v) : undefined}
            className={
              "size-6 rounded-full bg-kit-knob shadow-kit-knob-on-fill outline-hidden " +
              "transition-[scale] duration-(--kit-duration-press) ease-kit-out motion-reduce:transition-none " +
              "group-data-dragging:scale-110 motion-reduce:group-data-dragging:scale-100 " +
              "has-focus-visible:outline-solid has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-kit-focus"
            }
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
