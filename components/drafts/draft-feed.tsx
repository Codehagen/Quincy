"use client"

import * as React from "react"

import { BeatBracket, Beats, MarginNote } from "@/components/kit"
import { missingBeatNote, paragraphsOf, readBeats, type Paragraph } from "@/lib/draft-beats"
import { CHANNEL_RULES, feedCut } from "@/lib/post-length"

import { FeedColumn, FeedPost, FeedSkeleton, FeedThread, type FeedPlatform } from "./feed/feed"

/**
 * A draft's version drawn as its platform's feed, with Quincy's reading of
 * it in the margin (decided on /prototypes/drafts-lab, round 2, "C · Feed").
 * The feed parts are in ./feed; this file is what Quincy adds to them: the
 * words with the fold drawn where the feed cuts, and the beat brackets or
 * the missing-beat note beside the lines they mean.
 */

/**
 * Who the post is from, as the platform would show it: the connected
 * channel's account. `handle` is without the "@", and null when the channel
 * stores none (LinkedIn has no handle); the header then shows the name
 * alone, never an invented handle. `headline` is LinkedIn's line under the
 * name; nothing stores it today, so it is null.
 */
export type FeedAccount = {
  name: string
  handle: string | null
  initials: string
  avatarUrl: string | null
  headline: string | null
}

/** The field state of a version being edited: one text per post. */
export type FeedField = {
  posts: string[]
  set: (i: number, t: string) => void
  onKey: (e: React.KeyboardEvent) => void
} | null

const BEATS = ["did", "happened", "meant"] as const

/**
 * The draft's posts as the platform's feed, a blank skeleton neighbour above
 * and below. Reading: the words with their fold and Quincy's marks. Editing:
 * each post's words as its field.
 *
 * `posts` is one text today: a version is one body, and nothing in lib/ has
 * a thread shape. The parts already draw a thread (stacked posts joined
 * avatar to avatar, one beat bracket per post when three posts make the
 * three beats), so when drafting stores threads, this is the seam: pass the
 * posts here, and the field gives one textarea per post.
 */
export function DraftFeed({
  platform,
  account,
  posts,
  writing,
  field,
  onStartEdit,
}: {
  platform: FeedPlatform
  account: FeedAccount
  posts: string[]
  /** Still a decision: only then does the missing-beat note show. */
  writing: boolean
  field: FeedField
  onStartEdit?: () => void
}) {
  const shown = platform === "linkedin" ? posts.slice(0, 1) : posts
  const threadBeats = !field && shown.length === 3 && readBeats(shown.join("\n\n")) != null
  const label = platform === "x" ? "X" : "LinkedIn"
  const items = shown.map((p, i) => {
    const post = (
      <FeedPost key={i} initials={account.initials} avatarUrl={account.avatarUrl}>
        <FeedPost.Header
          name={account.name}
          handle={platform === "x" ? (account.handle ?? undefined) : undefined}
          headline={platform === "linkedin" ? (account.headline ?? undefined) : undefined}
        />
        <FeedPost.Body>
          {field ? (
            <FeedPost.Field
              value={field.posts[i]!}
              onValueChange={(t) => field.set(i, t)}
              onKeyDown={field.onKey}
              autoFocus={i === 0}
              aria-label={shown.length > 1 ? `Post ${i + 1} of ${shown.length} for ${label}` : `Text for ${label}`}
            />
          ) : (
            <FeedText text={p} channel={platform} marks={!threadBeats} note={writing} onStartEdit={onStartEdit} />
          )}
        </FeedPost.Body>
        <FeedPost.Actions />
      </FeedPost>
    )
    return threadBeats ? (
      <BeatBracket key={i} beat={BEATS[i]!}>
        {post}
      </BeatBracket>
    ) : (
      post
    )
  })
  const thread = <FeedThread>{items}</FeedThread>
  return (
    <FeedColumn platform={platform}>
      {platform === "x" ? (
        <FeedColumn.Tabs>
          <FeedColumn.Tab current>For you</FeedColumn.Tab>
          <FeedColumn.Tab>Following</FeedColumn.Tab>
        </FeedColumn.Tabs>
      ) : null}
      <FeedSkeleton />
      {threadBeats ? <Beats>{thread}</Beats> : thread}
      <FeedSkeleton />
    </FeedColumn>
  )
}

