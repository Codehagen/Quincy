"use client"

/*
 * 47 — Three cuts as three columns.
 *
 * 40's layout in the whole flow. After the reading, "Three cuts" starts
 * three subagents at once; the preview's place becomes three columns, each
 * a small preview over its own spine with its own cursor. Each cut's run
 * ends in its own self-check (it looks at 3 frames, and A moves its
 * caption off the chin), then Quincy's pick with the reason in words. The
 * picked column takes the well grey. No accent.
 */

import { VARIANT_STARTERS } from "../flow"
import { FlowDesk } from "../flow-desk"

export function ThreeColumnsFlow() {
  return <FlowDesk starters={VARIANT_STARTERS} layout="columns" />
}
