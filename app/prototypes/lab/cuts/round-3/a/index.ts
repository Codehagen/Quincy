import type { Piece } from "../../../types"
import { NameTagFlow } from "./41-name-tag"
import { FriendFlow } from "./42-the-friend-rides-along"
import { HighlighterFlow } from "./43-highlighter-at-speed"

/** Round 3, group a: the whole first run, one script, three cursors. */
export const pieces: Piece[] = [
  {
    n: 41,
    title: "The name tag, the whole flow",
    take: "Runs 21's tagged ink cursor through the whole first run, sample to checkpoint, with the margin in real shadcn scoped to the kit.",
    Component: NameTagFlow,
  },
  {
    n: 42,
    title: "The friend rides along, the whole flow",
    take: "Same script as 41 with 22's cursor: the pixel friend at work beside the arrow, a soft press, the well grey on each target.",
    Component: FriendFlow,
  },
  {
    n: 43,
    title: "The highlighter at speed, the whole flow",
    take: "Same script as 41 at 24's pace, every target flashing yellow as the press lands, so the run reads as fast as a marker down a page.",
    Component: HighlighterFlow,
  },
]
