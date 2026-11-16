import type { Piece } from "../../types"

import RiffsRecorder from "./31-riffs-recorder"
import PasteALink from "./32-paste-a-link"
import ShippedWork from "./33-shipped-work"
import TheCall from "./34-the-call"
import ThreeQuestions from "./35-three-questions"

/** Round-2 "c": capture, raw material going in. */
export const pieces: Piece[] = [
  {
    n: 31,
    title: "Riffs, recorder first",
    take: "Kept 17's record pill and its caused motion, and put it at the top of the real /ideas queue: stopping a take slides the new riff in at the head and counts the waiting number up.",
    Component: RiffsRecorder,
  },
  {
    n: 32,
    title: "Paste a link",
    take: "Kept 01's highlighter and margin note, and moved them onto a real paste field: Enter, the button or a paste reads the note, and Quincy marks the line you never posted.",
    Component: PasteALink,
  },
  {
    n: 33,
    title: "Shipped work becomes a riff",
    take: "Kept 02's three beats in the blue pen with the number on its own line, and sourced them from a merged PR shown as itself, with Draft it as the one accent action.",
    Component: ShippedWork,
  },
  {
    n: 34,
    title: "The call, one line",
    take: "Kept the margin note as Quincy's voice, and added a call strip with three marks you move between by click or arrow key, where the note says whose words the line is.",
    Component: TheCall,
  },
  {
    n: 35,
    title: "Three questions",
    take: "Kept the one white window and Approve's blue, and made the first-run interview a real form: one question at a time, Cmd/Ctrl+Enter, Skip, and answers stacking above as you go.",
    Component: ThreeQuestions,
  },
]
