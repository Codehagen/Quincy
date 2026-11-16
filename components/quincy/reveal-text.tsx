"use client"

import * as React from "react"

import { revealDuration } from "@/lib/reveal-text"

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)")
  media.addEventListener("change", onStoreChange)
  return () => media.removeEventListener("change", onStoreChange)
}

/**
 * Write `source` onto the card: the words arrive, they do not pop in
 * finished. ChatDraft's write-in (lib/reveal-text.ts sets the pace).
 *
 * `animate` is only true when this card replaced a skeleton in the same
 * mount. A refresh of an already-saved transcript passes false, so history
 * does not re-type itself.
 */
export function useRevealedText(source: string, animate: boolean) {
  const reduced = React.useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false
  )
  const shouldAnimate = animate && !reduced && source.length > 0
  const [shown, setShown] = React.useState(shouldAnimate ? "" : source)
  const [done, setDone] = React.useState(!shouldAnimate)

  React.useEffect(() => {
    if (!shouldAnimate) return

    const duration = revealDuration(source.length)
    const started = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const next = Math.floor(progress * source.length)
      setShown(source.slice(0, next))
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick)
        return
      }
      setShown(source)
      setDone(true)
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [shouldAnimate, source])

  return { text: shouldAnimate ? shown : source, done: shouldAnimate ? done : true }
}

/** A 1px caret so the stream does not shove the line with a `|`. */
export function StreamCaret() {
  return (
    <span
      aria-hidden="true"
      className="ml-px inline-block h-[0.9em] w-px translate-y-px bg-kit-ink motion-reduce:hidden"
    />
  )
}
