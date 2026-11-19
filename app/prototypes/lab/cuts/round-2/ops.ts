/**
 * The tighten run as an op stream. Each op names the tool, the words it
 * reports, and the target id the cursor presses (`data-q` in the lanes).
 * chat.ts writes them as tool parts; `at` only orders them here, the
 * stream sets the timing.
 */

import { HOOK, TAKE, toCut } from "../round-1/fixture"

export type CutOp = {
  id: string
  tool: string
  target: string
  at: number
  /** While it works, in the margin and the tag. */
  doing: string
  /** Once it landed: the receipt line. */
  say: string
  detail: string
  removes?: string
  adds?: "captions" | "zoom" | "lift"
}

export const TIGHTEN: readonly CutOp[] = [
  { id: "p1", tool: "remove_silences", target: "p1", at: 300, doing: "Cutting the pause at 0:04", say: "Cut the pause at 0:04", detail: "2.3 s", removes: "p1" },
  { id: "p2", tool: "remove_silences", target: "p2", at: 860, doing: "Cutting the pause at 0:13", say: "Cut the pause at 0:13", detail: "1.8 s", removes: "p2" },
  { id: "um", tool: "delete_clip", target: "um", at: 1400, doing: "Cutting the “um”", say: "Cut the “um” after “So,”", detail: "0.4 s", removes: "um" },
  { id: "captions", tool: "add_captions", target: "captions", at: 2000, doing: "Adding captions", say: "Added captions, a phrase at a time", detail: `${TAKE.words} words`, adds: "captions" },
  { id: "zoom", tool: "punch_in", target: "hook", at: 2650, doing: "Pushing in on the strong line", say: "Pushed in on “They were in the way”", detail: "0:16", adds: "zoom" },
]

export type CutState = {
  removed: ReadonlySet<string>
  captions: boolean
  zoom: boolean
  lift: boolean
  seconds: number
}

/** The hook's start on the cut's clock once everything is out: 0:16.7. */
export const HOOK_CUT = toCut(HOOK.at)
