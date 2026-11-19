import type { Piece } from "../../../types"
import { NameTag } from "./21-name-tag"
import { TheFriendRidesAlong } from "./22-the-friend-rides-along"
import { NumberedPresses } from "./23-numbered-presses"
import { HighlighterAtSpeed } from "./24-highlighter-at-speed"
import { TheTagSaysTheOp } from "./25-the-tag-says-the-op"

/** Round 2, group a: Quincy's cursor in the 02 layout, five ways. */
export const pieces: Piece[] = [
  {
    n: 21,
    title: "The name tag",
    take: "Gives Quincy a second arrow with an ink tag that says its name, gliding to each tool part's target, pressing with a ring as it lands, the target flashing ink.",
    Component: NameTag,
  },
  {
    n: 22,
    title: "The friend rides along",
    take: "Swaps the name for the pixel friend at work beside the arrow, a soft bloom for the press and the well grey on the target, so the cut reads as handled, not alarmed.",
    Component: TheFriendRidesAlong,
  },
  {
    n: 23,
    title: "Numbered presses",
    take: "Leaves a small ink number on every target the cursor changed, matched to flat numbered steps in the margin, so the lane itself answers what happened where.",
    Component: NumberedPresses,
  },
  {
    n: 24,
    title: "The highlighter at speed",
    take: "Runs the whole tighten in about two seconds with a 130 ms glide, each target flashing the highlighter's yellow, so it reads like a fast editor's marker going down a page.",
    Component: HighlighterAtSpeed,
  },
  {
    n: 25,
    title: "The tag says the op",
    take: "Puts the narration on the cursor, its tag reading the tool part's title while it works, so the eye never leaves the lanes; the margin keeps only the steps.",
    Component: TheTagSaysTheOp,
  },
]
