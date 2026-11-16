"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { Kbd, type KbdKey } from "./kbd"
import { PORTAL_TYPE } from "./overlay-styles"

export type TooltipProps = Pick<TooltipPrimitive.Positioner.Props, "side" | "align"> & {
  /**
   * What is not already on screen: "Last edited 2 hours ago", "Goes out at
   * 07:45 your time". Never the control's own label: an icon button's name
   * is its aria-label, and a tooltip repeating it says nothing.
   */
  content: React.ReactNode
  /** The shortcut, shown after the words: `["mod", "B"]`. */
  shortcut?: readonly KbdKey[]
  /**
   * One element that takes a ref and pointer and focus events: a kit
   * Button, IconButton, ButtonLink, or a focusable span around text.
   */
  children: React.ReactElement
  /** Open it no matter what. For the lab; a page never needs it. */
  open?: boolean
}

/**
 * A small ink chip, the ground's colour reversed, so it reads as a note
 * from the product rather than an object you can press (every white thing
 * in the kit is pressable or holds something pressable). Small type (12.5/18), 8px
 * radius, no arrow.
 *
 * Timing comes from the one Tooltip provider in components/app-providers.tsx
 * (delay 200, timeout 300: once one opens, its neighbours open at once), so
 * this never sets a delay of its own. Base UI never opens a tooltip on
 * touch; whatever it says must be reachable some other way (AGENTS.md:
 * hover enhances, never enables). Under reduced motion it fades only.
 */
export function Tooltip({ content, shortcut, children, side = "top", align = "center", open }: TooltipProps) {
  return (
    <TooltipPrimitive.Root open={open}>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={8}
          className={`z-50 ${PORTAL_TYPE}`}
        >
          <TooltipPrimitive.Popup
            data-slot="kit-tooltip"
            className={
              "flex max-w-64 items-center gap-kit-controls rounded-kit-control-inner bg-kit-ink px-kit-tip-x py-kit-tip-y text-kit-small text-kit-ground text-pretty " +
              "origin-(--transform-origin) transition-[opacity,scale] duration-(--kit-duration-press) ease-kit-out " +
              "data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:opacity-0 data-instant:duration-0 " +
              "motion-reduce:data-starting-style:scale-100 " +
              // Keycaps on the ink: the ground at a low alpha (--kit-kbd-on-ink),
              // so they read in both modes.
              "[&_[data-slot=kit-kbd]>span[aria-hidden]]:text-kit-ground [&_[data-slot=kit-kbd]>span[aria-hidden]]:shadow-none [&_[data-slot=kit-kbd]>span[aria-hidden]]:bg-kit-kbd-on-ink"
            }
          >
            <span className="min-w-0">{content}</span>
            {shortcut ? <Kbd keys={shortcut} /> : null}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
