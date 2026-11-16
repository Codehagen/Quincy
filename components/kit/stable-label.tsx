import * as React from "react"

/**
 * Several labels stacked in one grid cell, only `current` visible, so a
 * control is always as wide as its widest label and never shifts when
 * "Draft this" becomes "Drafting…". The hidden ones are `visibility: hidden`,
 * which also takes them out of the accessible name. Internal to the kit.
 */
export function StableLabel({
  current,
  labels,
}: {
  current: number
  labels: readonly React.ReactNode[]
}) {
  if (labels.length === 1) return <>{labels[0]}</>
  return (
    <span className="inline-grid justify-items-center">
      {labels.map((label, i) => (
        <span
          key={i}
          className={`col-start-1 row-start-1 ${i === current ? "" : "invisible"}`}
        >
          {label}
        </span>
      ))}
    </span>
  )
}

/**
 * A polite live region beside a control, so "Drafting…" is heard. A focused
 * button's own label changing is not reliably announced, and the region
 * cannot sit inside the button (it would join the button's name).
 * Absolutely positioned (`sr-only`), so it takes no gap in a flex row.
 */
export function PendingAnnouncer({ message }: { message: string | null }) {
  return (
    <span role="status" className="sr-only">
      {message ?? ""}
    </span>
  )
}
