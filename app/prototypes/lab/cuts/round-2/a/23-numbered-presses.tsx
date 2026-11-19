"use client"

/*
 * 23 — Numbered presses.
 *
 * A trail that stays: every press leaves a small ink number on the target
 * it changed, and the margin lists the steps flat, in the same order, so
 * "what did it do to 0:13" is answered by looking at the lane. The cursor
 * itself is a pressed dot, not an arrow. The numbers go when the run is
 * undone. No accent.
 */

import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function NumberedPresses() {
  const chat = useCutChat(() => tightenChat(), { prompt: PROMPTS.tighten })
  return <CutDesk chat={chat} cursor={{ look: "dot" }} trail conversation={{ steps: "flat" }} />
}
