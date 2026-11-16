import type { Piece } from "../../../types"
import { OneSentence } from "./11-one-sentence"
import { Never } from "./12-never"
import { FirstLine } from "./13-first-line"
import { ThreeBeats } from "./14-three-beats"
import { Column } from "./15-column"

/** Group c: the argument first. docs/vision.md's bet leads; the product is the proof. */
export const pieces: Piece[] = [
  {
    n: 11,
    title: "One sentence",
    take: "Takes a reference's centred tight hero on a dark ground and its work-receipt chat, and makes them Quincy's: the bet as the headline, its 9.4 million receipt as the subline, and a dark app window where Quincy's checked list ends in \"nothing sent\", drafts held for your read.",
    Component: OneSentence,
  },
  {
    n: 12,
    title: "What Quincy will never do",
    take: "Takes a reference's centred two-beat headline and its quiet list of one-liners, and fills them with Quincy's promise and its five refusals (one settled by the 70,000 against 6.3 million receipt), with the one blue spent on Approve.",
    Component: Never,
  },
  {
    n: 13,
    title: "6.3M",
    take: "Pushes the number to display size with the three 70K versions drawn to true scale as hairlines, highlights the cause instead of the number, and proves it with one idea whose first line Quincy wrote three ways.",
    Component: FirstLine,
  },
  {
    n: 14,
    title: "The argument as a post",
    take: "Takes the kit's beat brackets to display size and tells the receipt in did, happened, meant (labelled \"he\", since it is his story), then shows the same marks on a draft at product size.",
    Component: ThreeBeats,
  },
  {
    n: 15,
    title: "A column",
    take: "Takes Stageshow's quiet register into an essay column in Literata (a screen reading serif, for an argument someone signed), with the receipt inside the prose, Quincy's graphite note in the margin, and the product as three short columns after.",
    Component: Column,
  },
]
