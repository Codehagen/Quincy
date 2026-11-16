import { LockupSheet } from "../lockup"
import { PixelMark } from "../pixels"
import { ROWS } from "./37-yellow-face"

/**
 * 40 — Yellow face, with the name.
 *
 * 37 beside "Quincy": the yellow is held inside the ring, so the accent
 * never touches the word, and the line stays ink with one lit square.
 */
export default function YellowFaceLockup() {
  return (
    <LockupSheet
      name="Yellow face + Quincy"
      mark={(s) => <PixelMark rows={ROWS} size={s} />}
    />
  )
}
