import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Clock01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Friend } from "@/components/mascot/friend"

import { ICON_DENSE } from "./control-styles"

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
 * - `reading` — Quincy is working on it right now: the friend in its
 *   `reading` state, at the icons' 16px (docs/design/states.md, "Working";
 *   reduced motion holds a pose).
 * - `drafted` — done: the tick.
 * - `later` — put off: the clock.
 * - `failed` — nothing came of it: the alert glyph in muted ink, not red,
 *   because nothing was destroyed (states.md, "refused or failed").
 *
 * Not a pill-shaped surface despite the name: no fill, no ring, and no
 * green: working is the friend, never a pulsing dot or a fill.
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
        // The friend in the icons' 16px box, so a column of mixed states
        // lines its words up. Decorative: the word says it.
        <Friend size={16} state="reading" className="shrink-0" />
      ) : (
        <HugeiconsIcon icon={ICON[status]} {...ICON_DENSE} aria-hidden className="shrink-0" />
      )}
      <span className={hideWord ? "sr-only" : undefined}>{word}</span>
    </span>
  )
}
