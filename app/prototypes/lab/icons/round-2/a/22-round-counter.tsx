import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 22 — Round counter.
 *
 * The same whole pixels, stepped into a circle the way a circle is drawn on
 * graph paper: three stairs per quarter outside, two inside. The tail keeps
 * Grid Q's diagonal of 2×2 steps, one in the counter and two out of it.
 */
export const ROWS: Bitmap = [
  "................",
  "....######......",
  "..##########....",
  ".####....####...",
  ".###......###...",
  ".##........##...",
  ".##........##...",
  ".##........##...",
  ".##.....##.##...",
  ".###....#####...",
  ".####....####...",
  "..##########....",
  "....######..##..",
  "............##..",
  "..............##",
  "..............##",
]

export default function RoundCounter() {
  return (
    <IconSheet name="Round counter" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
  )
}
