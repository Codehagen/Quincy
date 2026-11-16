import * as React from "react"

/**
 * A hairline across the object, edge to edge: it reaches past the Card's
 * padding (`--kit-card-pad`) so it reads as a fold in the object, not a line
 * drawn inside it. 12px above and below. Decorative; a real section break
 * is a heading.
 *
 * With a `label` ("or") it is the divider between two ways to do one thing:
 * a hairline either side of a small muted word, inside the padding (it
 * joins two controls, it does not fold the object), and no margin of its
 * own, so the stack around it sets the gap. Still decorative: the two
 * controls say what they are, so the word is aria-hidden.
 */
export function Rule({ label }: { label?: string } = {}) {
  if (label) {
    return (
      <div data-slot="kit-rule" aria-hidden className="flex items-center gap-kit-related">
        <span className="h-px flex-1 bg-kit-hairline" />
        <span className="text-kit-small text-kit-ink-muted select-none">{label}</span>
        <span className="h-px flex-1 bg-kit-hairline" />
      </div>
    )
  }
  return (
    <hr
      data-slot="kit-rule"
      aria-hidden
      className="mx-[calc(-1*var(--kit-card-pad,0px))] my-kit-related h-px border-0 bg-kit-hairline"
    />
  )
}
