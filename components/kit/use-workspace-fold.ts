"use client"

import * as React from "react"

/**
 * Which side of a workspace's fold CSS is showing, read back for behaviour
 * (keys, which pane a row opens in). CSS decides the layout: each side sits
 * in a slot whose container query on `kit-workspace` shows or hides it, so
 * the server's HTML paints the right side at once and nothing waits on a
 * measure. Script never measures a width of its own; it reads the probe,
 * so the two can never disagree.
 *
 * The probe is an empty element that CSS shows (any display but `none`) on
 * the folded side and hides on the wide side; it must sit inside the
 * workspace. `null` until mounted: render both sides, each in its slot, and
 * let CSS pick. After mount, render only the side that is showing.
 *
 * Re-read when the workspace resizes, and on `media` changes (Lineup's
 * coarse pointer), since a media query can flip the probe without a resize.
 */
export function useWorkspaceFold<T extends Element = HTMLSpanElement>({
  media,
}: { media?: string } = {}): [React.RefObject<T | null>, boolean | null] {
  const probe = React.useRef<T>(null)
  const [fold, setFold] = React.useState<boolean | null>(null)
  React.useLayoutEffect(() => {
    const el = probe.current
    const frame = el?.closest('[data-slot="kit-workspace"]')
    if (!el || !frame) return
    const read = () => setFold(getComputedStyle(el).display !== "none")
    read()
    const ro = new ResizeObserver(read)
    ro.observe(frame)
    const mq = media ? window.matchMedia(media) : null
    mq?.addEventListener("change", read)
    return () => {
      ro.disconnect()
      mq?.removeEventListener("change", read)
    }
  }, [media])
  return [probe, fold]
}
