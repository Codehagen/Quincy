import * as React from "react"

export type WellProps = {
  /** `blockquote` when it holds the person's own words, verbatim. */
  as?: "div" | "blockquote"
  children: React.ReactNode
}

/**
 * A recess inside the object: the stage showing through. For raw material
 * quoted back (a riff's transcript), a booked slot, a note that is not the
 * object's own content. Never a pressable surface and never a card inside a
 * card (that is `shadow-kit-inset`).
 *
 * 12px radius (`rounded-kit-control`): it floats inside a padded Card, not
 * concentric with it, so it keeps the control radius rather than pad − pad.
 * After the landing's pull-request recess (DeskAndPocket): 12px at the
 * sides (`kit-recess`), 10 top and bottom, and its lines stack 4px apart
 * (`kit-tight`), a header, a title and a sentence reading as one quote.
 */
export function Well({ as: As = "div", children }: WellProps) {
  return (
    <As
      data-slot="kit-well"
      className="flex flex-col gap-kit-tight rounded-kit-control bg-kit-well px-kit-recess py-kit-recess-y"
    >
      {children}
    </As>
  )
}
