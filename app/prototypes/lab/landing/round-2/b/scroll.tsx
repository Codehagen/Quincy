"use client"

import * as React from "react"

import { KitRoot } from "@/components/kit"

const W = 1200

/**
 * Group b's page frame for round 2. Each piece is a whole landing page
 * designed at 1200px wide and any height. The lab's 4:3 frame fits the width
 * with `zoom` (not a transform, so the zoomed page keeps its real height and
 * the frame scrolls through all of it). Hidden until measured, so it never
 * paints at 1200px for one frame and then jumps.
 *
 * `dark` puts the kit's dark remap on the whole page. A piece that changes
 * ground part way down leaves it off and wraps its dark sections in `.dark`.
 */
export function Scroll({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = React.useState(0)

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
      className={`absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-kit-ground ${dark ? "dark" : ""}`}
    >
      <div style={{ width: W, zoom: zoom || 1, visibility: zoom ? undefined : "hidden" }}>
        <KitRoot>
          <div className="relative w-[1200px] text-kit-ink">{children}</div>
        </KitRoot>
      </div>
    </div>
  )
}
