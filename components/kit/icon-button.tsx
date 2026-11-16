import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { CONTROL_SURFACE, FOCUS_RING, HIT_44 } from "./control-styles"

/** `md` (36px) beside a md Button; `lg` (44px) on its own in a collage. */
export type IconButtonSize = "md" | "lg"

export type IconButtonProps = Omit<
  ButtonPrimitive.Props,
  "className" | "style" | "children" | "aria-label"
> & {
  icon: IconSvgElement
  /**
   * Required: the icon is the only content, so this is the button's name
   * ("Attach a file", not "Paperclip"). A tooltip is not a substitute.
   */
  "aria-label": string
  size?: IconButtonSize
}

const SIZE: Record<IconButtonSize, string> = {
  md: "size-kit-control-md",
  lg: "size-kit-control-lg",
}

/**
 * The round white control from Stageshow's collage: ring + soft fall, an ink
 * icon in the middle. Press scales to `--kit-press-scale` like Button. There is no blue
 * variant: the one action on a view has a word on it, so it is a Button.
 */
export function IconButton({
  icon,
  size = "md",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <ButtonPrimitive
      {...props}
      type={type}
      data-slot="kit-icon-button"
      className={
        `relative inline-grid shrink-0 place-items-center rounded-full text-kit-ink select-none ${SIZE[size]} ${CONTROL_SURFACE} ${FOCUS_RING} ${HIT_44} ` +
        "transition-[scale,background-color] duration-[var(--kit-duration-press),var(--kit-duration-state)] ease-kit-out motion-reduce:transition-none " +
        "hover:not-data-disabled:bg-kit-control-hover not-data-disabled:active:scale-(--kit-press-scale) motion-reduce:not-data-disabled:active:scale-100 " +
        "data-disabled:cursor-default data-disabled:opacity-50"
      }
    >
      <HugeiconsIcon icon={icon} size={size === "lg" ? 20 : 18} strokeWidth={2} aria-hidden />
    </ButtonPrimitive>
  )
}
