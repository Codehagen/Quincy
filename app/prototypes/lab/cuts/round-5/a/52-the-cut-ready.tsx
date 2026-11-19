"use client"

/*
 * 52 — The cut, ready.
 *
 * The decisions in one piece. 49's choreography with its ink name tag, and
 * the owner's gate: Quincy edits without asking unless the change is very
 * big. "Tighten the edit" and "Add captions" go straight through; "Make it
 * under 20 s" asks, with the receipt in advance, and says why (it removes
 * whole spoken sentences and 40% of the take). Stop and Esc always; each
 * run is one undo. Then the receipt in words, the one checkpoint, and next
 * steps right under it. The tune panel (top right) is harness chrome for
 * the owner to set the timing; it writes a ref and CSS variables and never
 * re-renders the desk.
 */

import * as React from "react"

import { DEFAULT_TUNE, type Tune } from "../../round-4/director"
import { FlowDesk4 } from "../../round-4/desk"
import { SMART_STARTERS } from "../../round-3/flow"
import { TunePanel } from "../tune"

export function TheCutReady() {
  const tune = React.useRef<Tune>(DEFAULT_TUNE)
  const wrapper = React.useRef<HTMLDivElement>(null)
  return (
    <div ref={wrapper} className="absolute inset-0" data-qc4-tone="ink" data-qc4-ring="on">
      <FlowDesk4 gate="smart" starters={SMART_STARTERS} pace={1.3} tune={tune} />
      <TunePanel tuneRef={tune} wrapperRef={wrapper} />
    </div>
  )
}
