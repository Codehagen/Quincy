import * as React from "react"

import { Kbd } from "./kbd"

/**
 * The workspace's foot (docs/design/workspace.md): the KeyBar, or a short
 * note with its Undo in the KeyBar's place while it lasts. Both are exactly
 * `kit-foot` (36) above the home indicator, so swapping one for the other
 * never moves the panes: a fixed height, not a minimum, and nothing in it
 * wraps (the last hints are clipped instead).
 */
export type FootBarProps = {
  children: React.ReactNode
  /**
   * Hide the whole foot on touch, where there are no keys (the KeyBar does).
   * A foot holding an Undo stays.
   */
  hideOnTouch?: boolean
  /** A role and name for the strip, when it is more than a row of controls. */
  role?: "note"
  "aria-label"?: string
}

export function FootBar({ children, hideOnTouch = false, ...aria }: FootBarProps) {
  return (
    <div
      {...aria}
      data-slot="kit-foot-bar"
      className={
        "box-content flex h-kit-foot shrink-0 items-center gap-kit-related overflow-hidden border-t border-kit-hairline " +
        "pb-[env(safe-area-inset-bottom,0px)] ps-[max(var(--spacing-kit-group),env(safe-area-inset-left,0px))] pe-[max(var(--spacing-kit-group),env(safe-area-inset-right,0px))] " +
        (hideOnTouch ? "pointer-coarse:hidden" : "")
      }
    >
      {children}
    </div>
  )
}

export type KeyBarItem = {
  /** The keys, as they are typed: `["j", "k"]` for "j or k", `["D"]`. */
  keys: readonly string[]
  /** What they do, in one or two words: "Move", "Not this one". */
  label: string
}

export type KeyBarProps = {
  keys: readonly KeyBarItem[]
}

/**
 * The keys a surface answers to, along its foot: 18px caps and a muted
 * word each. Hidden on touch, where there are no keys.
 *
 * Exposed to assistive tech once, in words: the strip is a note named
 * "Keyboard shortcuts", and each entry reads "j or k: Move". The caps are
 * drawn for the eye and hidden. The keys themselves are also on the
 * controls they press (`aria-keyshortcuts` on the list, the search, a
 * Button's `shortcut`), so this is the summary, not the only place.
 */
export function KeyBar({ keys }: KeyBarProps) {
  return (
    <FootBar role="note" aria-label="Keyboard shortcuts" hideOnTouch>
      <span data-slot="kit-key-bar" className="flex min-w-0 items-center gap-x-kit-group">
        {keys.map((item) => (
          <span
            key={item.keys.join(" ")}
            className="inline-flex shrink-0 items-center gap-1.5 text-kit-meta whitespace-nowrap text-kit-ink-muted"
          >
            <span className="sr-only">{`${item.keys.join(" or ")}: `}</span>
            <span className="inline-flex gap-0.5">
              {item.keys.map((k) => (
                <Kbd key={k} keys={[k]} size="sm" decorative />
              ))}
            </span>
            {item.label}
          </span>
        ))}
      </span>
    </FootBar>
  )
}
