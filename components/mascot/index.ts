/**
 * Quincy's mascot: Pixel friend under 32px, Smooth friend from 32px — docs/design/mascot.md.
 * The engine is framework-free; the component and lockup render it.
 */
export {
  type Bitmap,
  type Frame,
  type MascotState,
  type StateDef,
  MARK,
  STATES,
  STATE_NAMES,
  duration,
  locate,
  sample,
  toSvg,
} from "./engine"
export { PixelFriend, type PixelFriendProps } from "./pixel-friend"
export { QuincyMark, type QuincyMarkProps } from "./lockup"
export { SmoothFriend, type SmoothFriendProps } from "./smooth-friend"
export { Friend, type FriendProps, SMOOTH_FROM } from "./friend"
export { sampleSmooth, stillPose, type SmoothPose } from "./smooth"
