"use client"

import * as React from "react"

import { Bracket, Hand, MARGIN_SLOT } from "./bracket"
import { devWarn, objectOf } from "./dev-warn"
import { useInView } from "./use-in-view"

export type MarginNoteProps = {
  /** The handwritten note. A few words, lower case, Quincy's voice. */
  note: React.ReactNode
  /** The line or lines it is about. The block must reach the object's content edge. */
  children: React.ReactNode
  /**
   * Whether the note is written in. Default `true`. A transition, so flipping
   * it back retargets. Hidden notes are removed from the accessibility tree.
   */
  show?: boolean
  /**
   * `after-highlight` also waits until the line is on screen, then writes in
   * as the Highlight beneath it finishes its sweep.
   */
  timing?: "at-rest" | "after-highlight"
}

/**
 * A handwritten note in the margin beside the line(s) it wraps, with a
 * graphite bracket spanning them. The object needs the margin column free —
 * give the Card `width="with-margin"`. Not inside a `crop="corner"` card:
 * there is no margin left.
 *
 * It overflows its own box on purpose. Arrive does not clip the horizontal
 * axis, so a note inside an Arrive is safe.
 */
export function MarginNote({
  note,
  children,
  show = true,
  timing = "at-rest",
}: MarginNoteProps) {
  const [ref, seen] = useInView<HTMLDivElement>()
  const wait = timing === "after-highlight"
  const on = show && (!wait || seen)

  // Development only: where the note can and cannot go.
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const object = objectOf(ref.current)
    if (!object) return
    if (object.getAttribute("data-crop") === "corner") {
      devWarn("note-corner", 'a MarginNote inside crop="corner": there is no margin left for it.')
    } else if (object.getAttribute("data-width") !== "with-margin") {
      devWarn("note-width", 'a MarginNote in a full-width Card: give the Card width="with-margin", or the stage edge cuts the note off.')
    }
    if (object.querySelectorAll('[data-slot="kit-margin-note"]').length > 1) {
      devWarn("note-count", "two MarginNotes beside one object. One per object; two read as an argument.")
    }
  }, [ref])

  return (
    <div ref={ref} data-slot="kit-margin-note" className="relative">
      {children}
      <span
        aria-hidden={!on || undefined}
        data-on={on || undefined}
        className={`${MARGIN_SLOT} pointer-events-none -translate-x-1 opacity-0 select-none data-on:pointer-events-auto data-on:select-auto transition-[opacity,translate] duration-(--kit-duration-enter) ease-kit-out data-on:translate-x-0 data-on:opacity-100 motion-reduce:transition-none ${wait ? "data-on:delay-(--kit-delay-note)" : ""}`}
      >
        <Bracket tone="graphite" />
        <Hand tone="graphite">{note}</Hand>
      </span>
    </div>
  )
}
