"use client"

import * as React from "react"

import { CHANNEL_RULES } from "@/lib/post-length"

import { FeedColumn, FeedPost, FeedSkeleton } from "../../drafts-lab/parts/feed/feed"
import { feedCut } from "../../drafts-lab/parts/feed-preview"
import { ACCOUNT, CHANNEL_LABEL, NOW, type Channel, type LabPost } from "../data"
import { whenLabel } from "../use-lineup"

/**
 * The post as the feed will show it, on the parts Drafts picked
 * (drafts-lab parts/feed: C · Feed, "Bra med feed"). Read-only here: a
 * post on Lineup is approved writing, and the words are changed on Drafts
 * (lib/lineup.ts: "showing it here would make this a second Drafts with
 * worse editing"). The platform's look stays inside the column; the time,
 * the state and the verbs stay outside it, in the kit.
 */

/** X's "now", "5h"; LinkedIn's "now", "5h". The time it went out, or "now" for one that has not. */
export function feedTime(p: LabPost) {
  if (p.state !== "published" || p.dayId !== NOW.dayId) return "now"
  const [h, m] = p.time.split(":").map(Number)
  const [nh, nm] = NOW.time.split(":").map(Number)
  const min = nh! * 60 + nm! - (h! * 60 + m!)
  return min < 60 ? `${Math.max(1, min)}m` : `${Math.floor(min / 60)}h`
}

/** The words, with the platform's own "Show more" / "…more" and, for you only, where the feed cuts. */
export function PostWords({ text, channel }: { text: string; channel: Channel }) {
  const cut = feedCut(text, channel)
  const shown = cut.kind ? cut.visible.replace(/\s+$/, "") : text
  const paras = shown.split(/\n{2,}/)
  return (
    <div className="feed-text">
      <div className="feed-paras">
        {paras.map((p, i) => (
          <p key={i}>
            {p}
            {cut.kind === "fold" && i === paras.length - 1 ? (
              <>
                {" "}
                <FeedPost.More />
              </>
            ) : null}
          </p>
        ))}
      </div>
      {cut.kind ? (
        <>
          {cut.kind === "limit" ? <FeedPost.More /> : null}
          <FeedPost.Fold>{cut.kind === "fold" ? "The feed cuts here" : `Stops at ${CHANNEL_RULES[channel]?.limit}. The rest won't post`}</FeedPost.Fold>
          <div className="feed-paras">
            {cut.hidden
              .replace(/^\s+/, "")
              .split(/\n{2,}/)
              .map((p, i) => (
                <p key={i} className="feed-behind">
                  {p}
                </p>
              ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/** One post in the platform's look. `as` sets the header's time ("now", "5h"). */
export function FeedPostOf({ post }: { post: LabPost }) {
  return (
    <FeedPost initials={ACCOUNT.initials} data-state={post.state} className="ll-feed-post">
      <FeedPost.Header
        name={ACCOUNT.name}
        handle={post.channel === "x" ? ACCOUNT.handle : undefined}
        headline={post.channel === "linkedin" ? ACCOUNT.headline : undefined}
        time={feedTime(post)}
      />
      <FeedPost.Body>
        <PostWords text={post.body} channel={post.channel} />
      </FeedPost.Body>
      <FeedPost.Actions />
    </FeedPost>
  )
}

/**
 * An open slot, drawn where a post would stand, for you only (the same
 * convention as the fold line): a dashed outline in the platform's own
 * secondary colour, and what it is in plain words. Never a fake post.
 */
export function FeedGap({ channel, dayId, time, passed, children }: { channel: Channel; dayId: string; time: string; passed: boolean; children?: React.ReactNode }) {
  return (
    <div className="ll-gap" data-passed={passed || undefined}>
      <span className="ll-gap-box">
        <span className="ll-gap-title">{passed ? `${whenLabel(dayId, time)} passed with nothing in it` : `Open slot · ${whenLabel(dayId, time)}`}</span>
        <span className="ll-gap-sub">{children ?? (passed ? `Nothing went out on ${CHANNEL_LABEL[channel]}.` : `Nothing goes out on ${CHANNEL_LABEL[channel]} here yet.`)}</span>
      </span>
    </div>
  )
}

/** The pane's picture: the post (or the gap) between two blank neighbours, as Drafts draws it. */
export function FeedPicture({ channel, children }: { channel: Channel; children: React.ReactNode }) {
  return (
    <FeedColumn platform={channel}>
      {channel === "x" ? (
        <FeedColumn.Tabs>
          <FeedColumn.Tab current>For you</FeedColumn.Tab>
          <FeedColumn.Tab>Following</FeedColumn.Tab>
        </FeedColumn.Tabs>
      ) : null}
      <FeedSkeleton />
      {children}
      <FeedSkeleton />
    </FeedColumn>
  )
}
