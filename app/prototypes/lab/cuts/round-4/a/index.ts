import type { Piece } from "../../../types"
import { TheCursorOperates } from "./49-the-cursor-operates"
import { AtSpeed } from "./50-at-speed"
import { ThreeCursors } from "./51-three-cursors"

/** Round 4: motion. Three pieces on one choreography. */
export const pieces: Piece[] = [
  {
    n: 49,
    title: "The cursor operates the desk",
    take: "Rebuilds 41 so the cursor works the desk like a person, compressed: drag-select and ⌫ for each pause, a real pressed Captions button and its wave, select-then-Zoom, every change landing with its press.",
    Component: TheCursorOperates,
  },
  {
    n: 50,
    title: "The same, at speed",
    take: "Runs 49's choreography faster (×0.95 against 49's ×1.3), the tighten in about two seconds, each hit in the highlighter's yellow.",
    Component: AtSpeed,
  },
  {
    n: 51,
    title: "Three cuts, three cursors",
    take: "Rebuilds 48 with a cursor per cut that never moves in lockstep, the recommended cut's leading and the other two in support, each cut ending in its own self-check.",
    Component: ThreeCursors,
  },
]
