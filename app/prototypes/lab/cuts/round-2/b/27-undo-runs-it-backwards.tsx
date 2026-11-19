"use client"

/*
 * 27 — Undo runs it backwards.
 *
 * Undo is shown, not just done: the run's parts come off newest first, and
 * the cursor walks back over the same targets at twice the speed, each one
 * flashing as it is restored (the zoom, the captions, the "um", the two
 * pauses), then parks. Redo puts the run back in one press. No accent.
 */

import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function UndoRunsItBackwards() {
  const chat = useCutChat(() => tightenChat(), { prompt: PROMPTS.tighten })
  return <CutDesk chat={chat} cursor={{ look: "tag", glide: 120 }} conversation={{ undo: "rewind" }} />
}
