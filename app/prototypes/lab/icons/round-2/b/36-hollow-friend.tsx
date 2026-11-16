import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 36 — Hollow friend.
 *
 * The friend drawn with Grid Q's ring instead of a solid page: a 2px
 * notched outline, ink eyes inside it, and the sash across, past both sides.
 * Lighter than 31 in a tab, and the ring is the letter's own stroke.
 */
export const ROWS: Bitmap = [
  "................",
  "...##########...",
  "..############..",
  "..##........##..",
  "..##........##..",
  "..##.##..##.##..",
  "..##.##..##.##..",
  "..##.##..##.##..",
  "..##........##..",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "..##........##..",
  "..############..",
  "...##########...",
  "................",
]

export default function HollowFriend() {
  return <IconSheet name="Hollow friend" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
}
