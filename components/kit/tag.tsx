import * as React from "react"

/**
 * A word Quincy filed something under: "Story", "Short post". One value per
 * Tag; two values are two Tags, never "Story · Short post" in one. After the
 * landing's "Next" chips (ReadsAndPosts): no fill, the inset ring, muted
 * small text at 460, 8px radius (`rounded-kit-control-inner`), 24px tall.
 *
 * Not pressable, not a filter (that is Segmented), not a status: running is
 * LiveDot, done is Checklist. Muted on the object is 5.28:1, on the well 4.71:1.
 */
export type TagLook = "chip" | "text"

const LOOK: Record<TagLook, string> = {
  chip: "h-6 rounded-kit-control-inner px-2 text-kit-small shadow-kit-inset",
  // A fact in a named column (DataList "Shape"): muted meta text, no ring.
  // A ring on twenty rows is twenty objects louder than the titles.
  text: "text-kit-meta",
}

export function Tag({
  children,
  look = "chip",
}: {
  children: string
  /**
   * `chip` (default): the ringed chip, on a card or a detail. `text`: muted
   * 12px text with no ring, the look in a DataList column and in a dense
   * row's meta line (docs/design/workspace.md).
   */
  look?: TagLook
}) {
  return (
    <span
      data-slot="kit-tag"
      data-look={look}
      className={`inline-flex max-w-full min-w-0 items-center whitespace-nowrap text-kit-ink-muted ${LOOK[look]}`}
    >
      {/* A long word ends in an ellipsis inside the chip instead of
          running out of it. */}
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Tags side by side, wrapping, 6px apart. Put every Tag of an item in one. */
export function Tags({ children }: { children: React.ReactNode }) {
  return (
    <span
      data-slot="kit-tags"
      className="flex flex-wrap items-center gap-kit-controls"
    >
      {children}
    </span>
  )
}
