"use client"

/*
 * 48 — Three cuts in the desk, 16's way.
 *
 * The other home for the same run: the desk keeps one large preview (the
 * recommended cut) and the lanes panel holds three spines, one per cut,
 * each with its own cursor, the same self-check inside each run and the
 * same pick in words. 47 against 48 decides the layout. No accent.
 */

import { VARIANT_STARTERS } from "../flow"
import { FlowDesk } from "../flow-desk"

export function ThreeSpinesFlow() {
  return <FlowDesk starters={VARIANT_STARTERS} layout="stack" />
}
