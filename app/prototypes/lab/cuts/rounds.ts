import type { Round } from "../types"
import { pieces as a5 } from "./round-5/a"
import { pieces as a4 } from "./round-4/a"
import { pieces as a3 } from "./round-3/a"
import { pieces as b3 } from "./round-3/b"
import { pieces as c3 } from "./round-3/c"
import { pieces as a2 } from "./round-2/a"
import { pieces as b2 } from "./round-2/b"
import { pieces as c2 } from "./round-2/c"
import { pieces as d2 } from "./round-2/d"
import { pieces as a } from "./round-1/a"
import { pieces as b } from "./round-1/b"
import { pieces as c } from "./round-1/c"
import { pieces as d } from "./round-1/d"

export const ROUNDS: Round[] = [
  {
    id: "cuts-5",
    title: "Cuts, round 5 — ready",
    note: "The owner: do what was recommended for motion, and make it ready. Decided: 49's ink name tag (50's yellow as an optional tone), the owner's gate (edit without asking unless the change is very big: a run that removes whole spoken sentences or more than 30% of the take asks, saying why; Stop and Esc always), 48/51's layout for several cuts. 52 is the whole first run with a tune panel for the timing (top right); 53 is three cuts. Both carry the audit's fixes. Press Open, then a starter. Brief: app/prototypes/lab/cuts/round-5/BRIEF.md.",
    pieces: [...a5].sort((x, y) => x.n - y.n),
  },
  {
    id: "cuts-4",
    title: "Cuts, round 4 — motion",
    note: "Made from 41, 43 and 48 (and the earlier keeps). The owner: the cursor makes it look like Quincy is really doing the edit. So it operates the desk: drag-select and ⌫ for a pause, a real pressed button, select then Zoom; each gesture is one tool part, and every change lands with its press. The gate is 30's: just go, with Stop and Esc. Press Open, then a starter; Replay returns to the start. Brief with the timeline: app/prototypes/lab/cuts/round-4/BRIEF.md.",
    pieces: [...a4].sort((x, y) => x.n - y.n),
  },
  {
    id: "cuts-3",
    title: "Cuts, round 3 — narrow",
    note: "Made from 02, 06, 07, 09, 10, 12, 14, 16, 21, 22, 24, 30, 31, 32, 38, 40 (and 29 in question). Each piece is the whole first run in 02's desk: open the sample free, the reading, starters that say what Quincy read, the pick, the cursor's run, the receipt, one checkpoint. Press Open, then a starter; Replay returns to the start. The chat margin is real shadcn, scoped to the kit. 41–43 the cursor; 44–46 three answers to the gate; 47–48 three cuts, two layouts. Brief: app/prototypes/lab/cuts/round-3/BRIEF.md.",
    pieces: [...a3, ...b3, ...c3].sort((x, y) => x.n - y.n),
  },
  {
    id: "cuts-2",
    title: "Cuts, round 2 — the cursor",
    note: "Made from 02, 06, 07, 09, 10, 12, 14 and 16: 02's desk (large preview, full lanes, a chat margin) under every piece, and Quincy's work visible and reversible as one unit. New: Quincy's own cursor, which reads the chat's tool parts and presses where each op lands. The margin is shadcn's AI Elements anatomy on the kit, driven by a scripted useChat transport (no model, no network). Groups: the cursor's look and motion (21–25); run, receipt and undo (26–30); the first run (31–35); several cuts, the pick and the self-check (36–40). Each piece plays once when first seen; Replay is in the margin. Brief: app/prototypes/lab/cuts/round-2/BRIEF.md.",
    pieces: [...a2, ...b2, ...c2, ...d2].sort((x, y) => x.n - y.n),
  },
  {
    id: "cuts-1",
    title: "Cuts, round 1 — wide",
    note: "The video editor from zero, on the kit, all cutting one 37-second founder take (seven onboarding screens to two; two pauses, one “um”, one line worth a push-in; a 9:16 for X and LinkedIn). Four directions: the layout of chat, preview and timeline (01–05); the run in progress and its receipt (06–10); the first run, from a dropped take to a first cut (11–15); several cuts from one recording, and the hand-off (16–20). Brief: app/prototypes/lab/cuts/round-1/BRIEF.md.",
    pieces: [...a, ...b, ...c, ...d].sort((x, y) => x.n - y.n),
  },
]
