"use client"

/*
 * 21 — The name tag.
 *
 * Quincy's cursor is a second arrow with an ink tag that says Quincy, so it
 * can never be mistaken for your own pointer. It glides to each target as
 * the tool part arrives, presses with a ring as the part lands, and the
 * target flashes ink at that instant. The margin's Task counts the steps
 * and folds to one line when the run ends. No accent.
 */

import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function NameTag() {
  const chat = useCutChat(() => tightenChat(), { prompt: PROMPTS.tighten })
  return <CutDesk chat={chat} cursor={{ look: "tag" }} tone="ink" />
}