/* ── The words: read with the fold and Quincy's marks ─────────────────── */

type Placed = { text: string; start: number; end: number }

/** Each line of each paragraph with where it sits in the text, so the cut can be found on a line. */
function placed(text: string, paras: Paragraph[]): Placed[][] {
  let at = 0
  return paras.map((p) =>
    p.map((l) => {
      const start = Math.max(at, text.indexOf(l.text, at))
      at = start + l.text.length
      return { text: l.text, start, end: at }
    })
  )
}

/**
 * The post's words as the feed shows them: real line breaks, the number on
 * its own line, the platform's own "Show more" / "…more" where it truncates,
 * then (for you only) a fold line and the rest. `feedCut` decides the cut,
 * the same answer the fold notice under the column reads.
 *
 * The marks, per editor-marks.md: three beat brackets when `readBeats`
 * finds the story, and otherwise, while the draft is still waiting, one
 * note naming the beat that is missing (`missingBeatNote`). Never a guessed
 * bracket, and never a note on a decided draft.
 *
 * Only a click on a line of words opens the field: not one on a bracket,
 * a note or the gap between paragraphs.
 */
export function FeedText({
  text,
  channel,
  marks,
  note,
  onStartEdit,
}: {
  text: string
  channel: string
  /** Off when the thread around this post is already bracketed beat by beat. */
  marks: boolean
  /** The missing-beat note may show (the draft is still waiting). */
  note: boolean
  onStartEdit?: () => void
}) {
  const paras = paragraphsOf(text)
  const cut = feedCut(text, channel)
  const foldAt = cut.kind ? cut.visible.replace(/\s+$/, "").length : null
  const rows = placed(text, paras)
  const firstCut = foldAt == null ? null : (rows.flat().find((l) => l.end > foldAt) ?? null)

  const para = (lines: Placed[], key: number) => (
    <div key={key}>
      {lines.map((l, i) => {
        if (foldAt == null || l.end <= foldAt) return <p key={i}>{l.text}</p>
        if (l !== firstCut)
          return (
            <p key={i} className="feed-behind">
              {l.text}
            </p>
          )
        const split = Math.max(0, foldAt - l.start)
        return (
          <React.Fragment key={i}>
            {split > 0 ? (
              <p>
                {l.text.slice(0, split).replace(/\s+$/, "")}
                {cut.kind === "fold" ? " " : null}
                {cut.kind === "fold" ? <FeedPost.More /> : null}
              </p>
            ) : null}
            {cut.kind === "limit" ? <FeedPost.More /> : null}
            <FeedPost.Fold>
              {cut.kind === "fold" ? "The feed cuts here" : `Stops at ${CHANNEL_RULES[channel]?.limit}. The rest won't post`}
            </FeedPost.Fold>
            <p className="feed-behind">{l.text.slice(split).replace(/^\s+/, "")}</p>
          </React.Fragment>
        )
      })}
    </div>
  )

  const beats = marks ? readBeats(text) : null
  let body: React.ReactNode
  if (beats) {
    body = (
      <Beats>
        <div className="feed-paras">
          {BEATS.map((beat, i) => (
            <BeatBracket key={beat} beat={beat}>
              {para(rows[i]!, i)}
            </BeatBracket>
          ))}
        </div>
      </Beats>
    )
  } else {
    const mark = marks && note ? missingBeatNote(paras) : null
    const list = rows.map((r, i) =>
      mark && mark.at === i ? (
        <MarginNote key={i} note={mark.note}>
          {para(r, i)}
        </MarginNote>
      ) : (
        para(r, i)
      )
    )
    body =
      mark && mark.at === "all" ? (
        <MarginNote note={mark.note}>
          <div className="feed-paras">{list}</div>
        </MarginNote>
      ) : (
        <div className="feed-paras">{list}</div>
      )
  }
  return (
    <div
      className={`feed-text ${onStartEdit ? "cursor-text" : ""}`}
      onClick={onStartEdit ? (e) => ((e.target as HTMLElement).closest("p") ? onStartEdit() : undefined) : undefined}
    >
      {body}
    </div>
  )
}
