import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Clock01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { ICON_DENSE } from "./control-styles"
import { LiveDot } from "./live-dot"

export type StatusPillStatus = "reading" | "drafted" | "later" | "failed"

const WORD: Record<StatusPillStatus, string> = {
  reading: "Reading",
  drafted: "Drafted",
  later: "Later",
  failed: "No post",
}

const ICON = { drafted: Tick02Icon, later: Clock01Icon, failed: Alert02Icon } as const

export type StatusPillProps = {
  status: StatusPillStatus
  /**
   * The word, when the default does not fit the row ("Reading", "Drafted",
   * "Later", "No post"). Keep it one or two words.
   */
  children?: string
  /**
   * Draw the mark alone and give the word to assistive tech only, for a
   * column too narrow for it. The word is never dropped, only hidden.
   */
  hideWord?: boolean
}

/**
 * A row's state as one mark and one word, in muted meta text, in a DataList
 * cell or a dense row's meta line. Waiting is the default and has no pill:
 * render nothing for it.
 *
 * - `reading` — Quincy is working on it right now: the LiveDot, pulsing (the
 *   only live thing on the row; reduced motion keeps the dot, drops the ring).
 * - `drafted` — done: the tick.
 * - `later` — put off: the clock.
 * - `failed` — nothing came of it: the alert glyph in muted ink, not red,
 *   because nothing was destroyed (states.md, "refused or failed").
 *
 * Not a pill-shaped surface despite the name: no fill, no ring. Live is a
 * dot, never a fill (decisions.md, Never).
 */
export function StatusPill({ status, children, hideWord = false }: StatusPillProps) {
  const word = children ?? WORD[status]
  return (
    <span
      data-slot="kit-status-pill"
      data-status={status}
      className="inline-flex items-center gap-1.5 text-kit-meta whitespace-nowrap text-kit-ink-muted tabular-nums"
    >
      {status === "reading" ? (
        // The dot centred in the icons' 16px box, so a column of mixed
        // states lines its words up.
        <span aria-hidden className="grid size-4 shrink-0 place-items-center">
          <LiveDot pulse />
        </span>
      ) : (
        <HugeiconsIcon icon={ICON[status]} {...ICON_DENSE} aria-hidden className="shrink-0" />
      )}
      <span className={hideWord ? "sr-only" : undefined}>{word}</span>
    </span>
  )
}
