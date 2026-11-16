"use client"

import * as React from "react"

import { useReducedMotion } from "./use-reduced-motion"

/** The stage width under which the detail can sit below the fold (docs/design/page.md). */
const NARROW_REM = 32

/**
 * List and detail on a narrow stage: when the open item changes, bring the
 * detail's top into view, without moving focus (focus stays on the row the
 * person picked). Put the ref on the detail Card and pass the open item's
 * id as `key`.
 *
 * It scrolls only when `key` changes after mount, never on page load, and
 * only when the detail's Stage is under 32rem; on a wider stage the detail
 * is already beside the eye. `block: "nearest"`, so a detail that is
 * already visible does not move. Smooth, unless reduced motion is asked
 * for. A `null` key (nothing open) does nothing.
 */
export function useRevealOnNarrow<T extends HTMLElement>(
  key: string | number | null | undefined,
): React.RefObject<T | null> {
  const ref = React.useRef<T>(null)
  const reduced = useReducedMotion()
  const reducedRef = React.useRef(reduced)
  // The key the last effect saw. Compared, not counted, so Strict Mode's
  // second effect run on mount is a no-op instead of a scroll on load.
  const seen = React.useRef(key)

  React.useEffect(() => {
    reducedRef.current = reduced
  })

  React.useEffect(() => {
    if (seen.current === key) return
    seen.current = key
    const el = ref.current
    if (key == null || !el) return
    const stage = el.closest('[data-slot="kit-stage"]')
    if (!stage) return
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    if (stage.getBoundingClientRect().width >= NARROW_REM * rem) return
    el.scrollIntoView({ block: "nearest", behavior: reducedRef.current ? "auto" : "smooth" })
  }, [key])

  return ref
}
