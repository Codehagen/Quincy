import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 25 — One eye.
 *
 * Grid Q with one 2×2 pixel set high in the counter, a little toward the
 * tail: a letter that is starting to look back at you. The inner tail step
 * stays, so the eye and the tail are the only two marks in the counter.
 */
export const ROWS: Bitmap = [
  "................",
  "..##########....",
  ".############...",
  ".##........##...",
  ".##........##...",
  ".##....##..##...",
  ".##....##..##...",
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

export default function OneEye() {
  return <IconSheet name="One eye" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
}
