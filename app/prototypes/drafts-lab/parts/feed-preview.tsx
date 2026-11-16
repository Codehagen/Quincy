"use client"

import * as React from "react"

import { CHANNEL_RULES, countGraphemes, splitAtFold } from "@/lib/post-length"

import { LAB_ACCOUNT, type LabVersion } from "../data"

/**
 * Preview: the version as it reads in its feed, drawn in the kit (an object
 * on the ground, kit type and hairlines), never in the platform's own UI,
 * logo or colours. Read-only; editing happens in Marked up.
 *
 * What it shows is what a reader decides on: the account, the text with its
 * real line breaks (the number on its own line stays on its own line), and
 * where the feed stops showing it. No counts of any kind: a post that has
 * not gone out has none, and a fake one is a vanity number (vision.md).
 */

export type FeedCut = {
  visible: string
  hidden: string
  /** `fold`: the feed hides the rest behind "more". `limit`: the platform will not take the rest. */
  kind: "fold" | "limit" | null
}

/** Lines a collapsed LinkedIn post shows before "…more" (a blank line is a line). */
const FOLD_LINES = 3

function graphemeIndex(text: string, n: number): number | null {
  let seen = 0
  for (const seg of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    if (seen === n) return seg.index
    seen++
  }
  return null
}

/**
 * Where the feed cuts this text, said once for the drawing and the notice so
 * the two can never disagree. A fold channel (LinkedIn) cuts at the lib's
 * character fold (CHANNEL_RULES: 140, the app's number, the safer of ~140 and
 * ~210) or after three lines, whichever comes first. X has no fold: a post
 * renders whole, so the only cut is the limit, when the text is over it.
 */
export function feedCut(text: string, channel: string): FeedCut {
  const rules = CHANNEL_RULES[channel]
  if (rules?.fold != null) {
    const byChars = splitAtFold(text, channel)
    const lines = text.split("\n")
    const byLines = lines.length > FOLD_LINES ? lines.slice(0, FOLD_LINES).join("\n").length : null
    let at = Math.min(byChars.hidden ? byChars.visible.length : Infinity, byLines ?? Infinity)
    if (at === Infinity || text.slice(at).trim() === "") return { visible: text, hidden: "", kind: null }
    // A feed folds between words: back up to the last space when the cut lands inside one.
    if (/\S/.test(text[at - 1] ?? "") && /\S/.test(text[at] ?? "")) {
      const space = text.slice(0, at).search(/\s\S*$/)
      if (space > 0) at = space
    }
    return { visible: text.slice(0, at), hidden: text.slice(at), kind: "fold" }
  }
  if (rules?.limit != null && countGraphemes(text) > rules.limit) {
    const at = graphemeIndex(text, rules.limit)
    if (at != null) return { visible: text.slice(0, at), hidden: text.slice(at), kind: "limit" }
  }
  return { visible: text, hidden: "", kind: null }
}

export function FeedPreview({ v, text }: { v: LabVersion; text: string }) {
  const cut = feedCut(text, v.channel)
  return (
    <figure
      aria-label={`How the ${v.label} version reads in the feed`}
      className="flex gap-3 rounded-kit-object bg-kit-object p-4 shadow-kit-object"
    >
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-kit-well font-kit-strong text-kit-small text-kit-ink-muted shadow-kit-inset select-none"
      >
        {LAB_ACCOUNT.initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <figcaption className="flex min-w-0 items-baseline gap-1.5 text-kit-dense">
          <span className="truncate font-kit-strong text-kit-ink">{LAB_ACCOUNT.name}</span>
          <span className="truncate text-kit-ink-muted">{`@${LAB_ACCOUNT.handle}`}</span>
          <span aria-hidden className="text-kit-ink-muted">·</span>
          <span className="shrink-0 text-kit-ink-muted">not posted</span>
        </figcaption>
        <p className="dl-prose whitespace-pre-line">
          {cut.visible.replace(/\s+$/, "")}
          {cut.kind === "fold" ? <span className="text-kit-ink-muted">{"…more"}</span> : null}
        </p>
        {cut.kind ? (
          <div className="flex flex-col gap-1 pt-1">
            <div className="flex items-center gap-2 text-kit-meta text-kit-ink-muted">
              <span className="h-px flex-1 border-t border-dashed border-kit-ink-muted" />
              <span className="shrink-0">{cut.kind === "fold" ? "The feed cuts here" : `${v.label} stops at ${CHANNEL_RULES[v.channel]?.limit}. The rest won't post`}</span>
            </div>
            {/* Behind the cut, for you only: what a reader sees after "more", or never. */}
            <p className="dl-prose dl-behind whitespace-pre-line">{cut.hidden.replace(/^\s+/, "")}</p>
          </div>
        ) : null}
      </div>
    </figure>
  )
}
