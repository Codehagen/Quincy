import * as React from "react"

export type FactsProps = React.ComponentProps<"dl">

/**
 * Label and value pairs, read as a description list: "Where · Stockholm",
 * "Last used · 9 Nov". The label column is as wide as the longest label, so
 * the values share one left edge. Draws no surface: place it in a `Well` or
 * a `Panel` by composition.
 *
 * ```tsx
 * <Well>
 *   <Facts>
 *     <Fact label="Where">Stockholm, Sweden</Fact>
 *     <Fact label="Last used"><Mono>9 Nov</Mono></Fact>
 *   </Facts>
 * </Well>
 * ```
 */
export function Facts({ children, className, ...props }: FactsProps) {
  return (
    <dl
      data-slot="kit-facts"
      {...props}
      className={`grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-kit-related gap-y-2 ${className ?? ""}`}
    >
      {children}
    </dl>
  )
}

export type FactProps = Omit<React.ComponentProps<"dd">, "children"> & {
  /** The name of the fact, short and visible ("Where", "Last used"). */
  label: string
  /** The value: words, a `Mono`, a link or a mark. */
  children: React.ReactNode
}

/**
 * One row of `Facts`: a muted meta label and an ink value. A long value
 * wraps at word boundaries and breaks a long unbroken string (an address, a
 * URL) rather than pushing the grid wider.
 */
export function Fact({ label, children, className, ...props }: FactProps) {
  return (
    <>
      <dt data-slot="kit-fact-label" className="text-kit-meta text-kit-ink-muted">
        {label}
      </dt>
      <dd
        data-slot="kit-fact-value"
        {...props}
        className={`min-w-0 text-kit-body text-pretty break-words text-kit-ink ${className ?? ""}`}
      >
        {children}
      </dd>
    </>
  )
}
