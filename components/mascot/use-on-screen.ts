"use client"

import * as React from "react"

/**
 * Whether the friend is on screen, so its clock runs only while it can be
 * seen. requestAnimationFrame already stops in a hidden tab; this covers a
 * friend scrolled out of view, or in a pane that is not shown, which would
 * otherwise draw sixty frames a second for nobody.
 *
 * True until the first report, so the first paint and a browser without
 * IntersectionObserver keep the friend moving.
 */
export function useOnScreen<T extends Element>(ref: React.RefObject<T | null>) {
  const [on, setOn] = React.useState(true)
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setOn(entry.isIntersecting)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return on
}
