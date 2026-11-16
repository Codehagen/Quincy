import type { Piece } from "../../../types"

import TheSameHills from "./21-the-same-hills"
import FromThePocket from "./22-from-the-pocket"
import DeskAndPocket from "./23-desk-and-pocket"
import TheReceipt from "./24-the-receipt"
import TheMargin from "./25-the-margin"

/** Round 2, group "a": the light family, grown from 05 (window on a wallpaper) and 09 (the pen outside the phone). */
export const pieces: Piece[] = [
  {
    n: 21,
    title: "The same hills",
    take: "05's grey wallpaper made the page's backdrop: every product picture stands on a crop of one long landscape that starts further along it each time, so scrolling is walking one horizon, and the page ends where the hills do.",
    Component: TheSameHills,
  },
  {
    n: 22,
    title: "From the pocket",
    take: "09's phone rising out of the hero, made the whole page: one phone in the hero, three in a row for how it works, one carrying the number, and every time Quincy's blue pen stays on the page outside the glass. Narrow, centred and airy, like reading on the phone it shows.",
    Component: FromThePocket,
  },
  {
    n: 23,
    title: "Desk and pocket",
    take: "Both kept pictures in one frame: 05's window on the hills holds the pull request you merged, and 09's phone straddles its edge with the draft it became and Approve; the densest of the five, with how it works as five small cropped tiles and the middle of the page given to one sentence Quincy wrote.",
    Component: DeskAndPocket,
  },
  {
    n: 24,
    title: "The receipt",
    take: "The work receipt both kept heroes end on, made the page's spine: a rule runs down the left and each checked line opens into a section with its picture on a plain grey stage, until Approve, the one empty circle Quincy cannot tick, and a faint unticked line for what is not built yet.",
    Component: TheReceipt,
  },
  {
    n: 25,
    title: "The margin",
    take: "The kept pieces' editor marks, given the page: a wide left margin runs from the hero to the footer with one handwritten note per section, beside close-ups of the product at 1.4x so the pen is as large as the words; the fewest and biggest pictures, the phone once for the number, the hills once under the last line.",
    Component: TheMargin,
  },
]
