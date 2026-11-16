import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 31 — Pixel friend.
 *
 * The marked friend redrawn on Grid Q's terms: the soft corners become one
 * notched pixel, the eyes are 2×3 holes, the sash is three rows of yellow
 * that run to both edges. Same figure, no curve left to blur at 16.
 */
export const ROWS: Bitmap = [
  "................",
  "...##########...",
  "..############..",
  "..############..",
  "..###..##..###..",
  "..###..##..###..",
  "..###..##..###..",
  "..############..",
  "..############..",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "..############..",
  "..############..",
  "...##########...",
  "................",
]

export default function PixelFriend() {
  return <IconSheet name="Pixel friend" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
}
