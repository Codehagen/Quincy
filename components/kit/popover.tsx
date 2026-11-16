"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { FLOATING_ELEVATION, FLOATING_MOTION, PORTAL_TYPE } from "./overlay-styles"

type Unstyled<P> = Omit<P, "className" | "style">

export type PopoverProps = PopoverPrimitive.Root.Props

/**
 * Something small to read or set beside the thing it is about, with the page
 * still live around it: why a slot is this time, the three sources behind a
 * draft, a time picker. No scrim; a press outside or Escape closes it.
 *
 * Not a Menu (a Menu runs commands, its rows are the content) and not a
 * Tooltip (a tooltip cannot hold anything you press, and never opens on
 * touch). If the trigger's only job is to open it, it is a Popover.
 */
export function Popover(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />
}

export type PopoverTriggerProps = Omit<Unstyled<PopoverPrimitive.Trigger.Props>, "render"> & {
  /** The kit control that opens it: `render={<IconButton icon={…} aria-label="Why this time" />}`. */
  render: React.ReactElement
}

export function PopoverTrigger(props: PopoverTriggerProps) {
  return <PopoverPrimitive.Trigger {...props} />
}

export type PopoverPanelProps = Pick<
  Unstyled<PopoverPrimitive.Popup.Props>,
  "initialFocus" | "finalFocus" | "id"
> &
  Pick<PopoverPrimitive.Positioner.Props, "side" | "align"> & {
    /** Optional heading, 14/560; it names the popover for assistive tech. */
    title?: string
    children: React.ReactNode
    /** `sm` 280, `md` 340 (the lead measure). The panel never outgrows the screen. */
    width?: "sm" | "md"
  }

const WIDTH = { sm: "w-70", md: "w-(--container-kit-lead)" } as const

/**
 * The white object, lifted: it floats over live content with no scrim, so
 * it takes the floating-panel elevation the Menu and Select panels share
 * (overlay-styles FLOATING_ELEVATION). 18 radius, 18 padding. No arrow:
 * the kit's objects have none, and a ring-and-shadow object cannot draw one
 * that matches its own edge. It opens 8px off its trigger and scales from it.
 */
export function PopoverPanel({
  title,
  children,
  side = "bottom",
  align = "start",
  width = "md",
  ...props
}: PopoverPanelProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={16}
        className={`z-50 outline-hidden ${PORTAL_TYPE}`}
      >
        <PopoverPrimitive.Popup
          {...props}
          data-slot="kit-popover"
          className={
            `${WIDTH[width]} max-w-[calc(100vw-2rem)] max-h-(--available-height) overflow-y-auto overscroll-contain rounded-kit-object bg-kit-object p-kit-pad text-kit-ink ${FLOATING_ELEVATION} outline-hidden ${FLOATING_MOTION}`
          }
        >
          <div className="flex flex-col gap-kit-related">
            {title ? (
              <PopoverPrimitive.Title className="text-kit-body font-kit-strong">{title}</PopoverPrimitive.Title>
            ) : null}
            {children}
          </div>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

/** A muted sentence in the popover, its description for assistive tech. */
export function PopoverDescription({ children }: { children: React.ReactNode }) {
  return (
    <PopoverPrimitive.Description className="text-kit-body text-kit-ink-muted text-pretty">
      {children}
    </PopoverPrimitive.Description>
  )
}
