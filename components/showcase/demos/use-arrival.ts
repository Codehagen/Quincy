"use client"

import * as React from "react"

import { useInView, useReducedMotion } from "@/components/kit"

/**
 * How many of `count` things have arrived: the first is there from the
 * start (so the server HTML, a crawler and a thumbnail never show an empty
 * picture), then one more every `gapMs` once the element is on screen.
 * It plays once and holds its ending: data never rewinds in view
 * (docs/design/showcase.md). Reduced motion: all of them at once.
 */
export function useArrival<T extends Element>(
  count: number,
  gapMs = 1400,
): [React.RefObject<T | null>, number] {
  const [ref, seen] = useInView<T>()
  const reduced = useReducedMotion()
  const [shown, setShown] = React.useState(1)

  React.useEffect(() => {
    if (!seen || reduced || shown >= count) return
    const t = window.setTimeout(() => setShown((s) => s + 1), gapMs)
    return () => window.clearTimeout(t)
  }, [seen, reduced, shown, count, gapMs])

  return [ref, reduced ? count : Math.min(shown, count)]
}
