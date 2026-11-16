"use client"

import * as React from "react"
import Link from "next/link"
import { Button as ButtonPrimitive } from "@base-ui/react/button"

import { FOCUS_RING, HIT_40_44 } from "@/components/kit/control-styles"
import { PendingAnnouncer, StableLabel } from "@/components/kit/stable-label"

/**
 * - `ink`: the page's call to action: an ink pill on the ground, in both
 *   modes. Not the kit's blue on purpose. Blue is Approve in every picture
 *   on the page, and the page's argument is that Approve is yours: a blue
 *   "Join the waitlist" beside a blue Approve would make them one kind of press.
 * - `quiet`: a second, lesser door: the kit's white control, as a pill.
 */
export type MarketingButtonVariant = "ink" | "quiet"

/** `md` (36px) in the header and a form; `lg` (44px) under the h1 only. */
export type MarketingButtonSize = "md" | "lg"

const BASE =
  "relative inline-grid shrink-0 place-items-center rounded-full font-kit-strong whitespace-nowrap select-none " +
  "transition-[scale,background-color] duration-[var(--kit-duration-press),var(--kit-duration-state)] ease-kit-out " +
  "not-data-disabled:active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:not-data-disabled:active:scale-100 " +
  `data-disabled:cursor-default ${FOCUS_RING} ${HIT_40_44}`

const SIZE: Record<MarketingButtonSize, string> = {
  md: "h-kit-control-md px-kit-cta-md text-kit-body",
  lg: "h-kit-control-lg px-kit-cta-lg text-kit-display-cta",
}

const VARIANT: Record<MarketingButtonVariant, string> = {
  ink: "bg-kit-ink text-kit-ground hover:not-data-disabled:bg-kit-ink-hover data-disabled:bg-kit-ink-disabled",
  quiet:
    "bg-kit-control text-kit-ink shadow-kit-control hover:not-data-disabled:bg-kit-control-hover data-disabled:opacity-50",
}

function classes(variant: MarketingButtonVariant, size: MarketingButtonSize) {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]}`
}

export type MarketingButtonProps = Omit<
  ButtonPrimitive.Props,
  "className" | "style" | "children" | "render" | "nativeButton"
> & {
  children: React.ReactNode
  /** Default `ink`: on a marketing page the button is the call to action. */
  variant?: MarketingButtonVariant
  size?: MarketingButtonSize
  /** Disables the button, keeps it focusable, shows and announces `pendingLabel`. */
  pending?: boolean
  /** "Joining…". The button reserves the wider label, so nothing beside it moves. */
  pendingLabel?: string
}

/** The marketing button, on Base UI. Navigation is MarketingButtonLink, never this. */
export function MarketingButton({
  children,
  variant = "ink",
  size = "md",
  pending = false,
  pendingLabel,
  disabled = false,
  type = "button",
  ...props
}: MarketingButtonProps) {
  const labels = pendingLabel ? [children, pendingLabel] : [children]
  return (
    <>
      <ButtonPrimitive
        {...props}
        type={type}
        data-slot="marketing-button"
        data-variant={variant}
        disabled={disabled || pending}
        focusableWhenDisabled={pending || props.focusableWhenDisabled}
        aria-busy={pending || undefined}
        className={classes(variant, size)}
      >
        <StableLabel current={pending && pendingLabel ? 1 : 0} labels={labels} />
      </ButtonPrimitive>
      {pendingLabel ? <PendingAnnouncer message={pending ? pendingLabel : null} /> : null}
    </>
  )
}

export type MarketingButtonLinkProps = Omit<
  React.ComponentPropsWithRef<typeof Link>,
  "className" | "style" | "children" | "role"
> & {
  children: React.ReactNode
  variant?: MarketingButtonVariant
  size?: MarketingButtonSize
}

/**
 * The same pill on a real `<a>` (next/link), announced as a link. No
 * `pending` and no `disabled`: a link that is not available is not rendered.
 */
export function MarketingButtonLink({
  children,
  variant = "ink",
  size = "md",
  ...props
}: MarketingButtonLinkProps) {
  return (
    <Link {...props} data-slot="marketing-button-link" data-variant={variant} className={classes(variant, size)}>
      {children}
    </Link>
  )
}
