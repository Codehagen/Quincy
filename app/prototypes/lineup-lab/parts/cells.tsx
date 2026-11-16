"use client"

import * as React from "react"

import { SourceGlyph, StatusPill } from "@/components/kit"

import { CHANNEL_LABEL, type Channel } from "../data"
import { openingOf, type Item } from "../use-lineup"

/**
 * The small facts every layout draws the same way: the channel's mark, the
 * state of a row in two words with the kit's four marks, and what a row is
 * called by. Waiting (queued) is the default and has no mark, as on Drafts.
 */

export function ChannelGlyph({ channel }: { channel: Channel }) {
  return (
    <span className="inline-flex shrink-0 text-kit-ink-muted">
      <SourceGlyph id={channel} size="dense" />
      <span className="sr-only">{CHANNEL_LABEL[channel]}</span>
    </span>
  )
}

/** The dashed ring an open slot is drawn with: a commitment with nothing in it. */
export function OpenRing({ passed = false }: { passed?: boolean }) {
  return (
    <span aria-hidden className="grid size-4 shrink-0 place-items-center">
      <span className={`size-3 rounded-full border border-dashed ${passed ? "border-kit-ink-muted/60" : "border-kit-ink-muted"}`} />
    </span>
  )
}

export function StateMark({ item, hideWord = false }: { item: Item; hideWord?: boolean }) {
  if (item.kind === "open") {
    return (
      <span className="inline-flex items-center gap-1.5 text-kit-meta whitespace-nowrap text-kit-ink-muted">
        <OpenRing passed={item.passed} />
        <span className={hideWord ? "sr-only" : undefined}>{item.passed ? "Passed empty" : "Open"}</span>
      </span>
    )
  }
  if (item.kind === "stranded") {
    return (
      <StatusPill status="later" hideWord={hideWord}>
        No time
      </StatusPill>
    )
  }
  const s = item.post.state
  if (s === "sending") return <StatusPill status="reading" hideWord={hideWord}>Sending</StatusPill>
  if (s === "published") return <StatusPill status="drafted" hideWord={hideWord}>Sent</StatusPill>
  if (s === "failed") return <StatusPill status="failed" hideWord={hideWord}>{"Didn't go"}</StatusPill>
  return null
}

/** What a row says: the post's opening line, or the slot it stands for. */
export function titleOf(item: Item) {
  if (item.kind === "post") return openingOf(item.post.body)
  if (item.kind === "stranded") return openingOf(item.s.body)
  return item.passed ? `${CHANNEL_LABEL[item.channel]} slot, passed with nothing in it` : `Open ${CHANNEL_LABEL[item.channel]} slot`
}

/** Settled rows (sent, passed) recede; they stay, so you can check that they happened. */
export function isSettled(item: Item) {
  return (item.kind === "post" && item.post.state === "published") || (item.kind === "open" && item.passed)
}

export function Mono({ children, muted = true }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={`font-kit-mono text-kit-mono-sm tabular-nums ${muted ? "text-kit-ink-muted" : "text-kit-ink"}`}>{children}</span>
}
