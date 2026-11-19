import type { Piece } from "../../../types"
import { TheStepsAreTheReceipt } from "./26-the-steps-are-the-receipt"
import { UndoRunsItBackwards } from "./27-undo-runs-it-backwards"
import { UndoJustReverts } from "./28-undo-just-reverts"
import { AskFirstThenTheCursor } from "./29-ask-first-then-the-cursor"
import { StopKeepsWhatLanded } from "./30-stop-keeps-what-landed"

/** Round 2, group b: the cursor's run, its receipt, and taking it back. */
export const pieces: Piece[] = [
  {
    n: 26,
    title: "The steps are the receipt",
    take: "Drops the summary paragraph: the steps the cursor took stay in the margin in their tools' own prose, with the length against the take on its own line and one Undo at the checkpoint.",
    Component: TheStepsAreTheReceipt,
  },
  {
    n: 27,
    title: "Undo runs it backwards",
    take: "Shows Undo instead of just doing it: the run's parts come off newest first and the cursor walks back over the same targets at double speed, each one flashing as it is restored.",
    Component: UndoRunsItBackwards,
  },
  {
    n: 28,
    title: "Undo just reverts",
    take: "Answers 27 the other way: the run folds to one summary line, the receipt follows in prose, and Undo at the checkpoint puts the lanes back at once with no cursor at all.",
    Component: UndoJustReverts,
  },
  {
    n: 29,
    title: "Ask first, then the cursor",
    take: "Puts 10's gate in front of the cursor as an approval tool: untick lines, Go or Enter, and only then does it start, skipping what you unticked; one switch stops the asking for this project.",
    Component: AskFirstThenTheCursor,
  },
  {
    n: 30,
    title: "Stop keeps what landed",
    take: "Lets Esc or Stop halt the run at any press: the cursor parks, every landed edit stays whole, and Finish the run sends only what is left.",
    Component: StopKeepsWhatLanded,
  },
]
