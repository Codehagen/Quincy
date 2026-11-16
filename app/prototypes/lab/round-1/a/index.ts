import type { Piece } from "../../types"

import RiffAnnotated from "./01-riff-annotated"
import ThreeBeats from "./02-three-beats"
import WhyThisAngle from "./03-why-this-angle"
import YourEdit from "./04-your-edit"
import BrainPage from "./05-brain-page"

/** Round 1, group "a": reading and annotation. Order is display order. */
export const pieces: Piece[] = [
  {
    n: 1,
    title: "Riff, annotated",
    take: "A voice-note transcript read like a marked-up page: one yellow highlighter sweep on the sentence that is the riff, a handwritten bracket saying why.",
    Component: RiffAnnotated,
  },
  {
    n: 2,
    title: "Three beats in the margin",
    take: "An editor's blue-pen brackets name did / happened / meant beside a draft; pointing at one beat quiets the other two.",
    Component: ThreeBeats,
  },
  {
    n: 3,
    title: "Why this angle",
    take: "The one dark stat tile, pushed to carry reasoning: 2.1× your own median, with a margin note insisting it is yours, not followers.",
    Component: WhyThisAngle,
  },
  {
    n: 4,
    title: "Your edit, as a diff",
    take: "Your edit against Quincy's draft read as a diff, with the margin note recording what it learned; \"Yours\" folds the struck lines away.",
    Component: YourEdit,
  },
  {
    n: 5,
    title: "The brain is a page",
    take: "The brain as a readable document where every line carries its receipt, and the newly learned rule slides in with a note on where it came from.",
    Component: BrainPage,
  },
]
