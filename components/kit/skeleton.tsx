import * as React from "react"

/** Pixels, or a percentage of the line. */
export type SkeletonWidth = number | `${number}%`

const toCss = (w: SkeletonWidth) => (typeof w === "number" ? `${w}px` : w)

/**
 * One grey bar standing in for content the viewer does not need to read.
 * Decorative: hidden from assistive tech. It is not a loading state.
 */
export function Skeleton({ width }: { width: SkeletonWidth }) {
  return (
    <span
      aria-hidden
      className="block h-kit-skeleton rounded-full bg-kit-skeleton"
      style={{ width: toCss(width) }}
    />
  )
}

/** A paragraph of bars. Vary the widths: equal bars read as a table. */
export function SkeletonLines({
  widths,
}: {
  widths: readonly SkeletonWidth[]
}) {
  return (
    <span aria-hidden className="flex flex-col gap-kit-skeleton">
      {widths.map((w, i) => (
        <span
          key={i}
          className="block h-kit-skeleton rounded-full bg-kit-skeleton"
          style={{ width: toCss(w) }}
        />
      ))}
    </span>
  )
}
