import type { Piece } from "../../../types"
import { ThreeCursorsThreeLanes } from "./36-three-cursors-three-lanes"
import { ThePickInWords } from "./37-the-pick-in-words"
import { ItLooksAtItsOwnCut } from "./38-it-looks-at-its-own-cut"
import { PickOneTheOthersWait } from "./39-pick-one-the-others-wait"
import { ThreeColumns } from "./40-three-columns"

/** Round 2, group d: several cuts at once, the pick, and the self-check. */
export const pieces: Piece[] = [
  {
    n: 36,
    title: "Three cursors, three lanes",
    take: "Builds three cuts from one prompt as three subagents, each with its own spine in the lanes panel and its own tagged cursor, so all three tighten side by side.",
    Component: ThreeCursorsThreeLanes,
  },
  {
    n: 37,
    title: "The pick, in words",
    take: "Sets the three cuts over the lanes as small previews with length and hook time, and has Quincy recommend one with a reason in a sentence, never a score; Use A is the one action.",
    Component: ThePickInWords,
  },
  {
    n: 38,
    title: "It looks at its own cut",
    take: "Adds a self-check step: the cursor visits the preview, three rendered frames land in the margin with what Quincy saw, and it presses the caption to lift it off the chin.",
    Component: ItLooksAtItsOwnCut,
  },
  {
    n: 39,
    title: "Pick one, the others wait",
    take: "Homes three cuts in one switch over the preview: the picked cut fills preview and lanes with its cursor working, while the other two keep building in the margin.",
    Component: PickOneTheOthersWait,
  },
  {
    n: 40,
    title: "Three columns",
    take: "Gives the preview's place to three columns, each a small preview over its own spine and cursor, with the recommended cut's caption and effect lanes under them after the self-check.",
    Component: ThreeColumns,
  },
]
