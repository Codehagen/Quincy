"use client"

import * as React from "react"

import { useInView } from "@/components/kit"
import { Stage } from "@/components/showcase"
import { PRICE, REFUSALS } from "@/app/(marketing)/pricing/copy"

import { Blob } from "../../round-1/a/marks"

/*
 * Group a's shared page parts for round 2: the wallpaper, the page's own
 * top line and footer, the price, the waitlist. Product bits live in
 * product.tsx; the editor marks come from round 1 (round-1/a/marks.tsx and
 * round-1/b/frame.tsx), which the owner kept.
 */

/* ── The wallpaper ─────────────────────────────────────────────────────── */

/**
 * One grey landscape, long enough to walk along. `at` is where along it this
 * crop starts (in landscape px), so two plates on one page can show two
 * stretches of the same hills. Three ridges in the kit's chrome alpha: where
 * they overlap they stack darker, so the nearest hill is the darkest without
 * a second grey.
 */
export function Hills({
  width,
  height,
  at = 0,
  horizon = 0.42,
  className,
}: {
  width: number
  height: number
  at?: number
  /** Where the far ridge sits, as a share of the height. */
  horizon?: number
  className?: string
}) {
  const id = React.useId().replace(/:/g, "")
  const ridges = [
    { base: horizon, a: [26, 14], l: [310, 130], p: [0.4, 1.9] },
    { base: horizon + 0.12, a: [30, 12], l: [420, 170], p: [2.2, 0.3] },
    { base: horizon + 0.26, a: [24, 10], l: [520, 210], p: [4.1, 2.8] },
  ]
  const path = (r: (typeof ridges)[number]) => {
    const pts: string[] = []
    for (let x = 0; x <= width + 24; x += 24) {
      const u = x + at
      const y =
        r.base * height +
        r.a[0] * Math.sin(u / r.l[0] + r.p[0]) +
        r.a[1] * Math.sin(u / r.l[1] + r.p[1])
      pts.push(`${x.toFixed(0)} ${y.toFixed(1)}`)
    }
    return `M0 ${height} L${pts.join(" L")} L${width + 24} ${height} Z`
  }
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full ${className ?? ""}`}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--kit-stage)" />
          <stop offset="1" stopColor="var(--kit-object)" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${id}-sky)`} />
      {ridges.map((r, i) => (
        <path key={i} d={path(r)} fill="var(--kit-chrome)" />
      ))}
    </svg>
  )
}

/* ── A product picture ─────────────────────────────────────────────────── */

/**
 * A still showcase Stage at its design size: the showcase's tokens, its
 * Window and Phone frames, no script, no cursor. The plate around it is the
 * page's, so the crop is the plate's.
 */
export function Pic({
  width,
  height,
  children,
  className,
}: {
  width: number
  height: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className} style={{ width, height }}>
      <Stage<object> width={width} height={height} unframed>
        {() => children}
      </Stage>
    </div>
  )
}

/* ── Page chrome ───────────────────────────────────────────────────────── */

export function TopLine({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-16 pt-9 text-[15px]">
      <span className="flex items-center gap-2 font-[600] tracking-[-0.01em]">
        <Blob size={20} />
        Quincy
      </span>
      <span className="flex items-center gap-6 text-kit-ink-muted">
        {right ?? (
          <>
            <span>Pricing</span>
            <span className="text-kit-ink">Join the waitlist</span>
          </>
        )}
      </span>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="flex items-center justify-between border-t border-kit-hairline px-16 py-9 text-[14px] text-kit-ink-muted">
      <span className="flex items-center gap-2 text-kit-ink">
        <Blob size={18} />
        <span className="font-[600]">Quincy</span>
      </span>
      <span className="flex gap-7">
        <span>Pricing</span>
        <span>Privacy</span>
        <span>Terms</span>
      </span>
      <span>Codebase AS, Norway</span>
    </footer>
  )
}

/** The page's one button. Ink: the blue belongs to Approve and the pen. */
export function Cta({ children = "Join the waitlist" }: { children?: React.ReactNode }) {
  return (
    <button
      type="button"
      className="h-12 rounded-full bg-kit-ink px-6 text-[16px] font-[560] tracking-[-0.01em] text-kit-ground transition-[opacity,scale] duration-(--kit-duration-press) ease-kit-out hover:opacity-90 active:scale-[0.98] motion-reduce:transition-none"
    >
      {children}
    </button>
  )
}

/**
 * The waitlist: a real form so Enter submits. It does not send anything in
 * the lab; it says what would happen.
 */
export function Waitlist({ tone = "ground" }: { tone?: "ground" | "object" }) {
  const [sent, setSent] = React.useState(false)
  const id = React.useId()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setSent(true)
      }}
      className="flex flex-col items-center gap-3"
    >
      <div
        className={`flex h-14 w-[440px] items-center gap-2 rounded-full p-1.5 pl-6 shadow-kit-control ${tone === "object" ? "bg-kit-object" : "bg-kit-control"}`}
      >
        <label htmlFor={id} className="sr-only">
          Email
        </label>
        <input
          id={id}
          type="email"
          required
          placeholder="you@company.com"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-kit-ink-muted"
        />
        <button
          type="submit"
          className="h-11 rounded-full bg-kit-ink px-5 text-[15px] font-[560] text-kit-ground transition-[opacity] duration-(--kit-duration-press) ease-kit-out hover:opacity-90 motion-reduce:transition-none"
        >
          {sent ? "You are on the list" : "Join the waitlist"}
        </button>
      </div>
      <p className="text-[14px] text-kit-ink-muted">
        Invites go out in small groups. One email when yours is ready.
      </p>
    </form>
  )
}

/* ── Price ─────────────────────────────────────────────────────────────── */

export function PriceFigure({ size = 64 }: { size?: number }) {
  return (
    <p className="flex items-baseline gap-2 tabular-nums">
      <span style={{ fontSize: size }} className="leading-none font-[600] tracking-[-0.05em]">
        {PRICE.figure}
      </span>
      <span className="text-[17px] text-kit-ink-muted">{PRICE.period}</span>
    </p>
  )
}

export const PRICE_LINES = [
  "Everything Quincy does is in it.",
  `${PRICE.currency}.`,
  "Posts to X and LinkedIn. Nothing else yet.",
] as const

/** The refusals, as the pricing page states them. */
export const NEVER = REFUSALS

/** A row that reveals once, the first time it is on screen. */
export function useSeen<T extends Element>(threshold = 0.3) {
  return useInView<T>({ threshold })
}
