// Every sound the desk makes, on the film's clock (ms). Landings sound at contact, presses at the press,
// appearances at their start; camera moves, fades and drifts make none. Scenes never play audio: the mix reads these.
import * as C from "./chat-times"
import { beatCues, type Beat } from "./cursor-run"
import { CLOSE, PRESSES, mainBeats } from "./main-run"
import { expoContact, springContact } from "./motion"
import type { Cue } from "./storyboard"
import { CAPTIONS } from "./take"
import { CUTS, SPINES_AT } from "./three-run"
import { AT, CAPTIONS_AT, DROP_AT, RUN_AT, SEND_AT, TYPE_TIMES } from "./timeline"

const ROW = springContact({ duration: 520, bounce: 0.28 })
const NO_RECT = { x0: 0, x1: 0, top: 0, height: 0 }

export const DESK_CUES: Cue[] = [
  // The take drops onto the lane: heard when the clip reaches its full length.
  { at: DROP_AT + expoContact(520), sound: "land", pan: -0.1 },
  { at: C.READ_AT, sound: "tick", pan: 0.5 },
  { at: C.READ_DONE, sound: "tick", pan: 0.5 },
  // The person types (a key per letter; the mix thins the run), presses Enter, the message rises.
  ...TYPE_TIMES.map((at, i) => ({ at, sound: "key", pan: 0.45 + (i % 3) * 0.02 })),
  { at: SEND_AT, sound: "enter", pan: 0.5 },
  { at: C.BUBBLE_AT, sound: "send", pan: 0.5 },
  { at: RUN_AT, sound: "tick", pan: 0.5 },
  // Quincy's run: glide, drag, ⌫ (times only; geometry is irrelevant to the mix), and each gap snapping shut.
  ...beatCues(mainBeats({ x0: 0, x1: 600, top: 0, height: 60 }), -0.1),
  ...PRESSES.map((pressAt, i) => ({ at: pressAt + CLOSE * 0.8, sound: "snap", pan: -0.1 + i * 0.1 })),
  // The run's steps fold into one line, and the line reads as the receipt.
  { at: C.FOLD_AT, sound: "fold", pan: 0.5 },
  { at: C.FOLD_AT + 120, sound: "receipt", pan: 0.5 },
  // Captions landing on their lane (pop each; the mix thins the run), the row in the margin.
  ...CAPTIONS.map((_, i) => ({ at: CAPTIONS_AT + i * 110, sound: "pop", pan: -0.3 + i * 0.06 })),
  { at: C.CAPTIONED_AT, sound: "tick", pan: 0.5 },
  // Quincy looks at its own frames: a shutter per frame, the receipt when it has seen them.
  ...[0, 1, 2].map((i) => ({ at: C.FRAME_AT(i), sound: "shutter", pan: 0.4 + i * 0.05 })),
  { at: C.LOOKED_AT, sound: "receipt", pan: 0.5 },
  // Three cuts: the spines land, three cursors each on its own side of the stereo image.
  { at: C.ASK3_AT, sound: "tick", pan: 0.5 },
  ...CUTS.map((_, i) => ({ at: SPINES_AT + i * 80 + ROW, sound: "land", pan: -0.1 })),
  ...CUTS.flatMap((c, i) => {
    const pan = [-0.5, 0, 0.5][i]!
    const beats: Beat[] = c.beats.map((b) => ({ ...b, rect: NO_RECT, tap: b.work.kind === "tap", toolbar: b.work.kind === "zoom" ? { x: 0, y: 0 } : undefined }))
    const snaps = c.beats.filter((b) => b.work.kind === "cut").map((b) => ({ at: b.pressAt + CLOSE * 0.8, sound: "snap", pan }))
    return [...beatCues(beats, pan), ...snaps]
  }),
  { at: C.CUTS_DONE_AT, sound: "fold", pan: 0.5 },
  // The recommendation streams in (a key every third letter), then "Recommended" lands on cut A.
  ...C.SAY_TIMES.filter((_, i) => i % 3 === 0).map((at) => ({ at, sound: "key", pan: 0.5 })),
  { at: C.RECOMMEND_AT, sound: "stamp", pan: -0.1 },
  // The turn to the end card: a swell that stops dead as the lockup lands.
  { at: AT.end - 400, sound: "swell" },
]
