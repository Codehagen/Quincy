"use client"

/*
 * 32 — Starters say what I read.
 *
 * 12's empty chat, made specific. Nothing plays until you press: the
 * margin shows the friend and what Quincy already read, and each starter
 * (a Suggestion: one press sends the whole request) carries its reason
 * underneath ("2 pauses and an um, 4.5 s"). Press one and the cursor makes
 * exactly that change. No accent.
 */

import { openChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"
import { ReadEmpty } from "./reading"

export function StartersSayWhatIRead() {
  const chat = useCutChat(() => openChat(), { autoplay: false })
  return <CutDesk chat={chat} cursor={{ look: "tag" }} conversation={{ empty: <ReadEmpty chat={chat} /> }} />
}
