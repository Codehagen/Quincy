import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 33 — Q-shaped friend.
 *
 * The friend is the Q: a solid 12×12 bowl with the face where the counter
 * would be, and the sash runs across it, off the right edge and down in
 * Grid Q's steps, so the end of the highlighter is the tail.
 */
export const ROWS: Bitmap = [
  "................",
  "..##########....",
  ".############...",
  ".###..##..###...",
  ".###..##..###...",
  ".###..##..###...",
  ".############...",
  ".############...",
  "yyyyyyyyyyyyy...",
  "yyyyyyyyyyyyy...",
  "yyyyyyyyyyyyy...",
  ".##########yyy..",
  "..#########yyy..",
  "...........yyy..",
  "..............yy",
  "..............yy",
]

export default function QShapedFriend() {
  return (
    <IconSheet name="Q-shaped friend" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
  )
}
