"use client"

/*
 * 43 — The highlighter at speed, the whole flow.
 *
 * The same script as 41 with 24's pace: a 130 ms glide, the stream at
 * 12 ms, each tool about 150 ms, every target flashing the highlighter's
 * yellow as the press lands. The accent is the yellow.
 */

import { FlowDesk } from "../flow-desk"

export function HighlighterFlow() {
  return <FlowDesk look="tag" tone="highlight" glide={130} pace={0.7} delayMs={12} />
}
