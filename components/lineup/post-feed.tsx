"use client"

import * as React from "react"

import { FeedColumn, FeedPost, FeedSkeleton, type FeedPlatform } from "@/components/drafts/feed/feed"
import type { FeedAccount, FeedAccounts } from "@/lib/feed-accounts"
import { CHANNEL_RULES, feedCut } from "@/lib/post-length"

import { whenLabel, type Clock, type Item } from "./lineup-model"

/**
 * The post as the feed will show it, on the parts Drafts picked
 * (components/drafts/feed). Read-only: a post on Lineup is approved
 * writing, and its words change on Drafts. The platform's look stays inside
 * the column; the time, the state and the verbs stay outside it, in the kit.
 * No beat brackets here: blue is the pen's, and Lineup asks when, not how
 * the story reads.
 */

export const platformOf = (channel: string): FeedPlatform => (channel === "linkedin" ? "linkedin" : "x")

export function accountFor(accounts: FeedAccounts, channel: string): FeedAccount {
  return accounts.byChannel[channel] ?? accounts.fallback
}

/** X's "now", "5h": when a sent post went out today, or "now" for one that has not gone. */
export function feedTime(dayId: string, time: string, published: boolean, clock: Clock) {
  if (!published || dayId !== clock.day) return "now"
  const [h, m] = time.split(":").map(Number)
  const [nh, nm] = clock.time.split(":").map(Number)
  const min = nh! * 60 + nm! - (h! * 60 + m!)
  return min < 60 ? `${Math.max(1, min)}m` : `${Math.floor(min / 60)}h`
}

/** The words, with the platform's own "Show more" / "…more" and, for you only, where the feed cuts. */
export function PostWords({ text, channel }: { text: string; channel: string }) {
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

/** One post in the platform's look, from the account it goes out as. */
export function FeedPostOf({ text, channel, account, time, state }: { text: string; channel: string; account: FeedAccount; time: string; state?: string }) {
  const platform = platformOf(channel)
  return (
    <FeedPost initials={account.initials} avatarUrl={account.avatarUrl} data-state={state} className="lineup-feed-post">
      <FeedPost.Header
        name={account.name}
        handle={platform === "x" ? (account.handle ?? undefined) : undefined}
        headline={platform === "linkedin" ? (account.headline ?? undefined) : undefined}
        time={time}
      />
      <FeedPost.Body>
        <PostWords text={text} channel={channel} />
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
export function FeedGap({ item, today }: { item: Extract<Item, { kind: "open" }>; today: string }) {
  const when = whenLabel(item.dayId, item.time, today)
  return (
    <div className="lineup-gap" data-passed={item.passed || undefined}>
      <span className="lineup-gap-box">
        <span className="lineup-gap-title">{item.passed ? `${when} passed with nothing in it` : `Open slot · ${when}`}</span>
        <span className="lineup-gap-sub">{item.passed ? `Nothing went out on ${item.channelLabel}.` : `Nothing goes out on ${item.channelLabel} here yet.`}</span>
      </span>
    </div>
  )
}

/** What the column holds for an item: the post, or the gap where one would stand. */
export function ItemPicture({ item, accounts, clock }: { item: Item; accounts: FeedAccounts; clock: Clock }) {
  if (item.kind === "open") return <FeedGap item={item} today={clock.day} />
  const account = accountFor(accounts, item.channel)
  if (item.kind === "unplaced") return <FeedPostOf text={item.unplaced.body} channel={item.channel} account={account} time="now" />
  const p = item.post
  return <FeedPostOf text={p.body} channel={p.channel} account={account} time={feedTime(p.dayId, p.time, p.state === "published", clock)} state={p.state} />
}

/** The pane's picture: the post (or the gap) between two blank neighbours, as Drafts draws it. */
export function FeedPicture({ channel, children }: { channel: string; children: React.ReactNode }) {
  const platform = platformOf(channel)
  return (
    <FeedColumn platform={platform}>
      {platform === "x" ? (
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
