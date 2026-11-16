import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

export type GlyphTileProps = {
  /**
   * What the tile shows, in order of preference: a `mark` (a brand's own
   * glyph, drawn by the caller at 16px), else an `icon` (a hugeicon, for a
   * kind of material: voice, email), else the first letter of `label`.
   */
  mark?: React.ReactNode
  icon?: IconSvgElement
  /** The name of what the row is. Only its first letter is ever drawn. */
  label: string
  /**
   * Drops the tile to an inset ring with a muted glyph, for a thing that
   * cannot be picked up yet (a source or channel nothing can connect).
   */
  quiet?: boolean
}

/**
 * The 36px tile at the start of a row that names a place material comes
 * from or writing goes to (/sources, /channels): the control radius, the
 * control ring, the glyph in ink. After the landing's reads-and-posts
 * glyph. The two pages are one idea (material in, writing out), so their
 * rows start with one object.
 *
 * Monochrome always: a brand colour per row turns the list into a wall of
 * logos. Decorative (aria-hidden): the row's name says what it is.
 */
export function GlyphTile({ mark, icon, label, quiet = false }: GlyphTileProps) {
  return (
    <span
      aria-hidden
      data-slot="kit-glyph-tile"
      data-quiet={quiet || undefined}
      className={`grid size-9 flex-none place-items-center rounded-kit-control ${
        quiet ? "text-kit-ink-muted shadow-kit-inset" : "bg-kit-object text-kit-ink shadow-kit-control"
      }`}
    >
      {mark != null ? (
        mark
      ) : icon ? (
        <HugeiconsIcon icon={icon} size={17} strokeWidth={1.8} />
      ) : (
        <span className="text-kit-small font-kit-strong">{label.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  )
}
