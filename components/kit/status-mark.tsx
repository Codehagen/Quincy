import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Alert02Icon, Clock01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Friend } from "@/components/mascot/friend"

import { ICON_DENSE } from "./control-styles"

export type StatusMarkStatus = "reading" | "drafted" | "later" | "failed"

const WORD: Record<StatusMarkStatus, string> = {
  reading: "Reading",
  drafted: "Drafted",
  later: "Later",
  failed: "No post",
}

const ICON = { drafted: Tick02Icon, later: Clock01Icon, failed: Alert02Icon } as const

type StatusMarkBase = Omit<React.ComponentProps<"span">, "children"> & {
  /** `muted` (default), or `ink` when the state is the news. */
  tone?: "muted" | "ink"
  /**
   * Draw the mark alone and give the word to assistive tech only, for a
   * column too narrow for it. The word is never dropped, only hidden.
   */
  hideWord?: boolean
}

/** One of the four kit states, with its own mark and default word. */
type StatusMarkPreset = StatusMarkBase & {
  status: StatusMarkStatus
  /**
   * The word, when the default does not fit the row ("Reading", "Drafted",
   * "Later", "No post"). Keep it one or two words.
   */
  children?: string
  icon?: never
  glyph?: never
}

/** Any hugeicon, drawn at the dense size. The word is required. */
type StatusMarkIcon = StatusMarkBase & {
  icon: IconSvgElement
  children: string
  status?: never
  glyph?: never
}

/**
 * A mark of the caller's own (a dashed ring, a dot). It is centred in the
 * icons' 16px box, so a column of mixed marks lines its words up, and it
 * is hidden from assistive tech: the word says it.
 */
type StatusMarkGlyph = StatusMarkBase & {
  glyph: React.ReactNode
  children: string
  status?: never
  icon?: never
}

export type StatusMarkProps = StatusMarkPreset | StatusMarkIcon | StatusMarkGlyph

/**
 * A row's state as one mark and one word, in meta text, in a DataList cell
 * or a dense row's meta line. Waiting is the default and has no mark:
 * render nothing for it.
 *
 * Either a preset `status` or a mark of your own (`icon` or `glyph`),
 * never both:
 *
 * - `reading`: Quincy is working on it right now: the friend in its
 *   `reading` state, at the icons' 16px (docs/design/states.md, "Working";
 *   reduced motion holds a pose).
 * - `drafted`: done: the tick.
 * - `later`: put off: the clock.
 * - `failed`: nothing came of it: the alert glyph in muted ink, not red,
 *   because nothing was destroyed (states.md, "refused or failed").
 *
 * No fill, no ring, and no green: working is the friend, never a pulsing
 * dot or a fill.
 */
export function StatusMark(props: StatusMarkProps) {
  const { status, icon, glyph, children, tone = "muted", hideWord = false, className, ...rest } = props
  const word = children ?? (status ? WORD[status] : "")

  let mark: React.ReactNode
  if (status === "reading") {
    // The friend in the icons' 16px box. Decorative: the word says it.
    mark = <Friend size={16} state="reading" className="shrink-0" />
  } else if (status) {
    mark = <HugeiconsIcon icon={ICON[status]} {...ICON_DENSE} aria-hidden className="shrink-0" />
  } else if (icon) {
    mark = <HugeiconsIcon icon={icon} {...ICON_DENSE} aria-hidden className="shrink-0" />
  } else {
    mark = (
      <span aria-hidden className="grid size-4 shrink-0 place-items-center">
        {glyph}
      </span>
    )
  }

  return (
    <span
      data-slot="kit-status-mark"
      data-status={status}
      {...rest}
      className={`inline-flex items-center gap-1.5 text-kit-meta whitespace-nowrap tabular-nums ${tone === "ink" ? "text-kit-ink" : "text-kit-ink-muted"} ${className ?? ""}`}
    >
      {mark}
      <span className={hideWord ? "sr-only" : undefined}>{word}</span>
    </span>
  )
}
