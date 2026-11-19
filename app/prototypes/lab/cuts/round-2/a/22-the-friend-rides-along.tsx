"use client"

/*
 * 22 — The friend rides along.
 *
 * The tag is the friend instead of a name: the pixel friend in a white
 * disc beside the arrow, writing while the run works and at rest once it
 * parks. The press is a soft ink bloom rather than a ring, and the target
 * takes the well grey, the kit's own "picked", so the cut reads as
 * handled, not alarmed. No accent.
 */

import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function TheFriendRidesAlong() {
  const chat = useCutChat(() => tightenChat(), { prompt: PROMPTS.tighten })
  return <CutDesk chat={chat} cursor={{ look: "friend", ring: "soft" }} tone="well" />
}
