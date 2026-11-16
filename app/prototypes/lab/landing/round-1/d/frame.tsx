"use client"

import * as React from "react"

import { KitRoot, TextLink } from "@/components/kit"

const W = 1200
const H = 900

/**
 * Group d's frame. Each piece is designed at 1200×900 (a laptop's first
 * screen: the hero and the section under it) and scaled to whatever width the
 * lab's 4:3 frame has, so the whole composition is visible at any size.
 *
 * The scale is measured, not guessed: a ResizeObserver reads the frame's
 * width. Until the first measure the box is invisible, so a piece never
 * flashes at 1200px inside a 300px frame.
 */
export function Frame({
  children,
  ground = "ground",
  dark = false,
}: {
  children: React.ReactNode
  /** Re-point every kit token to its dark step, for the whole piece. */
  dark?: boolean
  /** The page colour behind the composition. */
  ground?: "ground" | "stage" | "object"
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setScale(el.clientWidth / W)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const bg =
    ground === "stage"
      ? "bg-kit-stage"
      : ground === "object"
        ? "bg-kit-object"
        : "bg-kit-ground"

  return (
    <div
      ref={ref}
      className={`${dark ? "dark" : ""}relative size-full overflow-hidden ${bg}`}
    >
      <div
        className="absolute top-0 left-0 origin-top-left overflow-hidden"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale ?? 1})`,
          visibility: scale == null ? "hidden" : undefined,
        }}
      >
        <KitRoot>
          <div
            className={`relative overflow-hidden ${bg}`}
            style={{ width: W, height: H }}
          >
            {children}
          </div>
        </KitRoot>
      </div>
    </div>
  )
}

/** The plain top line every piece in this group shares: the name, and a way in. */
export function TopLine({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-kit-body">
      <span className="font-kit-strong text-kit-ink">Quincy</span>
      <span className="flex items-center gap-6 text-kit-ink-muted">
        {right ?? (
          <>
            <span>$49 a month</span>
            <span className="text-kit-ink">
              <TextLink href="/login">Sign in</TextLink>
            </span>
          </>
        )}
      </span>
    </div>
  )
}
