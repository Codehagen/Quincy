"use client"

import * as React from "react"

import { KitRoot } from "@/components/kit"

/**
 * Group c's frame. Each piece is designed at 1200×900, the hero plus the
 * first section of a landing page, and scaled as one picture to the lab's
 * 4:3 frame, so the composition is seen whole at any frame width.
 *
 * A transform, not a re-layout: container queries inside (the kit Stage's
 * margin column) still read the 1200px layout, so the page shown is the
 * page as designed. Hidden until the first measure, so it never paints at
 * the wrong scale.
 */
export const W = 1200
export const H = 900

export function Frame({
  children,
  dark = false,
}: {
  children: React.ReactNode
  /** The kit's own dark remap (`.dark` re-points every --kit-* token). */
  dark?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState<number | null>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / W)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      <KitRoot>
        <div
          className={`relative overflow-hidden bg-kit-ground text-kit-ink ${dark ? "dark" : ""}`}
          style={{
            width: W,
            height: H,
            transform: `scale(${scale ?? 1})`,
            transformOrigin: "0 0",
            visibility: scale == null ? "hidden" : undefined,
          }}
        >
          {children}
        </div>
      </KitRoot>
    </div>
  )
}
