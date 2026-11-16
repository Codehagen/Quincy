import { LockupSheet } from "../lockup"
import { PixelMark } from "../pixels"
import { ROWS } from "./31-pixel-friend"

/**
 * 38 — Pixel friend, with the name.
 *
 * 31 beside "Quincy" in Inter 560. The friend is a solid block, so it holds
 * its own beside a word of the same weight; the sash's yellow is the only
 * colour in the line.
 */
export default function PixelFriendLockup() {
  return (
    <LockupSheet
      name="Pixel friend + Quincy"
      mark={(s) => <PixelMark rows={ROWS} size={s} />}
    />
  )
}
