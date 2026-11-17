"use client"

import * as React from "react"

import { WorkspacePage, useWorkspaceFold } from "@/components/kit"
import type { FeedAccounts } from "@/lib/feed-accounts"
import type { LineupWeek } from "@/lib/lineup"

import { FirstRun, LineupFoot, LineupToolbar, WeekSwitch, useNotesSetting } from "./lineup-chrome"
import { LineupCalendar } from "./lineup-calendar"
import { LineupFeed, feedChannel, revealFeedItem } from "./lineup-feed"
import { CALENDAR_KEYS, FEED_KEYS, useLineupKeys } from "./lineup-keys"
import type { Clock } from "./lineup-model"
import { type Mode } from "./lineup-layout"
import { useLineup, type LineupStore } from "./use-lineup"
import "./lineup.css"

/**
 * /lineup, a workspace (decided on /prototypes/lineup-lab: "2 · Calendar").
 * A toolbar with the week's one sentence and the Slots dialog, a filter row
 * with the week switcher, the calendar with the open post drawn as the feed
 * beside it, and the keys at the foot.
 *
 * The layout follows the room the page has, in CSS: container queries on
 * the workspace's own width (the sidebar is not the page's) and the pointer
 * (lineup.css, "The layout, in CSS"), so the server's HTML paints it at once:
 * - a week of seven columns from 1020px of workspace (the pane is 380 from
 *   1200, 320 under it, so 1280 with the sidebar is a week);
 * - one day with a strip of seven over it from 860;
 * - under 860, and on any touch screen, the Feed (a quarter hour is 14px on
 *   the calendar, under the 44px a finger needs).
 */

export type LineupWorkspaceProps = {
  initial: LineupWeek
  /** Channels with a live connection: where a slot can be made. */
  connected: string[]
  /** The account's zone. Every time on the page is drawn in it. */
  timezone: string
  /** The account's wall clock when the page was read. */
  clock: Clock
  /** Who each channel's post is from (lib/feed-accounts.ts). */
  accounts: FeedAccounts
}


const COARSE = "(pointer: coarse)"

/**
 * Which layout CSS is showing, read from two probes after mount (null until
 * then: every layout renders in its slot, and CSS shows one).
 */
export function useLineupMode(): [React.RefObject<HTMLSpanElement | null>, React.RefObject<HTMLSpanElement | null>, Mode | null] {
  const [feedProbe, feed] = useWorkspaceFold({ media: COARSE })
  const [weekProbe, week] = useWorkspaceFold({ media: COARSE })
  const mode = feed === null || week === null ? null : feed ? "feed" : week ? "week" : "day"
  return [feedProbe, weekProbe, mode]
}

export function LineupWorkspace(props: LineupWorkspaceProps) {
  const [feedProbe, weekProbe, mode] = useLineupMode()
  const store = useLineup(props)
  return (
    <WorkspacePage>
      <div className="lineup-surface flex min-h-0 flex-1 flex-col">
        <span ref={feedProbe} aria-hidden className="lineup-feed-probe" />
        <span ref={weekProbe} aria-hidden className="lineup-week-probe" />
        <LineupSurface store={store} accounts={props.accounts} mode={mode} />
      </div>
    </WorkspacePage>
  )
}

function revealBlock(key: string) {
  document.querySelector(`[data-span-id="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" })
}

function LineupSurface({ store, accounts, mode }: { store: LineupStore; accounts: FeedAccounts; mode: Mode | null }) {
  const [notesOn, setNotes] = useNotesSetting()
  const notes = { on: notesOn, set: setNotes }
  const feed = mode === "feed"
  const { channel } = feedChannel(store)
  useLineupKeys(store, {
    reveal: feed ? revealFeedItem : revealBlock,
    // Followers see one platform: j / k walk only what the column shows.
    within: feed ? (i) => i.channel === channel : undefined,
  })
  // Until mounted (mode null) every layout renders in its slot and CSS shows one; then only the one showing.
  const shows = (m: Mode) => mode === null || mode === m
  return (
    <>
      <LineupToolbar store={store} />
      {store.nothingAtAll ? (
        <FirstRun store={store} />
      ) : (
        <>
          <div className="lineup-feed-only">
            {shows("feed") ? <LineupFeed store={store} accounts={accounts} notes={notes} weekSwitch={<WeekSwitch store={store} />} /> : null}
          </div>
          <div className="lineup-week-only">{shows("week") ? <LineupCalendar store={store} accounts={accounts} mode="week" notes={notes} /> : null}</div>
          <div className="lineup-day-only">{shows("day") ? <LineupCalendar store={store} accounts={accounts} mode="day" notes={notes} /> : null}</div>
        </>
      )}
      {store.nothingAtAll && !store.notice ? null : (
        <>
          <div className="lineup-feed-only">{shows("feed") ? <LineupFoot store={store} keys={FEED_KEYS} /> : null}</div>
          <div className="lineup-cal-only">{mode !== "feed" ? <LineupFoot store={store} keys={CALENDAR_KEYS} /> : null}</div>
        </>
      )}
    </>
  )
}
