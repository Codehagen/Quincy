"use client"

import * as React from "react"

import { useInView } from "@/components/kit"

/**
 * Group a's editor marks, drawn for a 1200px canvas. The kit's own marks
 * measure a Stage container to decide where the margin is; a landing hero
 * has no Stage, so these take the margin side explicitly.
 */

/** The yellow highlighter. Static unless `sweep`, which runs once when seen. */
export function Hl({
  children,
  sweep = false,
  delay = 0,
}: {
  children: React.ReactNode
  sweep?: boolean
  delay?: number
}) {
  const [ref, seen] = useInView<HTMLElement>()
  const on = !sweep || seen
  return (
    <mark
      ref={ref}
      data-on={on || undefined}
      style={sweep ? { transitionDelay: `${delay}ms` } : undefined}
      className="-mx-1 bg-transparent bg-[linear-gradient(var(--kit-highlight),var(--kit-highlight))] bg-size-[0%_80%] bg-position-[0_60%] bg-no-repeat px-1 text-inherit box-decoration-clone transition-[background-size] duration-[900ms] ease-kit-out data-on:bg-size-[100%_80%] motion-reduce:transition-none"
    >
      {children}
    </mark>
  )
}

/** The thin hand-drawn bracket that spans the lines a note is about. */
export function BracketLine({
  tone,
  side,
}: {
  tone: "graphite" | "pen"
  side: "left" | "right"
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 100"
      preserveAspectRatio="none"
      className={`h-full w-[11px] flex-none overflow-visible ${side === "left" ? "-scale-x-100" : ""}`}
    >
      <path
        d="M1 1.5 C 5 1.5, 6 3, 6 8 L 6.4 44 C 6.5 48, 7.5 50, 10 50 C 7.5 50, 6.5 52, 6.4 56 L 6 92 C 6 97, 5 98.5, 1 98.5"
        fill="none"
        stroke={tone === "pen" ? "var(--kit-pen)" : "var(--kit-ink-muted)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Quincy's handwriting. Caveat, tilted, never more than a few words. */
export function Hand({
  children,
  tone = "graphite",
  size = 26,
}: {
  children: React.ReactNode
  tone?: "graphite" | "pen"
  size?: number
}) {
  return (
    <span
      style={{ fontSize: size }}
      className={`inline-block -rotate-2 font-kit-hand leading-[0.95] font-medium ${tone === "pen" ? "text-kit-pen" : "text-kit-ink-muted"}`}
    >
      {children}
    </span>
  )
}

/**
 * A block with a note in the margin beside it: a bracket spanning the block
 * and a few handwritten words. `gap` is the distance from the block's edge
 * to the bracket; `width` is the margin column.
 */
export function Margin({
  note,
  children,
  side = "right",
  tone = "graphite",
  gap = 24,
  width = 190,
  show = true,
  delay = 0,
}: {
  note: React.ReactNode
  children: React.ReactNode
  side?: "left" | "right"
  tone?: "graphite" | "pen"
  gap?: number
  width?: number
  show?: boolean
  delay?: number
}) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden={!show || undefined}
        data-on={show || undefined}
        style={{
          [side === "right" ? "left" : "right"]: `calc(100% + ${gap}px)`,
          width,
          transitionDelay: `${delay}ms`,
        }}
        className={`absolute -top-1 -bottom-1 flex items-center gap-3 opacity-0 transition-[opacity,translate] duration-(--kit-duration-enter) ease-kit-out data-on:translate-x-0 data-on:opacity-100 motion-reduce:transition-none ${side === "right" ? "-translate-x-1" : "translate-x-1 flex-row-reverse text-right"}`}
      >
        <BracketLine tone={tone} side={side} />
        <Hand tone={tone}>{note}</Hand>
      </span>
    </div>
  )
}

/** A blue-pen underline under a run of text. Static: one mark, at rest. */
export function PenLine({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      <svg
        aria-hidden
        viewBox="0 0 300 12"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-3 left-0 h-[14px] w-full overflow-visible"
      >
        <path
          d="M2 8 C 60 3, 120 10, 180 6 S 270 4, 298 7"
          fill="none"
          stroke="var(--kit-pen)"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  )
}

/** The person's mark for "this is the number": a loose pen ring. */
export function Ring({ children, tone = "graphite" }: { children: React.ReactNode; tone?: "graphite" | "pen" }) {
  return (
    <span className="relative inline-block">
      {children}
      <svg
        aria-hidden
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -top-2 -left-3 h-[calc(100%+16px)] w-[calc(100%+24px)] overflow-visible"
      >
        <path
          d="M52 3 C 20 2, 3 12, 4 26 C 5 41, 30 48, 55 47 C 82 46, 97 37, 96 23 C 95 9, 72 2, 44 5"
          fill="none"
          stroke={tone === "pen" ? "var(--kit-pen)" : "var(--kit-ink-muted)"}
          strokeWidth={1.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  )
}

/** The page's one button. Ink by default; `action` only where blue is the piece's accent. */
export function Cta({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "action" }) {
  return (
    <button
      type="button"
      className={`h-12 rounded-full px-6 text-[16px] font-[560] tracking-[-0.01em] transition-[background-color,scale] duration-(--kit-duration-press) ease-kit-out active:scale-[0.98] motion-reduce:transition-none ${tone === "action" ? "bg-kit-action text-kit-action-on hover:bg-kit-action-hover" : "bg-kit-ink text-kit-ground hover:bg-kit-ink/88"}`}
    >
      {children}
    </button>
  )
}

/** The thin top line: the name and the way in. No pill nav. */
export function TopLine({ right }: { right?: React.ReactNode }) {
  return (
    <div className="absolute inset-x-16 top-9 flex items-baseline justify-between text-[15px]">
      <span className="font-[600] tracking-[-0.01em]">Quincy</span>
      <span className="text-kit-ink-muted">{right ?? "$49 a month. Invites go out in small groups."}</span>
    </div>
  )
}

/**
 * Quincy as a character: a soft ink blob with two dot eyes. Neutral on
 * purpose, so it never spends the piece's one accent.
 */
export function Blob({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 40 40" className="flex-none">
      <path
        d="M20 3 C 30 3, 37 9, 37 19 C 37 30, 30 37, 20 37 C 9 37, 3 31, 3 21 C 3 11, 10 3, 20 3 Z"
        fill="var(--kit-ink)"
      />
      <circle cx="15" cy="18" r="2.6" fill="var(--kit-ground)" />
      <circle cx="25" cy="18" r="2.6" fill="var(--kit-ground)" />
    </svg>
  )
}

/** The work receipt: what Quincy did, one checked line each. */
export function Receipt({ lines }: { lines: [string, string][] }) {
  return (
    <ul className="flex flex-col gap-2.5 text-[14px] leading-[1.4]">
      {lines.map(([did, result]) => (
        <li key={did} className="flex items-baseline gap-2.5">
          <svg aria-hidden viewBox="0 0 16 16" className="size-[14px] flex-none translate-y-[2px]">
            <circle cx="8" cy="8" r="8" fill="var(--kit-ink)" />
            <path d="M4.6 8.2 L7 10.5 L11.4 5.8" fill="none" stroke="var(--kit-ground)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <span className="font-[560]">{did}</span>
            <span className="text-kit-ink-muted"> → {result}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
