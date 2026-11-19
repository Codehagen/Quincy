"use client"

/*
 * 46 — Ask when it matters (the recommendation to test).
 *
 * The third answer: ask once per project, then again only when a run would
 * remove spoken words or touch more than 30% of the take; otherwise go,
 * with Stop always there. Each ask says why. Try it in order: "Tighten the
 * edit" asks (first run here), "Add captions" goes straight through, "Make
 * it under 20 s" asks again (three spoken lines, about half the take).
 * 41's cursor. No accent.
 */

import { SMART_STARTERS } from "../flow"
import { FlowDesk } from "../flow-desk"

export function AskWhenItMatters() {
  return <FlowDesk gate="smart" starters={SMART_STARTERS} />
}
