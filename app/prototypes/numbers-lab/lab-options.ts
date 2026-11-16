"use client"

import * as React from "react"

/**
 * The lab's undecided numbers and choices (control-panel.tsx), read by the
 * layouts through a context.
 */
export type LabOptions = {
  /** Weeks behind the window before a baseline is stated. */
  minWeeks: number
  /** The tile's trend: a line or twelve-plus small columns. */
  spark: "line" | "columns"
  /** Depth first (the vision) or Volume first (what demos). */
  order: "depth" | "volume"
  /** How many posts the "best against your median" list shows. */
  best: number
  /** The against-median bars: log2 (honest for a ratio) or linear. */
  scale: "log" | "linear"
  /** B · Table: the open post's pane, clamp(min, share, max). */
  paneMin: number
  paneShare: number
  paneMax: number
  /** C · Weekly read: the margin the small charts stand in. */
  margin: number
}

export const DEFAULT_OPTIONS: LabOptions = {
  minWeeks: 3,
  spark: "line",
  order: "depth",
  best: 5,
  scale: "log",
  paneMin: 400,
  paneShare: 40,
  paneMax: 560,
  margin: 200,
}

export const LabOptionsContext = React.createContext<LabOptions>(DEFAULT_OPTIONS)
export const useLabOptions = () => React.useContext(LabOptionsContext)
