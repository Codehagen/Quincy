"use client"

/*
 * 30 — Stop keeps what landed.
 *
 * The run can be stopped at any press: Esc, or Stop in the margin's head.
 * The stream aborts, the cursor parks where it was, and every edit that
 * already landed stays (each was its own complete op). The margin says how
 * far it got, and "Finish the run" sends the rest, which skips what is
 * already in the cut. The run is a touch slower here, so there is time to
 * stop it. No accent.
 */

import { Button, Text } from "@/components/kit"

import { TIGHTEN } from "../ops"
import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function StopKeepsWhatLanded() {
  const chat = useCutChat(() => tightenChat({ pace: 1.8 }), { prompt: PROMPTS.tighten })
  const edits = chat.landed.length
  const ended = chat.messages.some((m) => m.parts.some((p) => p.type === "data-checkpoint"))
  const stopped = !chat.busy && chat.messages.length > 0 && !ended && edits < TIGHTEN.length
  return (
    <CutDesk
      chat={chat}
      cursor={{ look: "tag", label: "Quincy · Esc stops" }}
      foot={
        stopped ? (
          <div className="flex flex-col gap-2 rounded-kit-control bg-kit-well px-3 py-2.5">
            <Text variant="small">
              Stopped after {edits} of {TIGHTEN.length}. What landed stays; nothing is half done.
            </Text>
            <Button size="sm" variant="action" onClick={() => chat.send("Finish the run")}>
              Finish the run
            </Button>
          </div>
        ) : null
      }
    />
  )
}
