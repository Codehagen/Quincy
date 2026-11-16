import * as React from "react"

/**
 * A code name inside prose: a token, a prop, a component (`kit-pad`,
 * `crop="corner"`). Docs and settings help only. It is not Mono: Mono is a
 * tag on product content (a time, a file name, a count) and reads as part of
 * the product; Code reads as an instruction about it, so it sits on a
 * well-coloured chip.
 */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      data-slot="kit-code"
      className="rounded-kit-chip bg-kit-well px-1 py-px font-kit-mono text-kit-mono text-kit-ink box-decoration-clone"
    >
      {children}
    </code>
  )
}
