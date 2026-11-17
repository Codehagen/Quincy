"use client"

import * as React from "react"
import { Alert02Icon, Clock01Icon, SentIcon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ICON_DENSE, SourceGlyph } from "@/components/kit"

import type { Item } from "./lineup-model"

/**
 * The small facts Lineup draws the same way on the calendar, in the pane
 * and in the Feed: the channel's mark, a time in mono, and a post's state
 * as a still glyph and a word.
 *
 * **No green, no blink** on this page (the owner, 2026-11-16: "fjern den
 * grønne blinken"). Sending is a still glyph and its word, like Sent and
 * Didn’t go; "now" is ink. Elsewhere, working is the friend (states.md).
 */

export function ChannelGlyph({ channel, label }: { channel: string; label: string }) {
  return (
    <span className="inline-flex shrink-0 text-kit-ink-muted">
      <SourceGlyph id={channel} size="dense" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** A time, tabular, so a column of them reads as one. Ink when it is the news. */
export function TimeText({ children, ink = false }: { children: React.ReactNode; ink?: boolean }) {
  return <span className={`font-kit-mono text-kit-mono-sm tabular-nums ${ink ? "text-kit-ink" : "text-kit-ink-muted"}`}>{children}</span>
}

/** The dashed ring an open slot is drawn with: a commitment with nothing in it. */
function OpenRing({ passed }: { passed: boolean }) {
  return (
    <span aria-hidden className="grid size-4 shrink-0 place-items-center">
      <span className={`size-3 rounded-full border border-dashed ${passed ? "border-kit-ink-muted/45" : "border-kit-ink-muted"}`} />
    </span>
  )
}

const MARK = {
  sending: [SentIcon, "Sending"],
  published: [Tick02Icon, "Sent"],
  failed: [Alert02Icon, "Didn’t go"],
} as const

/**
 * An item's state as a still glyph and a word, in muted meta text. A queued
 * post has none (it is the default). `hideWord` keeps the word for
 * assistive tech only, for a block too narrow for it.
 */
export function ScheduleMark({ item, hideWord = false }: { item: Item; hideWord?: boolean }) {
  let glyph: React.ReactNode
  let word: string
  if (item.kind === "post") {
    if (item.post.state === "queued") return null
    const [icon, w] = MARK[item.post.state]
    glyph = <HugeiconsIcon icon={icon} {...ICON_DENSE} aria-hidden className="shrink-0" />
    word = w
  } else if (item.kind === "open") {
    glyph = <OpenRing passed={item.passed} />
    word = item.passed ? "Passed empty" : "Open"
  } else {
    glyph = <HugeiconsIcon icon={Clock01Icon} {...ICON_DENSE} aria-hidden className="shrink-0" />
    word = "No time"
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-kit-meta whitespace-nowrap text-kit-ink-muted">
      {glyph}
      <span className={hideWord ? "sr-only" : undefined}>{word}</span>
    </span>
  )
}
