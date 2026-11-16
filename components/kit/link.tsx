"use client"

import * as React from "react"
import Link from "next/link"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import {
  BUTTON_BASE,
  BUTTON_ICON_END_SIZE,
  BUTTON_ICON_SIZE,
  BUTTON_SIZE,
  BUTTON_VARIANT,
  BUTTON_WIDTH,
  FOCUS_RING,
  HIT_44,
  type ButtonSize,
  type ButtonWidth,
} from "./control-styles"
import { PendingAnnouncer, StableLabel } from "./stable-label"
import { useOneAction } from "./use-one-action"

type LinkBase = Omit<
  React.ComponentPropsWithRef<typeof Link>,
  "className" | "style" | "children" | "role"
>

/**
 * `quiet` (default) or `action`. There is no `danger` link: going somewhere
 * never destroys anything, so a red link would be a lie about what it does.
 */
export type ButtonLinkVariant = "action" | "quiet"

export type ButtonLinkProps = LinkBase & {
  children: React.ReactNode
  variant?: ButtonLinkVariant
  size?: ButtonSize
  /** Leading hugeicon. Decorative beside the label, so it is aria-hidden. */
  icon?: IconSvgElement
  /** Trailing hugeicon ("Open Drafts →"). Never both. Decorative. */
  iconEnd?: IconSvgElement
  /** `auto` (default) or `full`, as Button. */
  width?: ButtonWidth
}

/**
 * A link that looks exactly like a Button: a real `<a>` through next/link,
 * with no role, so it is announced as a link and opens in a new tab on
 * ⌘/Ctrl-click. Use it where navigation stands on its own as a control
 * ("Open Drafts", "Connect a source"). Inside a sentence, use TextLink.
 *
 * There is no `pending` or `disabled`: a link cannot be disabled. If it is
 * not available yet, do not render it, and say why in text.
 */
export function ButtonLink({
  children,
  variant = "quiet",
  size = "md",
  icon,
  iconEnd,
  width = "auto",
  ...props
}: ButtonLinkProps) {
  const one = useOneAction(variant === "action")
  return (
    <Link
      {...props}
      {...one}
      data-slot="kit-button-link"
      data-variant={variant}
      className={`${BUTTON_BASE} ${BUTTON_SIZE[size]} ${icon ? BUTTON_ICON_SIZE[size] : ""} ${iconEnd && !icon ? BUTTON_ICON_END_SIZE[size] : ""} ${BUTTON_WIDTH[width]} ${BUTTON_VARIANT[variant]}`}
    >
      {icon ? (
        <HugeiconsIcon
          icon={icon}
          size={size === "lg" ? 18 : 16}
          strokeWidth={2}
          aria-hidden
          className="shrink-0"
        />
      ) : null}
      {children}
      {iconEnd && !icon ? (
        <HugeiconsIcon
          icon={iconEnd}
          size={size === "lg" ? 18 : 16}
          strokeWidth={2}
          aria-hidden
          className="shrink-0"
        />
      ) : null}
    </Link>
  )
}

export type TextLinkProps = LinkBase & {
  children: React.ReactNode
}

/**
 * A link inside a line of text ("From @ada's post."). It takes the colour of
 * the text around it, so it works in ink and in muted copy alike; the
 * underline (`--kit-link-line`, the text colour at 40%, offset
 * `--kit-link-offset`) says "link" without a new hue. Hover takes the
 * underline and the text to full ink. Inline links are exempt from the 44px
 * target (WCAG 2.5.8), so it adds no hit area that would cover the line
 * above or below.
 */
export function TextLink({ children, ...props }: TextLinkProps) {
  return (
    <Link {...props} data-slot="kit-text-link" className={TEXT_LINK}>
      {children}
    </Link>
  )
}

/** The TextLink look, shared with TextButton so the two never drift. */
const TEXT_LINK =
  "rounded-kit-chip underline decoration-kit-link-line decoration-from-font underline-offset-(--kit-link-offset) " +
  "transition-[color,text-decoration-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  `hover:text-kit-ink hover:decoration-current ${FOCUS_RING}`

export type TextButtonProps = Omit<
  React.ComponentPropsWithRef<"button">,
  "className" | "style" | "children" | "type"
> & {
  children: string
  /** `button` (default) or `submit`. */
  type?: "button" | "submit"
  /** Disables it and shows `pendingLabel`, as Button does. */
  pending?: boolean
  /** What it says while pending ("Reading it…"). Width is reserved. */
  pendingLabel?: string
}

/**
 * The TextLink look on a real `<button>`, for an action that sits inside a
 * sentence or under one and goes nowhere: "Wrong address? Go back and fix
 * it", "Read my last merged pull request". Announced as a button, because
 * it is one. A control that stands alone is a Button; this is the inline
 * form of the quiet one, never of the action.
 *
 * Like TextLink it takes the colour of the text around it. Unlike TextLink
 * it does grow its hit area: it often stands on its own line under a
 * sentence ("Wrong address? Go back and fix it"), and a 20px-tall button is
 * a miss on a phone. Vertical only (HIT_44), as Button does (AGENTS.md).
 *
 * Pending is `aria-disabled`, not `disabled`: a native disabled button drops
 * focus to <body> the moment it is pressed, and the keyboard user has to
 * find their way back. Clicks are ignored while pending instead. Native
 * `disabled` stays for the `disabled` prop, where leaving the tab order is
 * the point.
 */
export function TextButton({
  children,
  type = "button",
  pending = false,
  pendingLabel,
  disabled,
  onClick,
  ...props
}: TextButtonProps) {
  const labels = pendingLabel ? [children, pendingLabel] : [children]
  return (
    <>
      <button
        {...props}
        type={type}
        data-slot="kit-text-button"
        disabled={disabled}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onClick={(event) => {
          if (pending) {
            // Also stops a submit-type button submitting its form again.
            event.preventDefault()
            return
          }
          onClick?.(event)
        }}
        className={`relative cursor-pointer disabled:cursor-default aria-disabled:cursor-default disabled:not-aria-busy:opacity-50 ${TEXT_LINK} ${HIT_44}`}
      >
        <StableLabel current={pending && pendingLabel ? 1 : 0} labels={labels} />
      </button>
      {pendingLabel ? <PendingAnnouncer message={pending ? pendingLabel : null} /> : null}
    </>
  )
}
