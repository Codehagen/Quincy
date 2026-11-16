"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"

import { CONTROL_SURFACE, FOCUS_RING, HIT_44 } from "./control-styles"

/**
 * Answers to what was just said, as pills under it: "Draft the second",
 * "Show all 3" (the landing's TextsPicture). Pressing one sends it, so the
 * words on the pill are the words that go. A row of equals: none of them is
 * the ink action.
 *
 *   <Choices label="Answers">
 *     <Choice onClick={() => send("Draft the second")}>Draft the second</Choice>
 *   </Choices>
 */
export type ChoicesProps = {
  /** The group's name for assistive tech: "Suggested answers". */
  label: string
  children: React.ReactNode
}

export function Choices({ label, children }: ChoicesProps) {
  return (
    <div role="group" aria-label={label} data-slot="kit-choices" className="flex flex-wrap gap-kit-controls">
      {children}
    </div>
  )
}

export type ChoiceProps = Omit<ButtonPrimitive.Props, "className" | "style" | "children" | "render"> & {
  /** The answer, as it will be sent. */
  children: string
  /** Stagger index when the row arrives (50ms apart). Omit for no entrance. */
  arrive?: number
}

/**
 * One answer. White pill, 32px, wraps rather than truncates (an answer cut
 * short is a different answer); 44px tall under a coarse pointer.
 */
export function Choice({ children, arrive, type = "button", ...props }: ChoiceProps) {
  return (
    <ButtonPrimitive
      {...props}
      type={type}
      data-slot="kit-choice"
      style={arrive != null ? ({ animationDelay: `${arrive * 50}ms` } as React.CSSProperties) : undefined}
      className={
        `relative inline-flex min-h-8 max-w-full items-center rounded-full px-3.5 py-1.5 text-left text-kit-small font-kit-strong text-kit-ink select-none ${CONTROL_SURFACE} ${FOCUS_RING} ${HIT_44} ` +
        // Transition durations by property, as transition-duration itself:
        // a bracketed duration-[a,b] would also set --tw-duration, which
        // tw-animate's animate-in reads, and split the entrance into two
        // layers. Important, because transition-[…] also writes
        // transition-duration (from --tw-duration) and utility order is not
        // a promise. The entrance takes its own --tw-animation-duration below.
        "transition-[scale,background-color] [transition-duration:var(--kit-duration-press),var(--kit-duration-state)]! ease-kit-out motion-reduce:transition-none " +
        "hover:not-data-disabled:bg-kit-control-hover not-data-disabled:active:scale-(--kit-press-scale) motion-reduce:not-data-disabled:active:scale-100 data-disabled:cursor-default data-disabled:opacity-50 " +
        (arrive != null
          ? "animate-in fade-in slide-in-from-bottom-1 fill-mode-both [--tw-animation-duration:var(--kit-duration-state)] motion-reduce:animate-none"
          : "")
      }
    >
      {children}
    </ButtonPrimitive>
  )
}
