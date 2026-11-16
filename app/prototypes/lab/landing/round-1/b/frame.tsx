"use client"

import * as React from "react"

import { KitRoot } from "@/components/kit"

const W = 1200
const H = 900

/**
 * Group b's frame. Each piece is designed at 1200×900 and scaled to the lab's
 * 4:3 frame, so the whole composition (hero + the first section under it) is
 * visible at any frame width. Hidden until measured, so it never paints at
 * full size for one frame and then jumps.
 */
export function Frame({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(0)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / W)
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
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            visibility: scale ? undefined : "hidden",
          }}
        >
          {children}
        </div>
      </KitRoot>
    </div>
  )
}

/** The page's own top line. Not a floating pill: a plain row on the ground. */
export function TopLine({ right }: { right?: React.ReactNode }) {
  return (
    <div className="absolute inset-x-16 top-7 flex items-center justify-between">
      <span className="text-[15px] font-kit-strong tracking-[-0.01em]">Quincy</span>
      <span className="flex items-center gap-5 text-kit-ink-muted">
        {right ?? (
          <>
            <span>$49 a month</span>
            <span className="text-kit-ink">Ask for an invite</span>
          </>
        )}
      </span>
    </div>
  )
}

/** The invite action. Ink, never the accent: the accent belongs to the product. */
export function InviteButton({ children = "Ask for an invite" }: { children?: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex h-11 items-center rounded-full bg-kit-ink px-5 text-[15px] font-kit-strong text-kit-ground transition-[opacity] duration-(--kit-duration-press) ease-kit-out hover:opacity-90 active:opacity-80 motion-reduce:transition-none"
    >
      {children}
    </button>
  )
}

/** A system pointer, drawn. Static: it rests where the person would press. */
export function Pointer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden
      width="22"
      height="28"
      viewBox="0 0 22 28"
      className={`pointer-events-none absolute drop-shadow-sm ${className ?? ""}`}
      style={style}
    >
      <path
        d="M2 1.5v21.2l5.3-5.1 3.4 8 3.7-1.6-3.4-7.8H18L2 1.5Z"
        className="fill-kit-ink stroke-kit-object"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Quincy's pen: a thin bracket and a Caveat label. Same blue as the action. */
export function PenLabel({
  label,
  side = "right",
  height,
  className,
  style,
}: {
  label: string
  side?: "left" | "right"
  height: number
  className?: string
  style?: React.CSSProperties
}) {
  const bracket = (
    <svg aria-hidden width="8" height={height} className="shrink-0 text-kit-pen" viewBox={`0 0 8 ${height}`}>
      <path
        d={side === "right" ? `M1 1 H6 V${height - 1} H1` : `M7 1 H2 V${height - 1} H7`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
  const hand = (
    <span className="inline-block -rotate-2 font-kit-hand text-kit-hand whitespace-nowrap text-kit-pen">
      {label}
    </span>
  )
  return (
    <span
      className={`absolute flex items-center gap-2 ${className ?? ""}`}
      style={{ height, ...style }}
    >
      {side === "right" ? (
        <>
          {bracket}
          {hand}
        </>
      ) : (
        <>
          {hand}
          {bracket}
        </>
      )}
    </span>
  )
}

/**
 * Quincy as a character: a soft ink blob with two dot eyes. Ink, not a
 * colour, so it never competes with the piece's one accent.
 */
export function Blob({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className ?? ""}`}>
      <path
        d="M12 2.2c5 0 9.6 3.4 9.6 9.3 0 6-4.3 10.3-9.8 10.3S2.4 18.3 2.4 12.6C2.4 6.4 7 2.2 12 2.2Z"
        className="fill-kit-ink"
      />
      <circle cx="9" cy="11" r="1.6" className="fill-kit-object" />
      <circle cx="15" cy="11" r="1.6" className="fill-kit-object" />
    </svg>
  )
}
