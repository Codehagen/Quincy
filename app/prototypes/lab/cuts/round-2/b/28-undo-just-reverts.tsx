"use client"

/*
 * 28 — Undo just reverts.
 *
 * The other answer to 27: the run folds to one summary line, the receipt
 * follows in prose, and the checkpoint's Undo returns the conversation and
 * the lanes to before the run at once, with no cursor. The cursor is for
 * Quincy's work; taking it back is yours, and instant. No accent.
 */

import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function UndoJustReverts() {
  const chat = useCutChat(() => tightenChat(), { prompt: PROMPTS.tighten })
  return <CutDesk chat={chat} cursor={{ look: "tag" }} conversation={{ undo: "revert" }} />
}
