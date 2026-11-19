"use client"

/*
 * 45 — Ask every time.
 *
 * The second answer: every run starts as the receipt written in advance
 * (shadcn's Confirmation, a needsApproval tool). Untick a line to leave it
 * alone, Go or Enter, and only then does the cursor start, skipping what
 * was unticked. 41's cursor. The accent is none: the boxes are ink.
 */

import { FlowDesk } from "../flow-desk"

export function AskEveryTime() {
  return <FlowDesk gate="ask" />
}
