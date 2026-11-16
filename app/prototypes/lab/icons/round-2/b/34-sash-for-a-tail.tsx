import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 34 — Sash for a tail.
 *
 * Grid Q, and its tail is the friend's sash: a 3px band of yellow, as wide as the sash on 20, that
 * starts in the counter, crosses the right wall and runs off the edge. The
 * ring keeps its notches; the tail is the only straight thing leaving it.
 */
export const ROWS: Bitmap = [
  "................",
  "..##########....",
  ".############...",
  ".##........##...",
  ".##........##...",
  ".##........##...",
  ".##........##...",
  ".##........##...",
  ".##....yyyyyyyyy",
  ".##....yyyyyyyyy",
  ".##....yyyyyyyyy",
  ".############...",
  "..##########....",
  "................",
  "................",
  "................",
]

export default function SashForATail() {
  return (
    <IconSheet name="Sash for a tail" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
  )
}
