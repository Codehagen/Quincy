"use client"

import * as React from "react"
import { Linkedin01Icon, NewTwitterIcon } from "@hugeicons/core-free-icons"

import { Mono, PanelBody, Segmented } from "@/components/kit"
import { Hand } from "@/components/kit/bracket"
import { FeedColumn } from "@/components/drafts/feed/feed"
import type { FeedAccounts } from "@/lib/feed-accounts"

import { LineupFilters } from "./lineup-chrome"
import { ScheduleMark } from "./lineup-marks"
import { closeBehind, isPastAt, titleOf, type Item } from "./lineup-model"
import { ItemPicture, platformOf } from "./post-feed"
import { CHANNEL_LABELS } from "./slot-composer"
import { ItemVerbs } from "./lineup-verbs"
import type { LineupStore } from "./use-lineup"

/**
 * The Feed: the week as your followers will scroll it, the layout for a
 * phone and for any touch screen (a calendar's quarter hour is 14px, under
 * the 44px a finger needs; DECISION.md, the UI review). One platform at a
 * time, at true size: the posts in the order they go out, the open slots
 * and the quiet days drawn in the column where they fall (for you only, as
 * the fold line is), and now between what went and what is to come. The
 * time and the state stand in a rail on the left; Quincy's notes and the
 * open post's verbs in the margin. Moving is the Move menu, not a drag.
 */

type Row = { kind: "item"; item: Item; first: string | null } | { kind: "quiet"; day: string } | { kind: "now" } | { kind: "waiting-head" }

const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function dayName(dayId: string, today: string, tomorrow: string) {
  if (dayId === today) return "Today"
  if (dayId === tomorrow) return "Tomorrow"
  const d = new Date(`${dayId}T12:00:00Z`)
  return WEEKDAY_LONG[(d.getUTCDay() + 6) % 7]!
}

