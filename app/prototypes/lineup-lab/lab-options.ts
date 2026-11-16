"use client"

import * as React from "react"

/** The lab's undecided numbers (control-panel.tsx), read by the layouts. */
export type LabOptions = {
  /** The feed column: X's is 598. */
  postX: number
  /** 2 · Board: the open cell's pane (a phone-width feed). */
  boardPane: number
  /** 2 · Board: lines of the opening line a cell shows. */
  cellLines: 1 | 2 | 3
  /** 3 · Feed: the time rail and the margin beside the column. */
  rail: number
  margin: number
  /** 3 · Feed: the week forward (today on top), or as a profile shows it (newest on top). */
  order: "forward" | "profile"
  /** Quincy's notes about the week (proposed): on, or none. */
  notes: "on" | "off"
}

export const DEFAULT_OPTIONS: LabOptions = {
  postX: 598,
  boardPane: 380,
  cellLines: 2,
  rail: 112,
  margin: 248,
  order: "forward",
  notes: "on",
}

export const LabOptionsContext = React.createContext<LabOptions>(DEFAULT_OPTIONS)
