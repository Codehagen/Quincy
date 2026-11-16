import type { Piece } from "../../../types"

import HeavyQ from "./21-heavy-q"
import RoundCounter from "./22-round-counter"
import CornerTail from "./23-corner-tail"
import HighlighterTail from "./24-highlighter-tail"
import OneEye from "./25-one-eye"
import SquatFriend from "./26-squat-friend"
import Glance from "./27-glance"
import Wink from "./28-wink"
import DogEar from "./29-dog-ear"
import TiltedSash from "./30-tilted-sash"

/** Icons round 2, group "a": push Grid Q (21–25), push the marked friend (26–30). */
export const pieces: Piece[] = [
  {
    n: 21,
    title: "Heavy Q",
    take: "Keeps 04's whole pixels and notches; changes the weight from 2px to 3px, so the counter closes to 7×7 and the Q reads as one solid block at 16; the tail corner is squared so the tail touches the ring.",
    Component: HeavyQ,
  },
  {
    n: 22,
    title: "Round counter",
    take: "Keeps 04's 2px pixel ring and diagonal tail; changes the square to a stepped circle, three stairs a quarter outside and two inside, a round Q drawn on graph paper.",
    Component: RoundCounter,
  },
  {
    n: 23,
    title: "Corner tail",
    take: "Keeps 04's notched ring and 2×2 steps; empties the counter and squares one corner, so the tail grows from the only corner that is not notched.",
    Component: CornerTail,
  },
  {
    n: 24,
    title: "Highlighter tail",
    take: "Keeps 04's ring exactly; draws the tail with 20's highlighter as three 3×3 yellow steps that sit on top of the ring corner, the way the sash sits on the friend.",
    Component: HighlighterTail,
  },
  {
    n: 25,
    title: "One eye",
    take: "Keeps 04 whole; adds a single 2×2 pixel high in the counter, leaning toward the tail, so the letter starts to look back: the first hint of 20 in the Q.",
    Component: OneEye,
  },
  {
    n: 26,
    title: "Squat friend",
    take: "Keeps 20's soft page, 2×3 eye holes and 3px sash with its 2px overhang; makes the page 12×11 instead of 12×14, so the friend sits rather than stands.",
    Component: SquatFriend,
  },
  {
    n: 27,
    title: "Glance",
    take: "Keeps 20 exactly except the eyes, moved two pixels right: the friend looks at the tab title beside it, a change of position that survives at 16 where a pupil would not.",
    Component: Glance,
  },
  {
    n: 28,
    title: "Wink",
    take: "Keeps 20 at 16; from 32 up the right eye closes into a 1-unit arch, a wink for the app icon and header that the favicon does not try to carry.",
    Component: Wink,
  },
  {
    n: 29,
    title: "Dog-ear",
    take: "Keeps 20's page, eyes and sash; folds the top-right corner into a 4×4 notch with the flap kept apart by a 1px gap on whole pixels, so the fold is paper colour, not a second ink.",
    Component: DogEar,
  },
  {
    n: 30,
    title: "Tilted sash",
    take: "Keeps 20's page and eyes; slants the sash three units across the page, a straight band from 32 up and three whole-pixel steps at 16, where a slant would only blur.",
    Component: TiltedSash,
  },
]
