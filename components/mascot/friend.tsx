"use client"

import { PixelFriend, type PixelFriendProps } from "./pixel-friend"
import { SmoothFriend } from "./smooth-friend"

/** Below this box size the friend is drawn on the 16 grid; at or above, as vectors. */
export const SMOOTH_FROM = 32

export type FriendProps = PixelFriendProps & {
  /**
   * Force one drawing. Leave it out: the size picks. Pixel is the 16px form
   * (favicon, sidebar), smooth is the same character for 32px and up.
   */
  render?: "pixel" | "smooth"
}

/**
 * The one way to put Quincy's character on a page. Call sites use this, never
 * PixelFriend or SmoothFriend directly, so the drawing follows the size: under
 * 32px the pixel friend, from 32px the smooth one. Both share the state names
 * and the beats, so a state says the same thing at every size.
 */
export function Friend({ render, ...props }: FriendProps) {
  const size = props.size ?? 32
  const mode = render ?? (size < SMOOTH_FROM ? "pixel" : "smooth")
  return mode === "pixel" ? <PixelFriend {...props} /> : <SmoothFriend {...props} />
}
