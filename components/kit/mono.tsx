import * as React from "react"

export type MonoProps = Omit<React.ComponentProps<"span">, "children"> & {
  children: React.ReactNode
  /** `muted` (default), or `ink` when the time IS the news. */
  tone?: "muted" | "ink"
  /**
   * `md` (default) beside body text; `sm` inside a dense block or a feed
   * row, where the time sits in meta-sized text (`text-kit-mono-sm`).
   */
  size?: "md" | "sm"
}

/**
 * Mono, only for times, file names and counts: `walk-tuesday.m4a · 4:12`,
 * never `Draft for X`. Tabular and untracked, so a column of times reads as
 * one. Muted by default; `ink` when the time IS the news ("Goes out Thu 07:45").
 */
export function Mono({ children, tone = "muted", size = "md", className, ...props }: MonoProps) {
  return (
    <span
      data-slot="kit-mono"
      {...props}
      className={`font-kit-mono ${size === "sm" ? "text-kit-mono-sm" : "text-kit-mono"} tabular-nums ${tone === "ink" ? "text-kit-ink" : "text-kit-ink-muted"} ${className ?? ""}`}
    >
      {children}
    </span>
  )
}
