import type { Piece } from "../../types"

import HeardAnAngle from "./06-heard-an-angle"
import ApproveIntoTheWeek from "./07-approve-into-the-week"
import FillTheOpenSlot from "./08-fill-the-open-slot"
import AgainstYourMedian from "./09-against-your-median"
import OneIdeaThreeHooks from "./10-one-idea-three-hooks"

/**
 * Group b — hero demos with a window and a cursor. Each is one Quincy screen
 * shown as a product: a window cropped by the stage edge, a cursor that moves
 * to a target and acts, and one motion that the act causes. Every piece also
 * takes the real press, drag or hover, and rests on its finished state under
 * reduced motion. Order is display order.
 */
export const pieces: Piece[] = [
  {
    n: 6,
    title: "Heard, then an angle",
    take: "The stage-demo window with the cursor pressing Find the angle: the waveform plays through, the transcript lands, and a highlighter stroke (the only accent) marks the line that becomes the angle.",
    Component: HeardAnAngle,
  },
  {
    n: 7,
    title: "Approve, into the week",
    take: "One confident blue Approve in a split window: the cursor presses it, then follows the post into Wednesday's open slot, so you can see the press cause the move.",
    Component: ApproveIntoTheWeek,
  },
  {
    n: 8,
    title: "Fill the open slot",
    take: "The lineup as a cropped browser window: the cursor drags a ready riff onto the empty Thursday, the slot starts drafting with a vermilion dot, and a note in the margin says why that hour. You can drag it yourself.",
    Component: FillTheOpenSlot,
  },
  {
    n: 9,
    title: "Against your own median",
    take: "A plain list of posts that opens on hover: the views count up, the bar fills to your median in grey and only the part past it is violet, and a margin note says what the number is not.",
    Component: AgainstYourMedian,
  },
  {
    n: 10,
    title: "One idea, three hooks",
    take: "A riff pane and an empty column: Adapt draws teal threads out to an X, a LinkedIn and a Shorts first line, staggered so the comparison builds in front of you.",
    Component: OneIdeaThreeHooks,
  },
]
