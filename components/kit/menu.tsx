"use client"

import * as React from "react"
import Link from "next/link"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import {
  CONTROL_SURFACE,
  FOCUS_RING,
  HIT_44,
  PANEL,
  PANEL_ROW,
} from "./control-styles"
import { devWarn } from "./dev-warn"
import { PORTAL_TYPE } from "./overlay-styles"

type Unstyled<P> = Omit<P, "className" | "style">
export type MenuProps = MenuPrimitive.Root.Props

/** Root. Holds open state: `open` + `onOpenChange`, or `defaultOpen`. */
export function Menu(props: MenuProps) {
  return <MenuPrimitive.Root {...props} />
}

export type MenuTriggerProps = Unstyled<MenuPrimitive.Trigger.Props>

/**
 * A quiet control by default. To open the menu from a kit Button or
 * IconButton instead, pass it as `render` (Base UI's pattern, not asChild):
 * `<MenuTrigger render={<IconButton icon={…} aria-label="More" />} />`.
 */
export function MenuTrigger({ children, ...props }: MenuTriggerProps) {
  return (
    <MenuPrimitive.Trigger
      {...props}
      data-slot="kit-menu-trigger"
      className={`relative inline-flex h-kit-control-md items-center gap-kit-controls rounded-full px-kit-cta-md font-kit-strong text-kit-body text-kit-ink ${CONTROL_SURFACE} ${FOCUS_RING} ${HIT_44} transition-[background-color,scale] duration-[var(--kit-duration-state),var(--kit-duration-press)] ease-kit-out hover:bg-kit-control-hover active:scale-(--kit-press-scale) data-popup-open:bg-kit-control-hover motion-reduce:transition-none motion-reduce:active:scale-100`}
    >
      {children}
    </MenuPrimitive.Trigger>
  )
}

export type MenuPanelProps = Omit<Unstyled<MenuPrimitive.Popup.Props>, "finalFocus"> &
  Pick<MenuPrimitive.Positioner.Props, "side" | "align"> & {
    children: React.ReactNode
    /**
     * Where focus goes when the menu closes. Default: back to the trigger.
     * A command that removes its own trigger (Dismiss, Delete, Move) MUST
     * name the element that takes its place: a ref, or a function that
     * returns the element (it runs after the command's state change). If the
     * command unmounts the Menu itself, focus the target from the parent
     * instead (docs/design/menus.md).
     */
    finalFocus?: MenuPrimitive.Popup.Props["finalFocus"]
    /**
     * `content` (default) sizes to the widest row, from 11rem. `wide` is a
     * fixed 18rem capped 1rem inside the viewport, for rows whose titles
     * vary (a conversation history): each title truncates and its meta
     * stays at the same x on every row, instead of the panel growing to
     * its longest title and running off a phone.
     */
    width?: "content" | "wide"
  }

const PANEL_WIDTH = {
  content: "",
  wide: "w-[min(18rem,calc(100vw-2rem))]",
} as const

/** The white panel, portalled and positioned under (`side`) its trigger. */
export function MenuPanel({
  children,
  side = "bottom",
  align = "start",
  width = "content",
  ...props
}: MenuPanelProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} align={align} sideOffset={6} className={`z-50 outline-hidden ${PORTAL_TYPE}`}>
        <MenuPrimitive.Popup {...props} data-slot="kit-menu-panel" data-width={width} className={`${PANEL} ${PANEL_WIDTH[width]}`}>
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

export type MenuItemTone = "ink" | "danger"

export type MenuItemProps = Omit<Unstyled<MenuPrimitive.Item.Props>, "children" | "render"> & {
  children: React.ReactNode
  /** Leading hugeicon. Decorative beside the label, so aria-hidden. */
  icon?: IconSvgElement
  /** `danger` for destructive rows only: red text, never a red row. */
  tone?: MenuItemTone
}

