import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 24 — Highlighter tail.
 *
 * Grid Q's ring in ink, and the tail drawn with the highlighter: three 3×3
 * yellow steps from the middle of the counter out past the corner. Where the
 * tail crosses the ring the yellow is on top, the way the sash sits on 20.
 */
export const ROWS: Bitmap = [
  "................",
  "..##########....",
  ".############...",
  ".##........##...",
  ".##........##...",
  ".##........##...",
  ".##........##...",
  ".##....yyy.##...",
  ".##....yyy.##...",
  ".##....yyy.##...",
  ".##.......yyy...",
  ".#########yyy...",
  "..########yyy...",
  ".............yyy",
  ".............yyy",
  ".............yyy",
]

export default function HighlighterTail() {
  return (
    <IconSheet name="Highlighter tail" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
  )
}
