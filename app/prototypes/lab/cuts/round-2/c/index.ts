import type { Piece } from "../../../types"
import { TheScanReadsTheTake } from "./31-the-scan-reads-the-take"
import { StartersSayWhatIRead } from "./32-starters-say-what-i-read"
import { TheSampleOpensFree } from "./33-the-sample-opens-free"
import { TheReadingEndsInAPlan } from "./34-the-reading-ends-in-a-plan"
import { TwoPointers } from "./35-two-pointers"

/** Round 2, group c: the first run, from a drop or the sample to the cursor's first cut. */
export const pieces: Piece[] = [
  {
    n: 31,
    title: "The scan reads the take",
    take: "Streams the drop's reading as one tool with three passes (words, picture, delivery) while a line sweeps the lanes, ending in what Quincy noticed and starters built from it.",
    Component: TheScanReadsTheTake,
  },
  {
    n: 32,
    title: "Starters say what I read",
    take: "Makes 12's empty chat specific: nothing plays until you press, and each starter carries the reason Quincy read for it, so one press sends a whole request the cursor then makes.",
    Component: StartersSayWhatIRead,
  },
  {
    n: 33,
    title: "The sample opens free",
    take: "Puts 14's drop and sample in the preview's place, and opening the sample replays its cut from history with the cursor, saying plainly that no model ran and nothing was spent.",
    Component: TheSampleOpensFree,
  },
  {
    n: 34,
    title: "The reading ends in a plan",
    take: "Turns the reading straight into a first-cut plan behind an approval, its lines the findings as edits, so the first run asks once and the cursor starts on Go.",
    Component: TheReadingEndsInAPlan,
  },
  {
    n: 35,
    title: "Two pointers, one is yours",
    take: "Draws your pointer as the plain white arrow resting on the starter it pressed and Quincy's as the named ink arrow doing the work, so it is plain the cursor never takes yours.",
    Component: TwoPointers,
  },
]
