"use client"

import * as React from "react"

/**
 * The lab's undecided numbers and choices (control-panel.tsx), read by the
 * layouts as props and by the open draft through a context.
 */
export type LabOptions = {
  /** What a row is called by: the post's first line, or the idea it is about. */
  title: "opening" | "idea"
  /** Table's open-draft pane: clamp(min, share of the workspace, max). */
  detailMin: number
  detailShare: number
  detailMax: number
  /** On a draft `readBeats` cannot bracket: the proposed note, or nothing. */
  marks: "note" | "plain"
  /** Desk's reading size. */
  deskType: 14 | 15 | 16
}

export const DEFAULT_OPTIONS: LabOptions = {
  title: "opening",
  detailMin: 440,
  detailShare: 46,
  detailMax: 720,
  marks: "note",
  deskType: 15,
}

export const LabOptionsContext = React.createContext<LabOptions>(DEFAULT_OPTIONS)