/**
 * Development only: after a command, check that focus did not fall to
 * <body>. It does when the command removed the trigger and nothing named
 * where focus goes. Two frames, so the menu's own focus return has run.
 */
function checkFocusAfterCommand() {
  if (process.env.NODE_ENV === "production") return
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (active == null || active === document.body) {
        devWarn(
          "menu-final-focus",
          "a Menu command left keyboard focus on <body>. A command that removes its own trigger must name where focus goes: MenuPanel finalFocus, or focus the replacement from the parent (docs/design/menus.md).",
        )
      }
    }),
  )
}

export function MenuItem({ children, icon, tone = "ink", onClick, ...props }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      {...props}
      onClick={(event) => {
        onClick?.(event)
        checkFocusAfterCommand()
      }}
      data-slot="kit-menu-item"
      data-tone={tone}
      className={`${PANEL_ROW} ${tone === "danger" ? "text-kit-danger" : "text-kit-ink"}`}
    >
      {icon ? (
        <HugeiconsIcon
          icon={icon}
          size={16}
          strokeWidth={2}
          aria-hidden
          className={`shrink-0 ${tone === "danger" ? "" : "text-kit-ink-muted"}`}
        />
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </MenuPrimitive.Item>
  )
}

/** A hairline between groups of rows. */
export function MenuSeparator() {
  return <MenuPrimitive.Separator className="mx-kit-related my-kit-row-inset h-px bg-kit-hairline" />
}

export type MenuGroupProps = Unstyled<MenuPrimitive.Group.Props>

/** Rows that belong together, under a MenuGroupLabel. */
export function MenuGroup(props: MenuGroupProps) {
  return <MenuPrimitive.Group {...props} />
}

/**
 * A small muted label over a group, aligned with the row labels. Not a row:
 * it does not highlight or take focus. Base UI requires a MenuGroup around it.
 */
export function MenuGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <MenuPrimitive.GroupLabel className="flex min-h-8 items-center gap-2 px-kit-row-x text-kit-small font-kit-strong text-kit-ink-muted select-none">
      {children}
    </MenuPrimitive.GroupLabel>
  )
}

export type MenuRadioGroupProps = Unstyled<MenuPrimitive.RadioGroup.Props>

/** One choice of several, in place: a theme, a sort. `value` + `onValueChange`. */
export function MenuRadioGroup(props: MenuRadioGroupProps) {
  return <MenuPrimitive.RadioGroup {...props} />
}

export type MenuRadioItemProps = Omit<
  Unstyled<MenuPrimitive.RadioItem.Props>,
  "children" | "render"
> & {
  children: string
}

/**
 * A row in a MenuRadioGroup. The picked row carries an ink check at its end;
 * the label never moves, so the rows stay aligned with the plain MenuItems.
 */
export function MenuRadioItem({ children, ...props }: MenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      {...props}
      data-slot="kit-menu-radio-item"
      className={`${PANEL_ROW} text-kit-ink`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <MenuPrimitive.RadioItemIndicator className="flex shrink-0">
        <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} aria-hidden />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  )
}

export type MenuLinkItemProps = Omit<
  Unstyled<MenuPrimitive.LinkItem.Props>,
  "children" | "render" | "href"
> & {
  /** An app route. A Next.js Link, so it navigates without a reload. */
  href: string
  children: React.ReactNode
  icon?: IconSvgElement
}

/** A row that goes to a page. The menu closes on the way out. */
export function MenuLinkItem({ href, children, icon, ...props }: MenuLinkItemProps) {
  return (
    <MenuPrimitive.LinkItem
      closeOnClick
      {...props}
      render={<Link href={href} />}
      data-slot="kit-menu-link-item"
      className={`${PANEL_ROW} text-kit-ink`}
    >
      {icon ? (
        <HugeiconsIcon icon={icon} size={16} strokeWidth={2} aria-hidden className="shrink-0 text-kit-ink-muted" />
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </MenuPrimitive.LinkItem>
  )
}
