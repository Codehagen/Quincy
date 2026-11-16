import type { Piece } from "../../../types"

import PenTail from "./01-pen-tail"
import Said from "./02-said"
import Swiped from "./03-swiped"
import GridQ from "./04-grid-q"
import OneStroke from "./05-one-stroke"

/** Icons round 1, group "a": letterform, a Q drawn for this product. */
export const pieces: Piece[] = [
  {
    n: 1,
    title: "Pen tail",
    take: "An ink ring whose tail is the blue pen, Quincy's one added stroke; at 16 the tail drops its nib taper and stays a 2px line, so the ring and the blue both survive.",
    Component: PenTail,
  },
  {
    n: 2,
    title: "Said",
    take: "A Q as a speech bubble with two lines of text knocked out: what you said, set as words; one solid shape, so it reads at 16 where an outline bubble becomes a ring.",
    Component: Said,
  },
  {
    n: 3,
    title: "Swiped",
    take: "A Q with the highlighter dragged across its lower half; the yellow band is 5px tall at 16, wide enough to read as colour, and the overlap stays ink on dark.",
    Component: Swiped,
  },
  {
    n: 4,
    title: "Grid Q",
    take: "A Q built from whole pixels for the tab first: 2px square ring, notched corners, a stepped tail; nothing is anti-aliased at 16, so it is the crispest mark in the round.",
    Component: GridQ,
  },
  {
    n: 5,
    title: "One stroke",
    take: "The Q as one handwritten line that leaves the loop open and runs out as the tail; a signature, not a font, and one 2px stroke is all that has to hold at 16.",
    Component: OneStroke,
  },
]
