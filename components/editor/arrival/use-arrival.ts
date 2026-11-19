"use client"

import * as React from "react"

import { MILESTONES, REVEAL_MS } from "./passes"

/**
 * Whether the arrival plays, and where it is (plans/036, phase G).
 *
 * Honest by rule: it plays once per asset, the first time the take is opened
 * after it was read, and never again, so a re-open never shows a reading
 * that is not happening. "Already seen" is a flag in this browser's storage
 * (no migration); a storage that cannot be read or written means it does
 * not play, since then "once" cannot be kept.
 *
 * It never holds anything up: the composer works throughout, and typing or
 * sending skips to the settled margin. Under reduced motion it is settled
 * from the start (the passes, the sweep and the entrance are all motion).
 *
 * `mode` is the mock's: "always" plays it on every mount (the harness
 * replays it), "never" opens settled.
 */

export type ArrivalMode = "auto" | "always" | "never"

export type Arrival = {
  /** Before the first layout on the client: nothing decided, the noticed block held back. */
  phase: "deciding" | "scanning" | "settled"
  /** Ms into the scan, stepped at each milestone; past the end once settled. */
  atMs: number
  /** True when this mount played the scan (for the one announcement). */
  played: boolean
  /** Skip to the settled margin. Safe to call at any time. */
  skip: () => void
}

const SEEN_PREFIX = "quincy.cuts.read:"

/** Marks the asset seen and says whether it was unseen. False when storage is out of reach. */
function firstOpen(assetId: string): boolean {
  try {
    const key = `${SEEN_PREFIX}${assetId}`
    if (window.localStorage.getItem(key)) return false
    window.localStorage.setItem(key, new Date().toISOString())
    return window.localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

const SETTLED = Number.POSITIVE_INFINITY

export function useArrival({
  assetId,
  hasReading,
  mode = "auto",
}: {
  assetId: string | null
  hasReading: boolean
  mode?: ArrivalMode
}): Arrival {
  const [phase, setPhase] = React.useState<Arrival["phase"]>("deciding")
  const [atMs, setAtMs] = React.useState(0)
  const [played, setPlayed] = React.useState(false)
  /** Decided once per mount: whether this mount plays, and when it started. */
  const decided = React.useRef<{ plays: boolean; startedAt: number } | null>(null)

  const settle = React.useCallback(() => {
    setAtMs(SETTLED)
    setPhase("settled")
  }, [])

  // Decided before the first paint, so a settled re-open draws settled
  // and a first open never flashes the noticed block before the scan. Held
  // in a ref: the "seen" flag is written on the first decision, and asking
  // again (a remounted effect) would read it back as a re-open.
  React.useLayoutEffect(() => {
    if (!decided.current) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      const plays =
        hasReading &&
        assetId !== null &&
        mode !== "never" &&
        (mode === "always" || firstOpen(assetId)) &&
        // Reduced motion still counts as the first open: firstOpen marked it.
        !reduced
      decided.current = { plays, startedAt: performance.now() }
    }
    if (decided.current.plays) {
      setPlayed(true)
      setPhase((p) => (p === "deciding" ? "scanning" : p))
    } else settle()
  }, [hasReading, assetId, mode, settle])

  // The scan's clock: one timer per milestone, from where the scan is now.
  const scanning = phase === "scanning"
  React.useEffect(() => {
    if (!scanning || !decided.current) return
    const elapsed = performance.now() - decided.current.startedAt
    const timers = MILESTONES.filter((at) => at > elapsed).map((at) =>
      window.setTimeout(() => {
        setAtMs(at)
        if (at >= REVEAL_MS) setPhase("settled")
      }, at - elapsed)
    )
    return () => timers.forEach(window.clearTimeout)
  }, [scanning])

  return { phase, atMs, played, skip: settle }
}
