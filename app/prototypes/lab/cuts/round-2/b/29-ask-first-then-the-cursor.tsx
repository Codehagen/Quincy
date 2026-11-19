"use client"

/*
 * 29 — Ask first, then the cursor.
 *
 * Piece 10's gate in front of the cursor. The plan arrives as a tool that
 * needs approval (Confirmation): every line can be unticked, Go is one
 * press or Enter, and only then does the cursor start, skipping the
 * unticked lines because they ride on the approval. "Just go on this
 * project" answers the gate for you from then on. The accent is the kit's
 * green on the ticked lines.
 */

import * as React from "react"

import { Switch } from "@/components/kit"

import { PROMPTS, askFirstChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function AskFirstThenTheCursor() {
  const chat = useCutChat(() => askFirstChat(), { prompt: PROMPTS.tighten })
  const [justGo, setJustGo] = React.useState(false)
  const { messages, addToolApprovalResponse } = chat

  // With "just go" on, the gate answers itself, every line kept.
  React.useEffect(() => {
    if (!justGo) return
    for (const m of messages) {
      for (const p of m.parts) {
        if (p.type === "tool-plan_cut" && p.state === "approval-requested") {
          void addToolApprovalResponse({ id: p.approval.id, approved: true, reason: "" })
        }
      }
    }
  }, [justGo, messages, addToolApprovalResponse])

  return (
    <CutDesk
      chat={chat}
      cursor={{ look: "tag" }}
      foot={<Switch label="Just go on this project" checked={justGo} onCheckedChange={setJustGo} />}
    />
  )
}
