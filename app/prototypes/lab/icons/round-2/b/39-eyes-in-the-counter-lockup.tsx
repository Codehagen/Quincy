import { LockupSheet } from "../lockup"
import { PixelMark } from "../pixels"
import { ROWS } from "./35-eyes-in-the-counter"

/**
 * 39 — Eyes in the counter, with the name.
 *
 * 35 beside "Quincy": the mark is a Q and the word starts with one, so the
 * lockup reads as a pixel initial followed by its set word. Ink only.
 */
export default function EyesInTheCounterLockup() {
  return (
    <LockupSheet
      name="Eyes in the counter + Quincy"
      mark={(s) => <PixelMark rows={ROWS} size={s} />}
    />
  )
}
