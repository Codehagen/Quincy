"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import {
  BUTTON_BASE,
  BUTTON_ICON_END_SIZE,
  BUTTON_ICON_SIZE,
  BUTTON_SHORTCUT_END_SIZE,
  BUTTON_SIZE,
  BUTTON_VARIANT,
  BUTTON_WIDTH,
  ICON_DENSE,
  type ButtonSize,
  type ButtonWidth,
} from "./control-styles"
import { devWarn } from "./dev-warn"
import { Kbd } from "./kbd"
import { PendingAnnouncer, StableLabel } from "./stable-label"
import { useOneAction } from "./use-one-action"

/**
 * - `action` — the ONE action on a view (Approve, Send, Draft it). An ink
 *   pill, as the landing's call to action. Two on one view means one of
 *   them is not the action.
 * - `quiet` — everything else (Edit, Undo): a white pill with a ring and
 *   a soft fall, ink label. The same surface step 2's controls use.
 * - `danger` — destructive only: the quiet control with a red label, never a
 *   red fill. Where letting go should cancel, use HoldButton instead.
 * - `ghost` — no surface at rest, a muted label. Only in a workspace's
 *   toolbar or foot (Clear, Undo), where six floating pills would be noise
 *   (docs/design/workspace.md). Never in a Card.
 */
export type ButtonVariant = "action" | "quiet" | "danger" | "ghost"

export type { ButtonSize, ButtonWidth }

export type ButtonProps = Omit<
  ButtonPrimitive.Props,
  "className" | "style" | "children" | "render" | "nativeButton"
> & {
  children: React.ReactNode
  /** Default `quiet`, so a forgotten variant can never add a second ink fill. */
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading hugeicon. Decorative beside the label, so it is aria-hidden. */
  icon?: IconSvgElement
  /**
   * A leading mark that is not a hugeicon (a brand's own glyph, such as
   * Google's "G"), drawn at the icon's size. Decorative: the label names
   * it, so the slot is aria-hidden. Use `icon` when a hugeicon exists.
   */
  mark?: React.ReactNode
  /**
   * Trailing hugeicon, for a control that leads somewhere or opens more
   * ("Manage →"). Decorative, aria-hidden. Never both a trailing and a
   * leading icon.
   */
  iconEnd?: IconSvgElement
  /** `auto` (default) or `full`, to span the container (an auth card's column). */
  width?: ButtonWidth
  /**
   * A single key that does the same thing on this surface ("U" for Undo),
   * drawn as an 18px cap at the label's end. The cap is decorative and
   * hidden on touch; the key is announced through `aria-keyshortcuts`,
   * which defaults to the key in lower case (pass your own to override).
   * The surface's own key handler does the work; this only shows it.
   */
  shortcut?: string
  /**
   * Other labels this button can show ("Preview" while it says "Edit",
   * "Copied" while it says "Copy"). It reserves the widest, as it does for
   * `pendingLabel`, so a toggle never moves out from under the pointer.
   */
  reserve?: readonly string[]
  /** Disables the button, keeps it focusable, shows and announces `pendingLabel`. */
  pending?: boolean
  /**
   * What the label says while pending ("Approving…"). The button reserves
   * the wider of the two labels, so nothing beside it moves.
   */
  pendingLabel?: string
  /**
   * @deprecated A link that looks like a button is `ButtonLink`. Rendering
   * an `<a>` through Button gives it `role="button"`, and a screen reader
   * then announces a link as a button. Kept only so old call sites compile;
   * it warns in development.
   */
  render?: ButtonPrimitive.Props["render"]
  /** @deprecated See `render`. */
  nativeButton?: boolean
}

/**
 * The kit's button, on Base UI. Press scales to `--kit-press-scale` (0.96). Hover on the action
 * fill is `--kit-primary-hover`, a mix toward the ground, never an alpha.
 * Navigation is never a Button: use ButtonLink, or TextLink inside a sentence.
 */
export function Button({
  children,
  variant = "quiet",
  size = "md",
  icon,
  mark,
  iconEnd,
  width = "auto",
  shortcut,
  reserve,
  pending = false,
  pendingLabel,
  disabled = false,
  type = "button",
  ...props
}: ButtonProps) {
  const one = useOneAction(variant === "action")

  if (process.env.NODE_ENV !== "production") {
    if (props.nativeButton === false || props.render) {
      devWarn(
        "button-as-link",
        "a Button rendered through `render` is announced as a button even when it is a link. Use ButtonLink (docs/design/buttons.md).",
      )
    }
    const name = props["aria-label"]
    if (
      typeof name === "string" &&
      typeof children === "string" &&
      !name.toLowerCase().includes(children.toLowerCase())
    ) {
      devWarn(
        "label-in-name",
        `the aria-label "${name}" drops the visible label "${children}" (WCAG 2.5.3). Keep the visible words and add context with aria-describedby (docs/design/buttons.md).`,
      )
    }
  }

  const labels = [children, ...(pendingLabel ? [pendingLabel] : []), ...(reserve ?? [])]
  const dense = size === "xs" || size === "sm"
  // 16 at stroke 1.75 beside the dense 13px label; 16/18 at 2 beside body.
  const iconProps = dense ? ICON_DENSE : { size: size === "lg" ? 18 : 16, strokeWidth: 2 }
  const leading = icon != null || mark != null
  const trailing = iconEnd && !leading
  const end = trailing ? BUTTON_ICON_END_SIZE[size] : shortcut ? BUTTON_SHORTCUT_END_SIZE[size] : ""
  const keyshortcuts =
    props["aria-keyshortcuts"] ?? (shortcut && shortcut.length === 1 ? shortcut.toLowerCase() : shortcut)

  return (
    <>
      <ButtonPrimitive
        {...props}
        {...one}
        type={type}
        data-slot="kit-button"
        data-variant={variant}
        disabled={disabled || pending}
        focusableWhenDisabled={pending || props.focusableWhenDisabled}
        aria-busy={pending || undefined}
        aria-keyshortcuts={keyshortcuts}
        className={`${BUTTON_BASE} ${BUTTON_SIZE[size]} ${leading ? BUTTON_ICON_SIZE[size] : ""} ${end} ${BUTTON_WIDTH[width]} ${BUTTON_VARIANT[variant]}`}
      >
        {icon ? (
          <HugeiconsIcon icon={icon} {...iconProps} aria-hidden className="shrink-0" />
        ) : mark != null ? (
          <span aria-hidden className={`grid shrink-0 place-items-center ${size === "lg" ? "size-4.5" : "size-4"} *:size-full`}>
            {mark}
          </span>
        ) : null}
        <StableLabel current={pending && pendingLabel ? 1 : 0} labels={labels} />
        {trailing && iconEnd ? (
          <HugeiconsIcon icon={iconEnd} {...iconProps} aria-hidden className="shrink-0" />
        ) : shortcut ? (
          <span className="pointer-coarse:hidden">
            <Kbd keys={[shortcut]} size="sm" tone={variant === "action" ? "on-ink" : "muted"} decorative />
          </span>
        ) : null}
      </ButtonPrimitive>
      {pendingLabel ? <PendingAnnouncer message={pending ? pendingLabel : null} /> : null}
    </>
  )
}
