"use client"

/*
 * 34 — The reading ends in a plan.
 *
 * The first run without a blank question. Quincy reads the take, then
 * proposes the first cut from what it read as an approval tool: the lines
 * are the findings turned into edits, untick any, Go or Enter. Only then
 * does the cursor make the first cut. The accent is the kit's green on the
 * ticked lines.
 */

import { PROMPTS, firstRunPlanChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"
import { ReadingLanes } from "./reading"

export function TheReadingEndsInAPlan() {
  const chat = useCutChat(() => firstRunPlanChat(), { prompt: PROMPTS.upload })
  return <CutDesk chat={chat} cursor={{ look: "tag" }} lanes={<ReadingLanes chat={chat} />} />
}
