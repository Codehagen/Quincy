import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 23 — Corner tail.
 *
 * Three corners keep Grid Q's one-pixel notch; the fourth is square, and the
 * tail grows from it in two 2×2 steps. The counter stays empty, so the only
 * thing that makes it a Q is the one corner that is different.
 */
export const ROWS: Bitmap = [
  "................",
  "..#########.....",
  ".###########....",
  ".##.......##....",
  ".##.......##....",
  ".##.......##....",
  ".##.......##....",
  ".##.......##....",
  ".##.......##....",
  ".##.......##....",
  ".###########....",
  "..##########....",
  "............##..",
  "............##..",
  "..............##",
  "..............##",
]

export default function CornerTail() {
  return <IconSheet name="Corner tail" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
}
