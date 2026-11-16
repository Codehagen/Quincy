import { IconSheet } from "../../sheet"
import { type Bitmap, PixelMark } from "../pixels"

/**
 * 37 — Yellow face.
 *
 * Grid Q with its counter highlighted: the yellow fills the inside, and two
 * ink eyes sit on it. The eyes are ink on both grounds, so on dark the face
 * is still yellow with dark eyes. Ink and one accent, two tones, one shape.
 */
export const ROWS: Bitmap = [
  "................",
  "..##########....",
  ".############...",
  ".##yyyyyyyy##...",
  ".##ykkyykky##...",
  ".##ykkyykky##...",
  ".##ykkyykky##...",
  ".##yyyyyyyy##...",
  ".##yyyyyyyy##...",
  ".##yyyyyyyy##...",
  ".##yyyyyyyy##...",
  ".############...",
  "..##########....",
  ".............##.",
  ".............##.",
  "................",
]

export default function YellowFace() {
  return <IconSheet name="Yellow face" mark={(s) => <PixelMark rows={ROWS} size={s} />} />
}
