"use client"

/*
 * 25 — The tag says the op.
 *
 * The narration rides on the cursor: its tag reads the tool part's title
 * ("Cutting the pause at 0:04") while it works, and the margin keeps only
 * the flat steps, so the eye never has to leave the lanes to know what is
 * happening. The glide is a touch slower (200 ms) so the words can be read.
 * No accent.
 */

import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function TheTagSaysTheOp() {
  const chat = useCutChat(() => tightenChat({ pace: 1.3 }), { prompt: PROMPTS.tighten })
  return <CutDesk chat={chat} cursor={{ look: "say", say: true, glide: 200 }} conversation={{ steps: "flat", hideText: true }} />
}
