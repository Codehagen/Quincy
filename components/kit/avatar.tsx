import * as React from "react"

/**
 * Initials in a neutral 24px disc. No photos, no invented faces, and no
 * colour: a person is never an accent. Decorative, because it always sits
 * beside the person's name, which is what is read.
 */
export function Avatar({ initials }: { initials: string }) {
  return (
    <span
      data-slot="kit-avatar"
      aria-hidden
      className="inline-grid size-6 shrink-0 place-items-center rounded-full bg-kit-well font-kit-strong text-kit-small text-kit-ink-muted shadow-kit-inset select-none"
    >
      {initials.slice(0, 2)}
    </span>
  )
}
