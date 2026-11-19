"use client"

/*
 * 24 — The highlighter at speed.
 *
 * The fastest of the five: the transport streams at 12 ms, each tool
 * sleeps 150 ms, the glide is 130 ms, so the whole tighten run reads in
 * about two seconds. Every target flashes the highlighter's yellow as the
 * press lands, the way a fast editor's marker moves down a page. The
 * accent is the yellow; the cursor stays ink.
 */

import { PROMPTS, tightenChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function HighlighterAtSpeed() {
  const chat = useCutChat(() => tightenChat({ pace: 0.7 }), { prompt: PROMPTS.tighten, delayMs: 12 })
  return <CutDesk chat={chat} cursor={{ look: "tag", glide: 130 }} tone="highlight" />
}
