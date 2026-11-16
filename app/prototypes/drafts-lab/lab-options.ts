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
  /* ── Round 2: the post is the thing on the right ── */
  /** Round 2 panes take what the list leaves: the list keeps this much. */
  listKeep: number
  /** The post at its feed width, before the pane narrows it (X ~598, LinkedIn ~555). */
  postX: number
  postLinkedIn: number
  /** The account circle. */
  avatar: number
  /** The margin column Quincy's marks stand in (the kit's is 170). */
  markCol: number
  /** B: the recess around the post. */
  stagePad: number
}

export const DEFAULT_OPTIONS: LabOptions = {
  title: "opening",
  detailMin: 440,
  detailShare: 46,
  detailMax: 720,
  marks: "note",
  deskType: 15,
  listKeep: 580,
  postX: 598,
  postLinkedIn: 555,
  avatar: 40,
  markCol: 150,
  stagePad: 32,
}

export const LabOptionsContext = React.createContext<LabOptions>(DEFAULT_OPTIONS)
