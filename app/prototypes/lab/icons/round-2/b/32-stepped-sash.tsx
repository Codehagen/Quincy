import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 32 — Stepped sash.
 *
 * The pixel friend wearing the sash on a slant, and the slant is built the
 * way Grid Q builds its tail: whole-pixel steps, one row up every five
 * columns. It is the tilted sash of 30 with nothing left to anti-alias.
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
  "..#########yyyyy",
  "..###yyyyyyyyyyy",
  "yyyyyyyyyyyyyyyy",
  "yyyyyyyyyyy###..",
  "yyyyy#########..",
  "...##########...",
  "................",
]

export default function SteppedSash() {
  return <IconSheet name="Stepped sash" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
}
