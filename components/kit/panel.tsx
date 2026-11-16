"use client"

import * as React from "react"

/**
 * A pane of a workspace (docs/design/workspace.md): a region of one surface,
 * not an object on it. Panes sit side by side on the ground, split by a 1px
 * hairline (a border, because it separates; a shadow would say "raised").
 * Each pane owns its scroll, so the toolbar and the other panes stay put
 * while one scrolls.
 *
 * ```tsx
 * <div className="flex min-h-0 flex-1">
 *   <Panel label="Ideas"><PanelBody><DataList …/></PanelBody></Panel>
 *   <Panel label="Open idea" width="clamp(440px, 36cqi, 560px)" edge="start">
 *     <PanelBody label="Where the idea came from" scrollKey={openId}>
 *       <PanelHeader>…</PanelHeader>…
 *     </PanelBody>
 *   </Panel>
 * </div>
 * ```
 */
export type PanelProps = {
  children: React.ReactNode
  /** The region's name ("Ideas", "Open idea"). Every pane is a landmark. */
  label: string
  /**
   * A CSS width for a fixed pane (`clamp(440px, 36cqi, 560px)`). Without
   * one the pane takes what is left.
   */
  width?: string
  /** `start`: the hairline on the start edge (every pane after the first). */
  edge?: "start" | "none"
}

export function Panel({ children, label, width, edge = "none" }: PanelProps) {
  return (
    <section
      aria-label={label}
      data-slot="kit-panel"
      style={width ? { width, flex: "none" } : undefined}
      // isolation: the sticky head band and strip (z 1) rank only inside
      // their own pane, so they can never climb over a menu, a tooltip or
      // the foot.
      className={`isolate flex min-h-0 min-w-0 flex-col ${width ? "" : "flex-1"} ${edge === "start" ? "border-s border-kit-hairline" : ""}`}
    >
      {children}
    </section>
  )
}

export type PanelHeaderProps = {
  children: React.ReactNode
  /** At the strip's end: a count, a time, one small control. */
  end?: React.ReactNode
}

/**
 * The pane's 32px strip (`kit-head`) with a hairline under it: the same
 * band as DataList's column heads, so one line runs across every pane.
 * Sticky, so inside a PanelBody it stays while the pane scrolls. Muted meta
 * text, on the content edge (20).
 */
export function PanelHeader({ children, end }: PanelHeaderProps) {
  return (
    <div
      data-slot="kit-panel-header"
      className="sticky top-0 z-[1] flex h-kit-head shrink-0 items-center gap-kit-related border-b border-kit-hairline bg-kit-ground px-kit-group"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-kit-meta text-kit-ink-muted">{children}</div>
      {end != null ? <div className="flex shrink-0 items-center gap-kit-controls text-kit-meta text-kit-ink-muted tabular-nums">{end}</div> : null}
    </div>
  )
}

export type PanelBodyProps = {
  children: React.ReactNode
  /**
   * Name it when it holds no focusable content of its own (a reading pane):
   * it becomes a labelled region and a tab stop, so a keyboard can scroll
   * it, with the kit's focus ring drawn inside the pane. Leave it off when
   * its content takes focus itself (a DataList).
   */
  label?: string
  /**
   * When it changes, the pane goes back to its top before paint, so opening
   * another item does not land you halfway down it at the last one's
   * scroll position.
   */
  scrollKey?: string | number | null
}

/** The scrolling part of a pane. */
export function PanelBody({ children, label, scrollKey }: PanelBodyProps) {
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
      data-slot="kit-panel-body"
      // A pane has no room around it for an offset ring: drawn inside.
      className={`min-h-0 flex-1 overflow-y-auto overscroll-contain outline-hidden ${label ? "focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kit-focus" : ""}`}
    >
      {children}
    </div>
  )
}
