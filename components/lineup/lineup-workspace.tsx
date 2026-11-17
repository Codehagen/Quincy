"use client"

import * as React from "react"

import { WorkspacePage } from "@/components/kit"
import type { FeedAccounts } from "@/lib/feed-accounts"
import type { LineupWeek } from "@/lib/lineup"

import { FirstRun, LineupFoot, LineupToolbar, WeekSwitch, useNotesSetting } from "./lineup-chrome"
import { LineupCalendar } from "./lineup-calendar"
import { LineupFeed, feedChannel, revealFeedItem } from "./lineup-feed"
import { CALENDAR_KEYS, FEED_KEYS, useLineupKeys } from "./lineup-keys"
import type { Clock } from "./lineup-model"
import { useLineup, type LineupStore } from "./use-lineup"
import "./lineup.css"

/**
 * /lineup, a workspace (decided on /prototypes/lineup-lab: "2 · Calendar").
 * A toolbar with the week's one sentence and the Slots dialog, a filter row
 * with the week switcher, the calendar with the open post drawn as the feed
 * beside it, and the keys at the foot.
 *
 * The layout follows the room the page has, measured on its own width (the
 * sidebar is not the page's), and the pointer:
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

type Mode = "week" | "day" | "feed"

/** The layout for a workspace this wide; `coarse` is a touch screen. */
export function modeFor(width: number, coarse: boolean): Mode {
  if (coarse || width < 860) return "feed"
  return width >= 1020 ? "week" : "day"
}

function useMode(ref: React.RefObject<HTMLDivElement | null>) {
  const [measured, setMeasured] = React.useState<{ mode: Mode; width: number } | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const coarse = window.matchMedia("(pointer: coarse)")
    const measure = () => setMeasured({ mode: modeFor(el.clientWidth, coarse.matches), width: el.clientWidth })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    coarse.addEventListener("change", measure)
    return () => {
      ro.disconnect()
      coarse.removeEventListener("change", measure)
    }
  }, [ref])
  return measured
}

export function LineupWorkspace(props: LineupWorkspaceProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const measured = useMode(ref)
  const store = useLineup(props)
  return (
    <WorkspacePage ref={ref}>
      {/* Hidden only until the first measure (before paint), so a phone never flashes the calendar. */}
      <div className="flex min-h-0 flex-1 flex-col" style={measured === null ? { visibility: "hidden" } : undefined}>
        {measured ? <LineupSurface store={store} accounts={props.accounts} mode={measured.mode} pane={measured.width >= 1200 ? 380 : 320} /> : null}
      </div>
    </WorkspacePage>
  )
}

function revealBlock(key: string) {
  document.querySelector(`[data-span-id="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" })
}

function LineupSurface({ store, accounts, mode, pane }: { store: LineupStore; accounts: FeedAccounts; mode: Mode; pane: number }) {
  const [notesOn, setNotes] = useNotesSetting()
  const notes = { on: notesOn, set: setNotes }
  const feed = mode === "feed"
  const { channel } = feedChannel(store)
  useLineupKeys(store, {
    reveal: feed ? revealFeedItem : revealBlock,
    // Followers see one platform: j / k walk only what the column shows.
    within: feed ? (i) => i.channel === channel : undefined,
  })
  return (
    <>
      <LineupToolbar store={store} />
      {store.nothingAtAll ? (
        <FirstRun store={store} />
      ) : feed ? (
        <LineupFeed store={store} accounts={accounts} notes={notes} weekSwitch={<WeekSwitch store={store} />} />
      ) : (
        <LineupCalendar store={store} accounts={accounts} mode={mode} pane={pane} notes={notes} />
      )}
      {store.nothingAtAll && !store.notice ? null : <LineupFoot store={store} keys={feed ? FEED_KEYS : CALENDAR_KEYS} />}
    </>
  )
}
