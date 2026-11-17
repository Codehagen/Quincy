import * as React from "react"

/**
 * A workspace page's chrome (docs/design/workspace.md): one row of
 * controls at the shell bar's height, or the filter row under it.
 *
 * Not `role="toolbar"`: a toolbar holds a search field and menus, and the
 * toolbar pattern's arrow-key roving would fight the field's caret. It is a
 * labelled group, and Tab order is the reading order.
 */

export type ToolbarSize = "bar" | "filter"

const SIZE: Record<ToolbarSize, string> = {
  // 52, the shell bar: 32px controls with 10 above and below.
  bar: "min-h-kit-bar py-2.5",
  // 44: 28px chips with 8 above and below.
  filter: "min-h-kit-filter-bar py-2",
}

export type ToolbarProps = {
  children: React.ReactNode
  /** The group's name for assistive tech ("Ideas", "Filters"). */
  label: string
  /** `bar` 52 (default: the page row); `filter` 44 (the row of FilterMenus). */
  size?: ToolbarSize
  /**
   * A hairline under the row (default). Off for the first row of a pair:
   * the page row and its filter row read as one band, one hairline under both.
   */
  divided?: boolean
}

/**
 * One row, 20px in from the workspace's edge (`kit-group`, the one left
 * edge every region shares), 12 between groups, wrapping to a second line
 * on a narrow page rather than scrolling sideways.
 */
export function Toolbar({ children, label, size = "bar", divided = true }: ToolbarProps) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="kit-toolbar"
      data-size={size}
      className={`@container/kit-toolbar flex shrink-0 flex-wrap items-center gap-x-kit-related gap-y-kit-controls px-kit-group ${SIZE[size]} ${divided ? "border-b border-kit-hairline" : ""}`}
    >
      {children}
    </div>
  )
}

export type ToolbarGroupProps = {
  children: React.ReactNode
  /** Push the group to the row's end. */
  end?: boolean
  /**
   * On a toolbar under 40rem the group takes the whole row it wraps to (a
   * search beside its button), and from 40rem sizes to its content.
   */
  grow?: boolean
}

/** Controls that belong together, 6px apart (`kit-controls`). */
export function ToolbarGroup({ children, end = false, grow = false }: ToolbarGroupProps) {
  return (
    <div
      data-slot="kit-toolbar-group"
      className={`flex min-w-0 items-center gap-kit-controls ${end ? "ms-auto" : ""} ${grow ? "w-full @kit-toolbar-wrap/kit-toolbar:w-auto" : ""}`}
    >
      {children}
    </div>
  )
}

/** A 16px hairline between two groups that sit side by side. Decorative. */
export function ToolbarDivider() {
  return <span aria-hidden data-slot="kit-toolbar-divider" className="mx-0.5 h-4 w-px shrink-0 bg-kit-hairline" />
}

export type ToolbarTitleProps = {
  children: React.ReactNode
  /** `h1` (default): on a workspace page the toolbar's name is the page's one h1. */
  as?: "h1" | "h2"
}

/**
 * The page's name in the toolbar, 15/600 (`text-kit-heading`), in place of
 * KitPage's 28px title: on a working surface the first row of work sits
 * under the toolbar, not under a headline.
 */
export function ToolbarTitle({ children, as: Tag = "h1" }: ToolbarTitleProps) {
  return (
    <Tag data-slot="kit-toolbar-title" className="shrink-0 text-kit-heading text-kit-ink">
      {children}
    </Tag>
  )
}

export type ToolbarSummaryProps = React.ComponentProps<"p">

/**
 * The page's state as one muted meta sentence beside `ToolbarTitle`
 * ("3 waiting on you, the oldest from Tuesday."). One line, truncated, and
 * shown only from a 40rem workspace: on a narrow one the rows say it.
 *
 * The sentence is the caller's (`Count` inside it as needed). It does not
 * announce: a change that matters is announced by the caller with
 * `useAnnounce`.
 */
export function ToolbarSummary({ children, className, ...props }: ToolbarSummaryProps) {
  return (
    <p
      data-slot="kit-toolbar-summary"
      {...props}
      className={`hidden truncate text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block ${className ?? ""}`}
    >
      {children}
    </p>
  )
}
