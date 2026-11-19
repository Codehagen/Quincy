import type { Piece } from "../../../types"
import { QuestionsWhileItUploads } from "./11-questions-while-it-uploads"
import { ThreeStarters } from "./12-three-starters"
import { CopyThisPacing } from "./13-copy-this-pacing"
import { TheSampleOpensFree } from "./14-the-sample-opens-free"
import { EachAnswerIsAnEdit } from "./15-each-answer-is-an-edit"

/** Round 1, group c: the first run, from a dropped take to a first cut. */
export const pieces: Piece[] = [
  {
    n: 11,
    title: "Questions while it uploads",
    take: "Spends the upload minute on the three things a first cut needs, asked one card at a time under an honest progress count, with every question skippable.",
    Component: QuestionsWhileItUploads,
  },
  {
    n: 12,
    title: "Three starters",
    take: "Opens the empty chat on what Quincy already read in the take (length, words, the two pauses) and three starters that are whole requests, gone once you have spoken.",
    Component: ThreeStarters,
  },
  {
    n: 13,
    title: "Copy this pacing",
    take: "Turns a pasted short into its rhythm alone, drawn above your take's with both hooks marked, so 'make mine like that' becomes three named changes and never a copied look.",
    Component: CopyThisPacing,
  },
  {
    n: 14,
    title: "The sample opens free",
    take: "Puts one object on the grey stage, the drop with the sample under it, and says plainly that the sample's cut is already made, so opening it shows the whole editor without spending.",
    Component: TheSampleOpensFree,
  },
  {
    n: 15,
    title: "Each answer is an edit",
    take: "Shows every first-run answer beside the edit it becomes, and changes the phone as each one lands, so the questions read as the cut being made rather than a form before it.",
    Component: EachAnswerIsAnEdit,
  },
]