function dateName(dayId: string) {
  const d = new Date(`${dayId}T12:00:00Z`)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

function rowsFor(store: LineupStore, channel: string): Row[] {
  const rows: Row[] = []
  const waiting = store.waiting.filter((w) => w.channel === channel)
  if (waiting.length > 0) {
    rows.push({ kind: "waiting-head" })
    for (const w of waiting) rows.push({ kind: "item", item: w, first: null })
  }
  const { clock } = store
  for (const day of store.days) {
    const items = store.timeline.filter((i) => i.dayId === day && i.channel === channel)
    if (items.length === 0) {
      if (day > clock.day) rows.push({ kind: "quiet", day })
      if (day === clock.day) rows.push({ kind: "now" })
      continue
    }
    let nowPlaced = day !== clock.day
    items.forEach((item, n) => {
      if (!nowPlaced && !isPastAt(clock, item.dayId, item.time)) {
        rows.push({ kind: "now" })
        nowPlaced = true
      }
      rows.push({ kind: "item", item, first: n === 0 ? day : null })
    })
    if (!nowPlaced) rows.push({ kind: "now" })
  }
  return rows
}

/** The channel the Feed shows: the filter's, else the first the account has. */
export function feedChannel(store: LineupStore) {
  const channels = [...new Set([...store.connected, ...store.week.slots.map((s) => s.channel), ...store.week.posts.map((p) => p.channel)])]
  return { channels, channel: store.filters.channel !== "all" ? store.filters.channel : (channels[0] ?? "x") }
}

export function LineupFeed({ store, accounts, notes, weekSwitch }: { store: LineupStore; accounts: FeedAccounts; notes: { on: boolean; set: (on: boolean) => void }; weekSwitch?: React.ReactNode }) {
  const { channels, channel } = feedChannel(store)
  const platform = platformOf(channel)
  const rows = rowsFor(store, channel)
  const behind = React.useMemo(() => closeBehind(store.week.posts), [store.week.posts])
  const tomorrow = store.days[store.days.indexOf(store.clock.day) + 1] ?? ""

  const platformSwitch =
    channels.length > 1 ? (
      <Segmented<string>
        size="xs"
        aria-label="Whose feed"
        value={channel}
        onValueChange={(c) => store.setFilter("channel", c)}
        options={channels.map((c) => ({ value: c, label: CHANNEL_LABELS[c] ?? c, icon: c === "linkedin" ? Linkedin01Icon : NewTwitterIcon }))}
      />
    ) : null

  const noteFor = (item: Item): string | null => {
    if (!notes.on) return null
    if (item.kind === "post" && behind.get(item.post.id)) return `close behind ${behind.get(item.post.id)}`
    if (item.kind === "open") return item.passed ? "passed empty" : null
    return null
  }

  return (
    <>
      <LineupFilters
        store={store}
        channel={false}
        notes={notes}
        end={
          <div className="flex items-center gap-kit-related">
            {platformSwitch}
            {weekSwitch}
          </div>
        }
      />
      <PanelBody label={`The week as ${CHANNEL_LABELS[channel] ?? channel} will show it`}>
        <div className="lineup-feed">
          <div className="lineup-row lineup-row-top" aria-hidden>
            <span className="lineup-rail" />
            <FeedColumn platform={platform} className="lineup-slice">
              {platform === "x" ? (
                <FeedColumn.Tabs>
                  <FeedColumn.Tab>For you</FeedColumn.Tab>
                  <FeedColumn.Tab current>Posts</FeedColumn.Tab>
                </FeedColumn.Tabs>
              ) : null}
            </FeedColumn>
            <span className="lineup-margin" />
          </div>
          <ol className="contents">
            {rows.map((r, n) => {
              if (r.kind === "waiting-head") {
                return (
                  <li key="waiting-head" className="lineup-row lineup-mark-row">
                    <span className="lineup-rail">
                      <span className="text-kit-meta font-kit-strong text-kit-ink">No time yet</span>
                    </span>
                    <FeedColumn platform={platform} className="lineup-slice">
                      <span className="lineup-band">Approved, not in the feed until it has a time</span>
                    </FeedColumn>
                    <span className="lineup-margin" />
                  </li>
                )
              }
              if (r.kind === "now") {
                return (
                  <li key={`now-${n}`} className="lineup-row lineup-now" aria-label={`Now, ${store.clock.time}`}>
                    <span className="lineup-rail">
                      {/* Ink, still: no dot and no pulse on Lineup. */}
                      <Mono size="sm" tone="ink">{`Now ${store.clock.time}`}</Mono>
                    </span>
                    <FeedColumn platform={platform} className="lineup-slice">
                      <span className="lineup-now-line" aria-hidden />
                    </FeedColumn>
                    <span className="lineup-margin" />
                  </li>
                )
              }
              if (r.kind === "quiet") {
                return (
                  <li key={`quiet-${r.day}`} className="lineup-row lineup-mark-row">
                    <span className="lineup-rail">
                      <DayLabel day={r.day} today={store.clock.day} tomorrow={tomorrow} />
                    </span>
                    <FeedColumn platform={platform} className="lineup-slice">
                      <span className="lineup-band">{`Nothing goes out ${r.day === tomorrow ? "tomorrow" : `on ${dayName(r.day, store.clock.day, tomorrow)}`}`}</span>
                    </FeedColumn>
                    <span className="lineup-margin">{notes.on ? <Hand tone="graphite">quiet day</Hand> : null}</span>
                  </li>
                )
              }
              const item = r.item
              const picked = store.selected?.key === item.key
              const note = noteFor(item)
              return (
                <li key={item.key} className="lineup-row" data-picked={picked || undefined}>
                  <span className="lineup-rail">
                    {r.first ? <DayLabel day={r.first} today={store.clock.day} tomorrow={tomorrow} /> : null}
                    <button
                      type="button"
                      data-item={item.key}
                      aria-current={picked || undefined}
                      aria-label={`${item.kind === "unplaced" ? "No time" : `${dayName(item.dayId, store.clock.day, tomorrow)} ${item.time}`}: ${titleOf(item)}`}
                      className="lineup-rail-btn"
                      onClick={() => store.select(item.key)}
                    >
                      {item.kind === "unplaced" ? null : <Mono size="sm" tone={picked ? "ink" : "muted"}>{item.time}</Mono>}
                      <ScheduleMark item={item} />
                    </button>
                  </span>
                  <FeedColumn platform={platform} className="lineup-slice">
                    <ItemPicture item={item} accounts={accounts} clock={store.clock} />
                  </FeedColumn>
                  <span className="lineup-margin">
                    {picked ? <ItemVerbs item={item} store={store} /> : note ? <Hand tone="graphite">{note}</Hand> : null}
                  </span>
                </li>
              )
            })}
          </ol>
          <div className="lineup-row" aria-hidden>
            <span className="lineup-rail" />
            <FeedColumn platform={platform} className="lineup-slice lineup-tail" />
            <span className="lineup-margin" />
          </div>
        </div>
      </PanelBody>
    </>
  )
}

function DayLabel({ day, today, tomorrow }: { day: string; today: string; tomorrow: string }) {
  return (
    <span className="lineup-day">
      <span className="text-kit-meta font-kit-strong text-kit-ink">{dayName(day, today, tomorrow)}</span>
      <span className="text-kit-meta text-kit-ink-muted">{dateName(day)}</span>
    </span>
  )
}

/** Scroll an item's rail button into view inside its own scroller and focus it, without moving the page. */
export function revealFeedItem(key: string) {
  const el = document.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"]`)
  if (!el) return
  el.scrollIntoView({ block: "start", inline: "nearest" })
  if (document.activeElement?.closest("[data-item]") || document.activeElement === document.body) el.focus({ preventScroll: true })
}
