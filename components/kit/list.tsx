import * as React from "react"

import { Card, type CardBaseProps, type CardLayout } from "./card"

export type ListProps = Omit<CardBaseProps, "inset"> &
  CardLayout & {
    /** ListRows and NavRows, with a ListHeading before each group if any. */
    children: React.ReactNode
  }

/**
 * The white object for rows: a Card padded by `kit-row-inset` (6px), so the
 * 12px row radius nests in the 18px object (inner = outer − padding). Takes
 * Card's `crop` and `width`; in list and detail it takes the detail's width.
 *
 * Rows stack 4px apart and with no Rule, as the landing's idea rows: each
 * row separates by its own hover shape. A margin note inside a row measures
 * from the 6px inset, not the Card's pad.
 */
export function List({ children, crop, width, ...props }: ListProps) {
  return (
    <Card {...props} {...(crop === "corner" ? { crop } : { crop, width })} inset="none">
      <div
        data-slot="kit-list"
        className="flex flex-col gap-kit-tight p-kit-row-inset [--kit-card-pad:var(--spacing-kit-row-inset)]"
      >
        {children}
      </div>
    </Card>
  )
}

export type ListHeadingProps = Omit<
  React.ComponentPropsWithRef<"h2">,
  "className" | "style" | "children"
> & {
  /** A day or a group name: "Today", "Yesterday", "Last week". Words, no count. */
  children: string
  /**
   * The heading level. `h2` (default) under the page's `h1`; `h3` when the
   * List sits under an `h2` of its own.
   */
  as?: "h2" | "h3"
}

/**
 * A small muted label over a group of rows in a List, aligned with the row
 * titles. Only when the rows span more than one group; one group needs no
 * heading. It is not a row: it does not press, and it does not count toward
 * a list's row cap.
 */
export function ListHeading({ children, as: As = "h2", ...props }: ListHeadingProps) {
  return (
    <As
      {...props}
      data-slot="kit-list-heading"
      // px-kit-row-x matches the row's own inset, so the label sits over the titles.
      // 12 above a group, 4 under it to its rows; the first sits 4 from the
      // top, because the List's inset is already above it.
      className="px-kit-row-x pt-kit-related pb-kit-tight text-kit-small font-kit-strong text-kit-ink-muted first:pt-kit-tight"
    >
      {children}
    </As>
  )
}
