"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  Bookmark01Icon,
  Clock01Icon,
  Image01Icon,
  Mail01Icon,
  Mic01Icon,
  PauseIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import { GlyphTile, LiveDot } from "@/components/kit"
import { ICON_DENSE } from "@/components/kit/control-styles"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"

import type { Connector } from "../data"
import type { LabOptions } from "../lab-options"

const MATERIAL: Record<string, IconSvgElement> = {
  voice: Mic01Icon,
  email: Mail01Icon,
  photos: Image01Icon,
  bookmarks: Bookmark01Icon,
}

/** The 36px tile: the brand's own mark, monochrome, or a material icon. */
export function Glyph({ c }: { c: Connector }) {
  const quiet = c.status.s === "soon"
  return (
    <GlyphTile
      label={c.name}
      quiet={quiet}
      icon={MATERIAL[c.glyph]}
      mark={hasPlatformMark(c.glyph) ? <PlatformMark platform={c.glyph} size={16} /> : undefined}
    />
  )
}

/** The id of a card's name, so a repeated control ("Connect") can say which. */
export function nameId(c: Connector, scope: string) {
  return `${scope}-${c.id}-name`
}

/**
 * The connection, as one mark and one or two words, at the card's top right.
 *
 * Connected is the reference's pill translated: the quiet grey (the well) in
 * place of its pale green, and the live dot in place of its green dot, so
 * live stays a dot and never a fill. Everything else is StatusMark's
 * register: a glyph in muted ink and a word, no fill. Failed and reauth say
 * their word in ink (the one state that should interrupt), never red.
 */
export function StatusChip({ c, opts }: { c: Connector; opts: LabOptions }) {
  const st = c.status
  if (st.s === "connected") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-kit-well px-2.5 text-kit-meta whitespace-nowrap text-kit-ink-muted">
        {opts.mark === "dot" ? <LiveDot /> : null}
        Connected
      </span>
    )
  }
  const item = (icon: IconSvgElement, word: string, ink = false) => (
    <span className={`inline-flex h-6 items-center gap-1.5 text-kit-meta whitespace-nowrap ${ink ? "text-kit-ink" : "text-kit-ink-muted"}`}>
      <HugeiconsIcon icon={icon} {...ICON_DENSE} aria-hidden className="shrink-0" />
      {word}
    </span>
  )
  switch (st.s) {
    case "waiting":
      return item(Clock01Icon, "Nothing yet")
    case "paused":
      return item(PauseIcon, "Paused")
    case "failed":
      return item(Alert02Icon, "Stopped", true)
    case "reauth":
      return item(Alert02Icon, "Reconnect", true)
    case "setup":
      return item(Clock01Icon, "Half set up", true)
    case "builtin":
      return <span className="text-kit-meta whitespace-nowrap text-kit-ink-muted">Built in</span>
    case "soon":
      return <span className="text-kit-meta whitespace-nowrap text-kit-ink-muted">Later</span>
    default:
      return null
  }
}

/** Lab only: marks a control with nothing behind it yet, while "Mark proposed" is on. */
export function Proposed({ show, why }: { show: boolean; why?: string }) {
  if (!show) return null
  return (
    <span
      title={why}
      className="inline-flex h-4 items-center rounded-kit-chip px-1 font-kit-mono text-kit-mono-sm whitespace-nowrap text-kit-ink-muted shadow-kit-inset"
    >
      proposed
    </span>
  )
}

/** The state as the sentence a person reads (states.md): first person, the fact, no red. */
export function stateSentence(c: Connector): string {
  const st = c.status
  switch (st.s) {
    case "connected":
      return c.kind === "channel" ? `I can publish here. ${st.last}.` : `Reading. ${st.last}.`
    case "waiting":
      return `Connected ${st.since}. Nothing has come through yet.`
    case "setup":
      return st.step
    case "failed":
    case "reauth":
      return st.why
    case "paused":
      return `Paused on ${c.name}'s side. ${st.last}.`
    case "available":
      return c.kind === "channel" ? "Not connected. Nothing goes out without your approval." : "Not connected. Connecting never posts anything."
    case "needs":
      return `Comes with ${st.onName}. Connect ${st.onName} first.`
    case "builtin":
      return "Part of Quincy. Nothing to connect."
    case "soon":
      return c.kind === "channel" ? "I can't publish here yet." : "I can't read this yet, and nothing would read it if I could."
  }
}

/** The card's one verb in the footer or the top right, when it has one. */
export function primaryLabel(c: Connector): string | null {
  const st = c.status
  switch (st.s) {
    case "available":
      return c.id === "github" ? "Install" : "Connect"
    case "needs":
      return `Connect ${st.onName}`
    case "failed":
    case "reauth":
      return st.fix
    case "setup":
      return "Finish setup"
    default:
      return null
  }
}
