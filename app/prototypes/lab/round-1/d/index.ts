import type { Piece } from "../../types"

import Approve from "./16-approve"
import Record from "./17-record"
import Channels from "./18-channels"
import Slots from "./19-slots"
import Live from "./20-live"

/** Round-1 "d": single components you can touch, on a quiet grey stage. */
export const pieces: Piece[] = [
  {
    n: 16,
    title: "Approve",
    take: "Took the stage register's one confident blue button and built the real queue around it: the press gives, the label turns to Approved, and the waiting count ticks from 3 to 2 because you just cleared one.",
    Component: Approve,
  },
  {
    n: 17,
    title: "Record a thought",
    take: "A record pill where every motion has a cause: the glyph morphs circle to square, bars arrive only while you talk, the clock runs, and stopping is what slides the riff in underneath.",
    Component: Record,
  },
  {
    n: 18,
    title: "One idea, per channel",
    take: "A segmented control whose thumb slides and whose first line is re-cut, not reflowed, with a length meter against each channel's fold as the reason the three cuts differ.",
    Component: Channels,
  },
  {
    n: 19,
    title: "Pick a slot",
    take: "The week as a slot grid with one movable chip; tapping a free slot slides it there and re-counts your own median at that hour, never followers.",
    Component: Slots,
  },
  {
    n: 20,
    title: "Ritual, running",
    take: "The accent reserved for live, as a dot in a pill with a running clock; steps land one by one and the dot goes grey when the ritual ends, so live reads as a state, not decoration.",
    Component: Live,
  },
]
