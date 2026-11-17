"use client"

import * as React from "react"

/**
 * Calls `fn` at most once per animation frame, with the latest value.
 *
 * A pointer reports moves faster than the screen draws, and each call that
 * lands in a parent's state re-renders the whole timeline. The screen cannot
 * show more than one of them per frame, so the rest are work nobody sees.
 *
 * `cancel` drops a pending call. A gesture that ends calls it before its final
 * write, so a frame queued by the last move cannot land after the commit and
 * put the drag back.
 */
export function useFrameThrottle<T>(fn: (value: T) => void) {
  const fnRef = React.useRef(fn)
  const frame = React.useRef<number | null>(null)
  const pending = React.useRef<{ value: T } | null>(null)

  React.useEffect(() => {
    fnRef.current = fn
  })

  React.useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    []
  )

  const schedule = React.useCallback((value: T) => {
    pending.current = { value }
    if (frame.current !== null) return

    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const next = pending.current
      pending.current = null
      if (next) fnRef.current(next.value)
    })
  }, [])

  const cancel = React.useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    pending.current = null
  }, [])

  return { schedule, cancel }
}
