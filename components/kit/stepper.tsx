"use client"

import * as React from "react"
import { NumberField } from "@base-ui/react/number-field"
import { HugeiconsIcon } from "@hugeicons/react"
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons"

import {
  CONTROL_SURFACE,
  FOCUS_RING,
  SEGMENT_HEIGHT,
  type ControlSize,
} from "./control-styles"
import { devWarn } from "./dev-warn"
import { useReducedMotion } from "./use-reduced-motion"

export type StepperSize = ControlSize

export type StepperProps = Omit<
  NumberField.Root.Props,
  | "className"
  | "style"
  | "render"
  | "children"
  | "onValueChange"
  | "id"
  | "allowWheelScrub"
  | "aria-label"
> & {
  /** The visible word in the pill ("Gap", "Posts a week"). It labels the input. */
  label: string
  /**
   * The input's full name, when the visible word alone does not say which
   * one this is: in a list of rows each with "Weight %", name the row
   * ("Weight % for Building in public"). It must contain `label` (WCAG
   * 2.5.3, a voice user says the word they see); it warns in development
   * when it does not. The − and + buttons take it too ("Increase Weight %
   * for Building in public").
   */
  "aria-label"?: string
  /** `null` only while the input is cleared mid-edit; it commits on blur. */
  onValueChange?: (value: number | null) => void
  /** `md` (36px) is the app default; `lg` (44px) beside a hero action. */
  size?: StepperSize
}

// 28px buttons. On touch the hit area is 44×44: an ::after 8px past each
// side and centred vertically. The group's gap and end padding open to 8px
// under a coarse pointer, so the grown areas reach the value but never
// cover it, and never leave the pill.
const STEP_HIT_44 =
  "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-2 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"

const STEP_BUTTON =
  `relative grid size-7 shrink-0 place-items-center rounded-full text-kit-ink ${FOCUS_RING} ${STEP_HIT_44} ` +
  "transition-[scale,background-color] duration-[var(--kit-duration-press),var(--kit-duration-state)] ease-kit-out motion-reduce:transition-none " +
  "hover:not-data-disabled:bg-kit-control-hover not-data-disabled:active:scale-(--kit-press-scale) motion-reduce:not-data-disabled:active:scale-100 " +
  "data-disabled:opacity-50 data-disabled:cursor-default"

// The value is replaced, not counted: it ticks in from the side it moved
// toward. A one-shot, so it is WAAPI, not a transition; skipped entirely
// under reduced motion.
const TICK_MS = 160

/**
 * "Gap  −  26  +" in one pill: label, decrement, value, increment. On Base
 * UI's NumberField, so min/max/step, arrow keys (Shift for `largeStep`),
 * press-and-hold repeat, typing a number and form submission (`name`) all
 * work. The value ticks up or down when stepped; typing never animates.
 */
export function Stepper({
  label,
  "aria-label": ariaLabel,
  size = "md",
  min,
  max,
  onValueChange,
  ...props
}: StepperProps) {
  const id = React.useId()
  const name = ariaLabel ?? label
  if (
    process.env.NODE_ENV !== "production" &&
    ariaLabel !== undefined &&
    !ariaLabel.toLowerCase().includes(label.toLowerCase())
  ) {
    devWarn(
      "stepper-label-in-name",
      `the Stepper aria-label "${ariaLabel}" drops its visible label "${label}" (WCAG 2.5.3). Keep the word and add which one.`,
    )
  }
  const input = React.useRef<HTMLInputElement>(null)
  const reduced = useReducedMotion()
  // The last value seen, only to tell which way a keyboard step went.
  const last = React.useRef<number | null>(
    props.value ?? props.defaultValue ?? null,
  )

  // Width in ch from the widest number the range allows, so the pill never
  // changes width as the value ticks (tabular digits do the rest).
  const chars = Math.max(
    String(min ?? 0).length,
    String(max ?? 99).length,
    2,
  )

  return (
    <NumberField.Root
      {...props}
      id={id}
      min={min}
      max={max}
      data-slot="kit-stepper"
      data-size={size}
      onValueChange={(next, details) => {
        onValueChange?.(next)
        const prev = last.current
        last.current = next
        const r = details.reason
        const dir =
          r === "increment-press"
            ? 1
            : r === "decrement-press"
              ? -1
              : (r === "keyboard" || r === "wheel") &&
                  next !== null &&
                  prev !== null &&
                  next !== prev
                ? Math.sign(next - prev)
                : 0
        if (reduced || dir === 0) return
        input.current?.animate(
          [
            { translate: `0 ${dir * 0.45}em`, opacity: 0 },
            { translate: "0 0", opacity: 1 },
          ],
          { duration: TICK_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        )
      }}
      className="inline-flex"
    >
      <NumberField.Group
        className={`inline-flex items-center gap-1 rounded-kit-control pr-1 pl-3.5 pointer-coarse:gap-2 pointer-coarse:pr-2 text-kit-body ${CONTROL_SURFACE} ${SEGMENT_HEIGHT[size]} data-disabled:opacity-50`}
      >
        <label htmlFor={id} className="mr-2 text-kit-ink-muted select-none">
          {label}
        </label>
        <NumberField.Decrement
          aria-label={`Decrease ${name}`}
          className={STEP_BUTTON}
        >
          <HugeiconsIcon icon={MinusSignIcon} size={16} strokeWidth={2} aria-hidden />
        </NumberField.Decrement>
        <NumberField.Input
          ref={input}
          aria-label={ariaLabel}
          style={{ width: `${chars + 0.5}ch` }}
          className={`bg-transparent text-center font-kit-strong text-kit-ink tabular-nums pointer-coarse:text-base ${FOCUS_RING} rounded-kit-chip`}
        />
        <NumberField.Increment
          aria-label={`Increase ${name}`}
          className={STEP_BUTTON}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} aria-hidden />
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  )
}
