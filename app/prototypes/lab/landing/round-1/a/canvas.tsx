"use client"

import * as React from "react"

import { KitRoot } from "@/components/kit"

const W = 1200
const H = 900

/**
 * Every piece in group a is designed at 1200×900 and scaled to fill the
 * lab's 4:3 frame, so the whole hero and the section under it are always in
 * view. Hidden until the first measure, so it never paints at the wrong size.
 */
export function Canvas({
  children,
  dark = false,
}: {
  children: React.ReactNode
  /** The kit's dark remap, for this piece only. */
  dark?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0) setScale(Math.min(r.width / W, r.height / H))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} className={`absolute inset-0 overflow-hidden bg-kit-ground ${dark ? "dark" : ""}`}>
      <div
        style={{
          width: W,
          height: H,
          transform: `scale(${scale ?? 1})`,
          transformOrigin: "0 0",
          visibility: scale == null ? "hidden" : undefined,
        }}
        className="overflow-hidden"
      >
        <KitRoot>
          <div className="relative h-[900px] w-[1200px] overflow-hidden">{children}</div>
        </KitRoot>
      </div>
    </div>
  )
}
