"use client"

import * as React from "react"

import { useModKey } from "./use-mod-key"

/**
 * A key in a shortcut. `"mod"` is the platform's modifier: ⌘ on Apple, Ctrl
 * elsewhere, read after mount (useModKey), so the server and the first
 * client render agree on "Ctrl" and nothing is ever hardcoded. Handlers must
 * still accept both metaKey and ctrlKey; only the hint chooses. `shift`,
 * `alt` and `enter` follow the same platform: ⇧ ⌥ ↵ on Apple, "Shift",
 * "Alt", "Enter" elsewhere.
 */
export type KbdKey = "mod" | "shift" | "alt" | "enter" | "esc" | (string & {})

// Apple writes the modifiers as symbols; Windows and Linux spell them out
// ("Ctrl+Shift+Alt"), and there is no Option key to show them.
const SHOWN_APPLE: Record<string, string> = {
  shift: "⇧",
  alt: "⌥",
  enter: "↵",
  esc: "Esc",
}

const SHOWN_OTHER: Record<string, string> = {
  shift: "Shift",
  alt: "Alt",
  enter: "Enter",
  esc: "Esc",
}

const SPOKEN_APPLE: Record<string, string> = {
  "⌘": "Command",
  shift: "Shift",
  alt: "Option",
  enter: "Enter",
  esc: "Escape",
}

const SPOKEN_OTHER: Record<string, string> = {
  Ctrl: "Control",
  shift: "Shift",
  alt: "Alt",
  enter: "Enter",
  esc: "Escape",
}

export type KbdProps = {
  /** The keys, in the order they are pressed: `["mod", "B"]`. */
  keys: readonly KbdKey[]
  /**
   * `md` (default) is a 20px cap beside body text and in a Tooltip. `sm` is
   * 18px, for a workspace: a cap at the end of a 28/32 Button, the "/" in
   * a SearchField, the KeyBar.
   */
  size?: "md" | "sm"
  /**
   * `muted` (default): muted letter in the inset ring, on any light
   * surface. `on-ink`: the ground at a low alpha behind the primary-on
   * letter, for a cap on the ink pill (Button variant="action"). A Tooltip
   * re-colours its caps itself.
   */
  tone?: "muted" | "on-ink"
  /**
   * Hide the whole cap from assistive tech, words included. Only where the
   * key is already said once: a Button's `aria-keyshortcuts`, or a KeyBar's
   * own sentence. Default false: a Kbd in prose is read ("Command+B").
   */
  decorative?: boolean
}

const CAP_SIZE = {
  md: "h-5 min-w-5",
  sm: "h-4.5 min-w-4.5",
} as const

const CAP_TONE = {
  muted: "text-kit-ink-muted shadow-kit-inset",
  "on-ink": "bg-kit-kbd-on-ink text-kit-primary-on",
} as const

/**
 * The keys as small caps with the inset ring, after the landing's "Next"
 * chips (Tag's ring, 20px tall, the 6px chip radius). Muted on the object; inside a
 * Tooltip the ink chip re-colours them. Screen readers hear the words
 * ("Command+B"), not the symbols.
 */
export function Kbd({ keys, size = "md", tone = "muted", decorative = false }: KbdProps) {
  const mod = useModKey()
  const apple = mod === "⌘"
  const shown = apple ? SHOWN_APPLE : SHOWN_OTHER
  const said = apple ? SPOKEN_APPLE : SPOKEN_OTHER
  const caps = keys.map((k) => (k === "mod" ? mod : (shown[k] ?? k)))
  const spoken = keys
    .map((k, i) => (k === "mod" ? said[mod] : (said[k] ?? caps[i])))
    .join("+")
  return (
    <kbd
      data-slot="kit-kbd"
      data-size={size}
      aria-hidden={decorative || undefined}
      className="inline-flex items-center gap-0.5 font-kit-sans not-italic"
    >
      {decorative ? null : <span className="sr-only">{spoken}</span>}
      {caps.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className={`inline-grid place-items-center rounded-kit-chip px-kit-tight text-kit-kbd font-kit-strong select-none ${CAP_SIZE[size]} ${CAP_TONE[tone]}`}
        >
          {c}
        </span>
      ))}
    </kbd>
  )
}
