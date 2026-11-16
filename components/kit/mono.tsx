import * as React from "react"

/**
 * Mono, only for times, file names and counts: `walk-tuesday.m4a · 4:12`,
 * never `Draft for X`. Tabular and untracked. Muted by default; `ink` when the
 * time IS the news ("Goes out Thu 07:45").
 */
export function Mono({
  children,
  tone = "muted",
}: {
  children: React.ReactNode
  tone?: "muted" | "ink"
}) {
  return (
    <span
      className={`font-kit-mono text-kit-mono tabular-nums ${tone === "ink" ? "text-kit-ink" : "text-kit-ink-muted"}`}
    >
      {children}
    </span>
  )
}
