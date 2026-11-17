"use client"

import { Alert02Icon, Clock01Icon, SentIcon, Tick02Icon } from "@hugeicons/core-free-icons"

import { SourceGlyph, StatusMark } from "@/components/kit"

import type { Item } from "./lineup-model"

/**
 * The small facts Lineup draws the same way on the calendar, in the pane
 * and in the Feed: the channel’s mark and a post’s state as a still glyph
 * and a word. Times are the kit’s `<Mono size="sm">`.
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

/**
 * The dashed ring an open slot is drawn with: a commitment with nothing in
 * it. StatusMark centres it in the icons' 16px box and hides it from
 * assistive tech.
 */
function OpenRing({ passed }: { passed: boolean }) {
  return <span className={`size-3 rounded-full border border-dashed ${passed ? "border-kit-ink-muted/45" : "border-kit-ink-muted"}`} />
}

const MARK = {
  sending: [SentIcon, "Sending"],
  published: [Tick02Icon, "Sent"],
  failed: [Alert02Icon, "Didn’t go"],
} as const

/**
 * An item's state as a still glyph and a word (the kit's StatusMark). A
 * queued post has none (it is the default). `hideWord` keeps the word for
 * assistive tech only, for a block too narrow for it.
 */
export function ScheduleMark({ item, hideWord = false }: { item: Item; hideWord?: boolean }) {
  if (item.kind === "post") {
    if (item.post.state === "queued") return null
    const [icon, word] = MARK[item.post.state]
    return <StatusMark icon={icon} hideWord={hideWord}>{word}</StatusMark>
  }
  if (item.kind === "open") {
    return (
      <StatusMark glyph={<OpenRing passed={item.passed} />} hideWord={hideWord}>
        {item.passed ? "Passed empty" : "Open"}
      </StatusMark>
    )
  }
  return <StatusMark icon={Clock01Icon} hideWord={hideWord}>No time</StatusMark>
}
