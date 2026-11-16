"use client"

import * as React from "react"

import { useReducedMotion } from "./use-reduced-motion"

/** --kit-duration-enter. JS cannot read a theme token, so it is mirrored here. */
const COUNT_MS = 320

const DEFAULT_FORMAT = (n: number) => Math.round(n).toLocaleString("en-US")

export type CountProps = {
  value: number
  /** How a frame's number reads. Default: rounded, en-US thousands. */
  format?: (n: number) => string
}

/**
 * A number that counts from its last value to a new one, so a change the
 * person caused (picking another hour) reads as caused. It never counts on
 * mount: the first value is simply there. Tabular, so the width holds.
 *
 * Screen readers get the final value once, not every frame. Under reduced
 * motion it snaps.
 */
export function Count({ value, format = DEFAULT_FORMAT }: CountProps) {
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(value)
  const from = React.useRef(value)

  React.useEffect(() => {
    if (reduced) {
      from.current = value
      return
    }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / COUNT_MS)
      const v = a + (value - a) * (1 - Math.pow(1 - p, 3))
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced])

  return (
    <span data-slot="kit-count" className="tabular-nums">
      <span aria-hidden>{format(reduced ? value : shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
