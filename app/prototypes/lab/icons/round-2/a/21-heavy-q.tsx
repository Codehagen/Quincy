import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 21 — Heavy Q.
 *
 * Grid Q at 3px weight instead of 2: the ring takes 13 of the 16 pixels and
 * the counter closes to 7×7, so the mark holds as a solid shape in a row of
 * coloured favicons. The counter stays empty; the
 * corner the tail leaves from is square, so the tail touches the ring.
 */
export const ROWS: Bitmap = [
  "................",
  "..###########...",
  ".#############..",
  ".#############..",
  ".###.......###..",
  ".###.......###..",
  ".###.......###..",
  ".###.......###..",
  ".###.......###..",
  ".###.......###..",
  ".###.......###..",
  ".#############..",
  ".#############..",
  "..############..",
  "..............##",
  "..............##",
]

export default function HeavyQ() {
  return <IconSheet name="Heavy Q" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
}
