"use client"

import { Lab } from "./lab"
import { ROUNDS } from "./rounds"

/** The visual-style track. Rounds hold components, so they load client-side. */
export function VisualTrack() {
  return <Lab rounds={ROUNDS} storageKey="quincy-lab-picks" title="Lab" />
}
