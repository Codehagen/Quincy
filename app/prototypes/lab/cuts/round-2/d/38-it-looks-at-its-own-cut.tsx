"use client"

/*
 * 38 — It looks at its own cut.
 *
 * After the edits, a self-check step: the cursor goes to the preview,
 * Quincy renders three frames of its own cut and shows them in the margin
 * with what it saw ("the caption covers the chin at 0:04"), then the
 * cursor presses the caption and lifts it clear. The check is a tool like
 * any other, so it is in the same Task and the same undo. No accent.
 */

import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function ItLooksAtItsOwnCut() {
  const chat = useCutChat(() => tightenChat({ check: true }), { prompt: PROMPTS.tighten })
  return <CutDesk chat={chat} cursor={{ look: "tag" }} conversation={{ steps: "flat" }} />
}
