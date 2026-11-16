"use client"

import * as React from "react"

/**
 * CANDIDATE — Panel: a pane of the workspace. It owns its own scroll, so the
 * toolbar and the other panes stay put while one scrolls. The edge between
 * panes is the lab's "edge" control (hairline divider, or the detail raised
 * as an object), set in candidates.css by `pane`.
 */
export function Panel({
  pane,
  label,
  width,
  children,
  afterRail = false,
}: {
  pane: "rail" | "list" | "detail"
  label: string
  /** A CSS width (`var(--ws-detail-w)`); without one the pane takes what is left. */
  width?: string
  children: React.ReactNode
  /** The list pane right of a rail draws the divider on its start edge. */
  afterRail?: boolean
}) {
  return (
    <section
      aria-label={label}
      data-ws-pane={pane}
      data-ws-after-rail={afterRail || undefined}
      style={width ? { width, flex: "none" } : undefined}
      className={`flex min-h-0 min-w-0 flex-col ${width ? "" : "flex-1"}`}
    >
      {children}
    </section>
  )
}

/** A pane's own head: a label and, at its end, a control or a count. */
export function PanelHeader({ children, end }: { children: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-kit-related px-kit-group">
      <div className="ws-meta min-w-0 flex-1 truncate font-kit-strong text-kit-ink-muted">{children}</div>
      {end}
    </div>
  )
}

/**
 * The scrolling part. `tabIndex` so a keyboard can scroll a pane with no
 * focusable content. `scrollKey`: when it changes the pane returns to its
 * top before paint, so opening another source does not land you halfway
 * down it at the old one's scroll position.
 */
export function PanelBody({ children, label, scrollKey }: { children: React.ReactNode; label?: string; scrollKey?: string | null }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
  }, [scrollKey])
  return (
    <div
      ref={ref}
      role={label ? "region" : undefined}
      aria-label={label}
      tabIndex={label ? 0 : undefined}
      data-ws-scroll
      // A tab stop when labelled, so it shows where focus is: the kit ring,
      // drawn inside the pane (a pane has no room around it for an offset).
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain outline-hidden ${label ? "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kit-focus" : ""}`}
    >
      {children}
    </div>
  )
}
