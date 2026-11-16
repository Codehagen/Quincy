import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 35 — Eyes in the counter.
 *
 * The monogram: Grid Q exactly, with the friend's two eyes set inside the
 * counter as 2×3 ink pixels. The letter and the character are one mark; a
 * reader sees a Q, and then sees that it is looking back.
 */
export const ROWS: Bitmap = [
  "................",
  "..##########....",
  ".############...",
  ".##........##...",
  ".##.##..##.##...",
  ".##.##..##.##...",
  ".##.##..##.##...",
  ".##........##...",
  ".##........##...",
  ".##......####...",
  ".##......####...",
  ".############...",
  "..##########....",
  ".............##.",
  ".............##.",
  "................",
]

export default function EyesInTheCounter() {
  return (
    <IconSheet name="Eyes in the counter" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
  )
}
