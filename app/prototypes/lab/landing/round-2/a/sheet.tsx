"use client"

import * as React from "react"

import { KitRoot } from "@/components/kit"

const W = 1200

/**
 * Group a, round 2: every piece is a whole landing page designed at 1200px
 * wide and any height. The lab's 4:3 frame shows it scaled to the frame's
 * width, and the frame scrolls. `zoom` rather than a transform, so the
 * scroll height is the page's real height at that scale and in-view
 * reveals fire as the reader scrolls inside the frame.
 */
export function Sheet({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setZoom(w / W)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-kit-ground [scrollbar-width:none]"
    >
      <div style={{ width: W, zoom: zoom ?? 1, visibility: zoom == null ? "hidden" : undefined }}>
        <KitRoot>
          <div className="relative w-[1200px] bg-kit-ground text-kit-ink">{children}</div>
        </KitRoot>
      </div>
    </div>
  )
}
