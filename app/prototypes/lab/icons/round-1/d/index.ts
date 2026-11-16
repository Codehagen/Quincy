import type { Piece } from "../../../types"

import ApprovedStamp from "./16-approved-stamp"
import ThreeBeats from "./17-three-beats"
import TheOpenSlot from "./18-the-open-slot"
import BubbleWithAPen from "./19-bubble-with-a-pen"
import TheMarkedFriend from "./20-the-marked-friend"

/** Icons round 1, group "d": abstract and stamp (16–18), and two characters (19–20). */
export const pieces: Piece[] = [
  {
    n: 16,
    title: "Approved stamp",
    take: "A blue rubber stamp with a check, tilted and double-ruled from 32 up: you looked and said yes; at 16 it stands straight with one 2px frame, because a tilted frame there is only blur.",
    Component: ApprovedStamp,
  },
  {
    n: 17,
    title: "Three beats",
    take: "Did, happened, meant: three shortening bars with the meaning in blue, the shape of every post; 3px bars on 2px gaps keep three distinct strokes at 16.",
    Component: ThreeBeats,
  },
  {
    n: 18,
    title: "The open slot",
    take: "Nine slots of the week with the one Quincy is filling in blue; 4px cells, 2px gutters and half-pixel 1px rings make it the most grid-exact mark here at 16.",
    Component: TheOpenSlot,
  },
  {
    n: 19,
    title: "Bubble with a pen",
    take: "A character: a speech bubble with two punched-out eyes whose tail is a blue pen nib, so the figure is the voice, the edit and a Q at once; 2x3 eye holes keep the face at 16.",
    Component: BubbleWithAPen,
  },
  {
    n: 20,
    title: "The marked friend",
    take: "A character: a soft-cornered page with two eyes, wearing the highlighter as a sash that runs past both sides; the eyes and the yellow overhang are what reads at 16.",
    Component: TheMarkedFriend,
  },
]
