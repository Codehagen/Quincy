import * as React from "react"

const REDUCED = "(prefers-reduced-motion: reduce)"

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/**
 * True when the viewer asked for less motion. False on the server and during
 * hydration, so server and client markup agree; it updates after mount.
 *
 * Every kit component already has its reduced-motion path in CSS
 * (`motion-reduce:`). Reach for this only for motion driven from JS, or for
 * logic that waits on a transition that reduced motion removes.
 */
export function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}
