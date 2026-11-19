import type { Piece } from "../../../types"
import { ThreeCutsOneTake } from "./16-three-cuts-one-take"
import { HeldForYourRead } from "./17-held-for-your-read"
import { ExportHonestly } from "./18-export-honestly"
import { TheCutBecomesAPost } from "./19-the-cut-becomes-a-post"
import { DragWordsToTheCut } from "./20-drag-words-to-the-cut"

/** Round 1, group d: several cuts from one recording, and the hand-off. */
export const pieces: Piece[] = [
  {
    n: 16,
    title: "Three cuts from one take",
    take: "Lays one recording along the top and three scenes under it, one per place it goes, each with its own frame, length and first line.",
    Component: ThreeCutsOneTake,
  },
  {
    n: 17,
    title: "Held for your read",
    take: "Makes the cut wait in Quincy's words and gives the waiting cut one action, Watch it through, with Export turning ink only once you have seen the end.",
    Component: HeldForYourRead,
  },
  {
    n: 18,
    title: "Export, honestly",
    take: "Says exactly what the browser tab is doing, the real frame count, what is done and next, a measured time left and the one thing that would stop it, then names the file after the scene.",
    Component: ExportHonestly,
  },
  {
    n: 19,
    title: "The cut becomes a post",
    take: "Attaches the cut to a draft written from the same transcript in three pen-named beats, ending on the line the cut pushes in on, and holds it for its slot on Approve.",
    Component: TheCutBecomesAPost,
  },
  {
    n: 20,
    title: "Drag words to the cut",
    take: "Cuts by assembling: sentences dragged from the take into a cut column become clips in drop order, and a switch on the column says whether a drag cuts video or copies text.",
    Component: DragWordsToTheCut,
  },
]
