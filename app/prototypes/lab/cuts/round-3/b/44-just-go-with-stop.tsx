"use client"

/*
 * 44 — Just go, with Stop.
 *
 * One answer to the gate: no question at all. The pick runs at once, and
 * Stop (or Esc) is in the margin's head the whole time; stopping parks the
 * cursor and keeps every edit that landed, and "Finish the run" does only
 * the rest. The run is a touch slower so there is time to stop it. 41's
 * cursor. No accent.
 */

import { Button } from "@/components/ui/button"

import { isEdit } from "../../round-2/chat"
import { FlowDesk } from "../flow-desk"

export function JustGoWithStop() {
  return (
    <FlowDesk
      gate="go"
      pace={1.6}
      foot={(chat) => {
        const last = chat.messages.at(-1)
        if (chat.busy || !last || last.role !== "assistant") return null
        const edits = last.parts.filter(isEdit)
        const landed = edits.filter((p) => p.state === "output-available").length
        if (edits.length === 0 || landed === edits.length) return null
        return (
          <div className="cuts-shadcn flex flex-col gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm">
            <p>
              Stopped after {landed} of {edits.length}. What landed stays; nothing is half done.
            </p>
            <Button size="sm" onClick={() => chat.send("Finish the run")}>
              Finish the run
            </Button>
          </div>
        )
      }}
    />
  )
}
