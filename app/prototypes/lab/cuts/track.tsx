"use client"

import { Lab } from "../lab"
import { ROUNDS } from "./rounds"

export function Track() {
  return <Lab rounds={ROUNDS} storageKey="quincy-lab-cuts-picks" title="Lab · Cuts" />
}
