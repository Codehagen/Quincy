"use client"

/*
 * 31 — The scan reads the take.
 *
 * The drop starts a reading stage, streamed as one tool with three
 * preliminary outputs: transcribing, reading the picture, reading the
 * delivery. A thin ink line sweeps the lanes while it reads. It ends in
 * what Quincy noticed, in three lines, and the starters under it carry
 * those findings. Picking one starts the cursor's first cut. No accent.
 */

import { PROMPTS, firstRunChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"
import { ReadingLanes, Starters, isReading } from "./reading"

export function TheScanReadsTheTake() {
  const chat = useCutChat(() => firstRunChat(), { prompt: PROMPTS.upload })
  const ready = !chat.busy && !isReading(chat) && chat.messages.length > 0 && chat.landed.length === 0
  return (
    <CutDesk
      chat={chat}
      cursor={{ look: "tag" }}
      lanes={<ReadingLanes chat={chat} />}
      foot={ready ? <Starters chat={chat} /> : null}
    />
  )
}
