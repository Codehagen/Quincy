import * as React from "react"

export type LiveDotProps = {
  /**
   * What is running, in words ("Recording", "Reading #212"). The dot is
   * decorative and never the only thing that says "live".
   */
  children?: React.ReactNode
}

/**
 * A still 8px dot beside its label, painted --kit-live. Kept only for the
 * showcase pictures (components/showcase/), which draw the landing's own
 * frames. The product does not use it: work in progress is the friend in its
 * working state beside the words, and green is not a status colour
 * (docs/design/states.md, "Working"). It has no pulse; ESLint
 * `quincy-design/no-live-pulse` keeps it that way.
 */
export function LiveDot({ children }: LiveDotProps) {
  return (
    <span data-slot="kit-live-dot" className="inline-flex items-center gap-2">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-kit-live" />
      {children != null ? <span className="min-w-0">{children}</span> : null}
    </span>
  )
}
