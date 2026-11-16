"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { FOCUS_RING, HIT_44 } from "@/components/kit/control-styles"

/**
 * CANDIDATES — the workspace's chrome: a toolbar row, a compact button with
 * a ghost variant, and key hints. Lab-local; DECISION.md lists what each
 * would replace in components/kit.
 */

/* ── Toolbar ─────────────────────────────────────────────────────────── */

/**
 * One row of page chrome, the shell bar's height (52), a hairline under it.
 * Not `role="toolbar"`: it holds a search field and menus, and the toolbar
 * pattern's arrow-key roving would fight the field's caret. Tab order is
 * the reading order.
 */
export function Toolbar({
  children,
  label,
  divided = true,
  size = "bar",
}: {
  children: React.ReactNode
  label: string
  /** A hairline under the row. Off for the first row of a pair: the page and its filters are one band. */
  divided?: boolean
  /** `bar` 52 (the shell bar, 32px controls); `filter` 44 (28px chips, 8 above and below). */
  size?: "bar" | "filter"
}) {
  return (
    <div
      aria-label={label}
      role="group"
      data-ws-toolbar
      className={`flex shrink-0 flex-wrap items-center gap-x-kit-related gap-y-kit-controls px-kit-group ${size === "bar" ? "min-h-(--ws-bar-h) py-2.5" : "min-h-(--ws-filter-h) py-2"} ${divided ? "border-b border-kit-hairline" : ""}`}
    >
      {children}
    </div>
  )
}

/** Controls that belong together, 6px apart. `end` pushes the group to the row's end. */
export function ToolbarGroup({
  children,
  end = false,
  grow = false,
}: {
  children: React.ReactNode
  end?: boolean
  /** On a narrow page the group takes the whole row it wraps to (a search beside its action). */
  grow?: boolean
}) {
  return (
    <div className={`flex min-w-0 items-center gap-kit-controls ${end ? "ms-auto" : ""} ${grow ? "w-full @[40rem]/ws:w-auto" : ""}`}>
      {children}
    </div>
  )
}

export function ToolbarDivider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-kit-hairline" />
}

/* ── WsButton ────────────────────────────────────────────────────────── */

export type WsButtonVariant = "action" | "quiet" | "ghost"

const VARIANT: Record<WsButtonVariant, string> = {
  // Ink, as the kit's action. Hover mixes toward the ground (AGENTS.md).
  action: "bg-kit-primary text-kit-primary-on hover:not-data-disabled:bg-kit-primary-hover data-disabled:bg-kit-primary-disabled",
  // The kit's quiet control, unchanged: white, ring, short fall.
  quiet: "bg-kit-control text-kit-ink shadow-kit-control hover:not-data-disabled:bg-kit-control-hover",
  // New: no surface at rest. For a toolbar of six controls, where six
  // floating pills is the noise that makes the kit's toolbars read busy.
  ghost: "text-kit-ink-muted hover:not-data-disabled:bg-kit-row-hover hover:not-data-disabled:text-kit-ink data-popup-open:bg-kit-row-hover data-popup-open:text-kit-ink",
}

const SIZE = {
  // 28 and 32: under the kit's 36 (md), for a toolbar and a pane's footer.
  sm: "h-7 px-2.5",
  md: "h-8 px-3",
} as const

// Optical padding: a glyph or a key cap at an edge carries its own visual
// weight, so that side takes 2px less than the text side (10 → 8, 12 → 10).
const ICON_SIDE = { sm: "ps-2", md: "ps-2.5" } as const
// On touch the key cap is hidden, so the end goes back to the text side's padding.
const HINT_SIDE = { sm: "pe-2 pointer-coarse:pe-2.5", md: "pe-2.5 pointer-coarse:pe-3" } as const

export type WsButtonProps = Omit<ButtonPrimitive.Props, "className" | "style" | "children"> & {
  children: React.ReactNode
  variant?: WsButtonVariant
  size?: keyof typeof SIZE
  icon?: IconSvgElement
  /** A key that does the same thing, shown at the label's end. */
  hint?: string
  pending?: boolean
  pendingLabel?: string
}

/**
 * The kit Button, one size down and with a `ghost` variant. 44px hit area
 * on touch (vertical, as the kit's), press scale, named transitions.
 */
export const WsButton = React.forwardRef<HTMLButtonElement, WsButtonProps>(function WsButton(
  { children, variant = "quiet", size = "md", icon, hint, pending = false, pendingLabel, disabled, type = "button", ...props },
  ref
) {
  return (
    <ButtonPrimitive
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || pending}
      focusableWhenDisabled={pending}
      aria-busy={pending || undefined}
      data-variant={variant}
      className={
        `ws-control relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-kit-strong whitespace-nowrap select-none ${SIZE[size]} ${icon ? ICON_SIDE[size] : ""} ${hint ? HINT_SIDE[size] : ""} ${VARIANT[variant]} ${FOCUS_RING} ${HIT_44} ` +
        "transition-[scale,background-color,color] duration-[var(--kit-duration-press),var(--kit-duration-state),var(--kit-duration-state)] ease-kit-out " +
        "not-data-disabled:active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:not-data-disabled:active:scale-100 data-disabled:cursor-default"
      }
    >
      {icon ? <HugeiconsIcon icon={icon} data-ws-icon aria-hidden className="shrink-0" /> : null}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
      {hint ? <KeyHint k={hint} onInk={variant === "action"} className="pointer-coarse:hidden" /> : null}
    </ButtonPrimitive>
  )
})

/* ── KeyHint / KeyBar ────────────────────────────────────────────────── */

/**
 * One key, 18px, the kit Kbd's ring. Decorative where it sits in a button
 * (the button's label names the action, `aria-keyshortcuts` the key) and
 * hidden there on touch, where there are no keys; KeyBar says it in words.
 */
export function KeyHint({ k, onInk = false, className = "" }: { k: string; onInk?: boolean; className?: string }) {
  return (
    <kbd
      aria-hidden
      className={`${className} inline-grid h-4.5 min-w-4.5 place-items-center rounded-kit-chip px-1 font-kit-sans text-kit-kbd font-kit-strong not-italic ${onInk ? "bg-kit-kbd-on-ink text-kit-primary-on" : "text-kit-ink-muted shadow-kit-inset"}`}
    >
      {k}
    </kbd>
  )
}

/** The keys a pane answers to, along its foot. Hidden on touch, where there are no keys. */
export function KeyBar({ keys }: { keys: [string, string][] }) {
  return (
    <div
      aria-label="Keyboard shortcuts"
      role="note"
      className="ws-foot flex shrink-0 items-center gap-x-kit-group overflow-hidden border-t border-kit-hairline pointer-coarse:hidden"
    >
      {keys.map(([k, label]) => (
        <span key={k} className="ws-meta inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-kit-ink-muted">
          {/* The caps are drawn for the eye; the keys are said once, in words. */}
          <span className="sr-only">{`${k.split(" ").join(" or ")}: `}</span>
          <span className="inline-flex gap-0.5">
            {k.split(" ").map((part) => (
              <KeyHint key={part} k={part} />
            ))}
          </span>
          {label}
        </span>
      ))}
    </div>
  )
}
