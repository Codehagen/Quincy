import type { Piece } from "../../../types"
import { OpsLandWhileItTalks } from "./06-ops-land-while-it-talks"
import { ReceiptInProse } from "./07-receipt-in-prose"
import { MarksOnTheTranscript } from "./08-marks-on-the-transcript"
import { OneRunOneUndo } from "./09-one-run-one-undo"
import { AsksFirstOnce } from "./10-asks-first-once"

/** Round 1, group b: the run in progress and its receipt. */
export const pieces: Piece[] = [
  {
    n: 6,
    title: "The timeline moves while it talks",
    take: "Makes every tool call two things at once, a line in the chat and an edit on the lanes, with the lanes held read-only under the reason while the run works.",
    Component: OpsLandWhileItTalks,
  },
  {
    n: 7,
    title: "The receipt in prose",
    take: "Ends a run the way a person reports back, one checked line per change with where and how much, the length against the take on its own line, and one Undo for the lot.",
    Component: ReceiptInProse,
  },
  {
    n: 8,
    title: "Marks on the transcript",
    take: "Writes the receipt onto the words instead: cuts folded to grey chips that say how long, never struck, one highlight on the strong line and one margin note saying it is the hook.",
    Component: MarksOnTheTranscript,
  },
  {
    n: 9,
    title: "One run, one undo",
    take: "Puts a run in the history as one revision chip beside your hand edits, so Undo on it takes all five changes back at once and Redo returns them.",
    Component: OneRunOneUndo,
  },
  {
    n: 10,
    title: "Asks first, once",
    take: "Defaults to asking, but makes the question the receipt in advance, with lines to untick, Go on Enter, and one switch that stops the asking for this project.",
    Component: AsksFirstOnce,
  },
]
