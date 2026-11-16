import type { Piece } from "../../types"

import AgainstYourMedian from "./11-against-your-median"
import WhoKeepsShowingUp from "./12-who-keeps-showing-up"
import OneIdeaThreeHooks from "./13-one-idea-three-hooks"
import TheWeeksRhythm from "./14-the-weeks-rhythm"
import TwelveRiffsWaiting from "./15-twelve-riffs-waiting"

/** Round-1 "c": feature tiles and bento grids. Order is display order. */
export const pieces: Piece[] = [
  {
    n: 11,
    title: "Against your median",
    take: "Two tiles: a bar history cropped by the tile edge beside the one dark stat tile; hover a bar and the ratio ticks to that post against your own median.",
    Component: AgainstYourMedian,
  },
  {
    n: 12,
    title: "Who keeps showing up",
    take: "A 2×2 with a tall right tile: faces running off the edge, a typographic tally with a pen note, and the one live object, her reply and your Approve.",
    Component: WhoKeepsShowingUp,
  },
  {
    n: 13,
    title: "One idea, three hooks",
    take: "One big feature tile with the composition's only window sinking off the bottom; switching channel redraws a highlighter across that channel's first line.",
    Component: OneIdeaThreeHooks,
  },
  {
    n: 14,
    title: "The week's rhythm",
    take: "Tall left tile of day rows whose chips run off the right edge, a copy-only claim tile, and a small ritual tile whose live dot and bar are the only colour.",
    Component: TheWeeksRhythm,
  },
  {
    n: 15,
    title: "Twelve riffs waiting",
    take: "A waveform band over a dark count and a card stack; passing on today's riff slides it away and the count drops, so the two tiles read as one machine.",
    Component: TwelveRiffsWaiting,
  },
]
