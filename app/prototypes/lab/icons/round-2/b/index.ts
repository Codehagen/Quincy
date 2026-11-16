import type { Piece } from "../../../types"

import PixelFriend from "./31-pixel-friend"
import SteppedSash from "./32-stepped-sash"
import QShapedFriend from "./33-q-shaped-friend"
import SashForATail from "./34-sash-for-a-tail"
import EyesInTheCounter from "./35-eyes-in-the-counter"
import HollowFriend from "./36-hollow-friend"
import YellowFace from "./37-yellow-face"
import PixelFriendLockup from "./38-pixel-friend-lockup"
import EyesInTheCounterLockup from "./39-eyes-in-the-counter-lockup"
import YellowFaceLockup from "./40-yellow-face-lockup"

/** Icons round 2, group "b": Grid Q and the marked friend crossed (31–37), and three with the name (38–40). */
export const pieces: Piece[] = [
  {
    n: 31,
    title: "Pixel friend",
    take: "Keeps 20's figure, eyes and full-width sash; draws it in 04's whole pixels with one-pixel notched corners, so no curve is left to blur at 16.",
    Component: PixelFriend,
  },
  {
    n: 32,
    title: "Stepped sash",
    take: "Keeps 31's pixel friend; wears the sash on a slant built like 04's tail, one row up every five columns, the tilt of 30 with nothing to anti-alias.",
    Component: SteppedSash,
  },
  {
    n: 33,
    title: "Q-shaped friend",
    take: "Makes the friend the Q: a solid pixel bowl with the face where the counter would be, and 20's sash runs off the right edge and down in 04's steps as the tail.",
    Component: QShapedFriend,
  },
  {
    n: 34,
    title: "Sash for a tail",
    take: "Keeps 04's ring; replaces the stepped tail with 20's sash, a 3px yellow band that starts in the counter, crosses the right wall and runs off the edge.",
    Component: SashForATail,
  },
  {
    n: 35,
    title: "Eyes in the counter",
    take: "The monogram: 04 exactly, with 20's two eyes set in the counter as 2×3 ink pixels; a reader sees a Q, then sees it looking back. Ink only.",
    Component: EyesInTheCounter,
  },
  {
    n: 36,
    title: "Hollow friend",
    take: "Draws 20's friend with 04's 2px notched ring instead of a solid page: ink eyes inside, the sash across past both sides; lighter than 31 in a row of tabs.",
    Component: HollowFriend,
  },
  {
    n: 37,
    title: "Yellow face",
    take: "Keeps 04's ring and tail; fills the counter with 20's highlighter and sets two ink eyes on it, ink on both grounds, so the face is yellow with dark eyes in light and dark.",
    Component: YellowFace,
  },
  {
    n: 38,
    title: "Pixel friend + Quincy",
    take: "31 set beside \"Quincy\" in Inter 560 at 32/28 and 16/14, on light, dark and in a sidebar header; a solid block holds its own beside a word of the same weight.",
    Component: PixelFriendLockup,
  },
  {
    n: 39,
    title: "Eyes in the counter + Quincy",
    take: "35 beside \"Quincy\" at the same two sizes: a pixel initial followed by its set word, ink only, the one lockup with no accent at all.",
    Component: EyesInTheCounterLockup,
  },
  {
    n: 40,
    title: "Yellow face + Quincy",
    take: "37 beside \"Quincy\": the yellow is held inside the ring, so the accent never touches the word and the line is ink with one lit square.",
    Component: YellowFaceLockup,
  },
]
