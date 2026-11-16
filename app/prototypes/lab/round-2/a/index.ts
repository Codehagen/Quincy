import type { Piece } from "../../types"

import TheDraft from "./21-the-draft"
import ThreeWaysIn from "./22-three-ways-in"
import TheReply from "./23-the-reply"
import ARuleArrives from "./24-a-rule-arrives"
import YourLine from "./25-your-line"

/** Round 2, group "a": writing, the surfaces where words are made. Order is display order. */
export const pieces: Piece[] = [
  {
    n: 21,
    title: "The draft",
    take: "02's blue-pen beats on a real Studio draft, the number against your own median, and Approve that swaps itself for the slot it goes into, with Undo.",
    Component: TheDraft,
  },
  {
    n: 22,
    title: "Three ways in",
    take: "13's one-idea-three-hooks as a riff card: each angle tab moves 01's highlighter and its margin note to the sentence that angle stands on.",
    Component: ThreeWaysIn,
  },
  {
    n: 23,
    title: "The reply",
    take: "Quincy's chat answer set as a marked-up page, not a bubble (your question is the only bubble); Draft it sends your turn and the thread scrolls to the reply.",
    Component: TheReply,
  },
  {
    n: 24,
    title: "A rule arrives",
    take: "05's brain page made a decision: Quincy asks before it writes a rule down, and Keep slides the rule in with its receipt and the edit it came from.",
    Component: ARuleArrives,
  },
  {
    n: 25,
    title: "Your line",
    take: "The first line of a draft is really editable; when you commit a change, the margin says in words what Quincy learned, with no diff and no strikethrough.",
    Component: YourLine,
  },
]
