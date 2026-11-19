"use client"

/*
 * 26 — The steps are the receipt.
 *
 * No summary paragraph: the steps the cursor took stay in the margin as
 * they were written, each in the prose its tool reported, and under them
 * the length against the take on its own line. The checkpoint closes the
 * run; Undo returns to it in one press. No accent.
 */

import { Text } from "@/components/kit"

import { TAKE, fmt } from "../../round-1/fixture"
import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function TheStepsAreTheReceipt() {
  const chat = useCutChat(() => tightenChat(), { prompt: PROMPTS.tighten })
  const finished = !chat.busy && chat.landed.length > 0
  return (
    <CutDesk
      chat={chat}
      cursor={{ look: "tag" }}
      conversation={{ steps: "flat", hideText: true }}
      foot={
        finished ? (
          <div className="border-t border-kit-hairline pt-2">
            <Text variant="small" tone="muted">
              Length
            </Text>
            <Text variant="figure">
              {fmt(TAKE.seconds)} → {fmt(chat.cut.seconds)}
            </Text>
          </div>
        ) : null
      }
    />
  )
}
