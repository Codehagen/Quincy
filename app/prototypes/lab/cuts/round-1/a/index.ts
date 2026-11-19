import type { Piece } from "../../../types"
import { ChatFirst } from "./01-chat-first"
import { TimelineFirst } from "./02-timeline-first"
import { TranscriptRail } from "./03-transcript-rail"
import { OneCutOnAStage } from "./04-one-cut-on-a-stage"
import { PhoneInTheMiddle } from "./05-phone-in-the-middle"

/** Round 1, group a: the layout of the editor, chat against preview and timeline. */
export const pieces: Piece[] = [
  {
    n: 1,
    title: "Chat first, timeline in a drawer",
    take: "Makes the conversation the editor, with the preview and the run's changes inside Quincy's reply, and pushes the lanes into a drawer you pull up only to fix a frame by hand.",
    Component: ChatFirst,
  },
  {
    n: 2,
    title: "Timeline first, chat in the margin",
    take: "Keeps the editor a hand-cutter expects, large preview over full lanes, and shrinks Quincy to a margin where each run is three lines of prose beside the work.",
    Component: TimelineFirst,
  },
  {
    n: 3,
    title: "The transcript is the timeline",
    take: "Drops the lanes for a talking head: a scrub bar with the joins on it, and a right rail that switches between Chat and Transcript, where dragged words get Delete and Zoom.",
    Component: TranscriptRail,
  },
  {
    n: 4,
    title: "The cut on a grey stage",
    take: "Puts the landing's one white object on the grey recess and makes that object the cut: preview, what changed, the length against the take and Export, with the lanes one click behind.",
    Component: OneCutOnAStage,
  },
  {
    n: 5,
    title: "The phone in the middle",
    take: "Shows the 9:16 at the size it will be watched, in a phone, and puts a row of scenes over the timeline so every cut of one recording is one press away.",
    Component: PhoneInTheMiddle,
  },
]
