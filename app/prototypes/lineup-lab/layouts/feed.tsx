"use client"

import * as React from "react"
import { Linkedin01Icon, NewTwitterIcon } from "@hugeicons/core-free-icons"

import { LiveDot, PanelBody, Segmented, WorkspacePage } from "@/components/kit"
import { Hand } from "@/components/kit/bracket"

import { FeedColumn } from "../../drafts-lab/parts/feed/feed"
import { CHANNEL_LABEL, DAYS, NOW, type Channel, type Day } from "../data"
import type { LabOptions } from "../lab-options"
import { Mono, StateMark, titleOf } from "../parts/cells"
import { FirstRun, LineupFilters, LineupFoot, LineupToolbar } from "../parts/chrome"
import { revealItem, useLineupKeys } from "../parts/keys"
import { ItemVerbs } from "../parts/verbs"
import { isPast, type Item, type LineupStore } from "../use-lineup"
import { pictureOf } from "./table"

/**
 * 3 · Feed: the week as your followers will scroll it. One platform at a
 * time (followers see one), at true size: X's 598 column, the posts in
 * the order they go out, the open slots and the quiet days drawn in the
 * column where they fall (for you only, as the fold line is), and "now"
 * between what went and what is to come. The time and the state stand in
 * a rail on the left, Quincy's notes and the open post's verbs in the
 * margin on the right: everything outside the column is the kit.
 *
 * It is its own phone layout (the rail folds into a line over each post,
 * the margin under it), and it is the fold of 1 · Table and 2 · Board.
 */

export function FeedLayout({ store, opts }: { store: LineupStore; opts: LabOptions }) {
  return (
    <WorkspacePage>
      <FeedSurface store={store} opts={opts} />
    </WorkspacePage>
  )
}

type Row =
  | { kind: "item"; item: Item; first: Day | null }
  | { kind: "quiet"; day: Day }
  | { kind: "now" }
  | { kind: "waiting-head" }

function rowsFor(store: LineupStore, channel: Channel, order: LabOptions["order"]): Row[] {
  const rows: Row[] = []
  const waiting = store.waiting.filter((w) => w.channel === channel)
  if (waiting.length > 0) {
    rows.push({ kind: "waiting-head" })
    for (const w of waiting) rows.push({ kind: "item", item: w, first: null })
  }
  const week: Row[] = []
  for (const day of DAYS) {
    const items = store.timeline.filter((i) => i.dayId === day.id && i.channel === channel)
    if (items.length === 0) {
      if (day.id > NOW.dayId) week.push({ kind: "quiet", day })
      continue
    }
    let nowPlaced = day.id !== NOW.dayId
    items.forEach((item, n) => {
      if (!nowPlaced && !isPast(item.dayId, item.time)) {
        week.push({ kind: "now" })
        nowPlaced = true
      }
      week.push({ kind: "item", item, first: n === 0 ? day : null })
    })
    if (!nowPlaced) week.push({ kind: "now" })
  }
  return [...rows, ...(order === "profile" ? week.reverse() : week)]
}

export function FeedSurface({ store, opts }: { store: LineupStore; opts: LabOptions }) {
  const channel: Channel = store.filters.channel === "linkedin" ? "linkedin" : "x"
  const reveal = React.useCallback((k: string) => revealItem(k, "start"), [])
  // Followers see one platform: j / k walk only what this column shows.
  useLineupKeys(store, { reveal, within: (i) => i.channel === channel })
  const rows = rowsFor(store, channel, opts.order)
  const open = store.selected
  const vars = { "--ll-rail": `${opts.rail}px`, "--ll-col": `${opts.postX}px`, "--ll-margin": `${opts.margin}px` } as React.CSSProperties

  const platformSwitch =
    store.connected.length > 1 ? (
      <Segmented<Channel>
        size="xs"
        aria-label="Whose feed"
        value={channel}
        onValueChange={(c) => store.setFilter("channel", c)}
        options={store.connected.map((c) => ({ value: c, label: CHANNEL_LABEL[c], icon: c === "x" ? NewTwitterIcon : Linkedin01Icon }))}
      />
    ) : null

  return (
    <>
      <LineupToolbar store={store} />
      {store.phase === "live" && store.nothingAtAll ? (
        <FirstRun store={store} />
      ) : (
        <>
          <LineupFilters store={store} channel={false} end={platformSwitch} />
          <PanelBody label={`The week as ${CHANNEL_LABEL[channel]} will show it`}>
            {store.phase === "loading" ? (
              <div role="status" aria-label="Loading the week" className="ll-feed" style={vars}>
                <div className="ll-row">
                  <span className="ll-rail" />
                  <FeedColumn platform={channel} className="ll-slice ll-loading" />
                  <span />
                </div>
              </div>
            ) : (
              <div className="ll-feed" style={vars}>
                <div className="ll-row ll-row-top" aria-hidden>
                  <span className="ll-rail" />
                  <FeedColumn platform={channel} className="ll-slice">
                    {channel === "x" ? (
                      <FeedColumn.Tabs>
                        <FeedColumn.Tab>For you</FeedColumn.Tab>
                        <FeedColumn.Tab current>Posts</FeedColumn.Tab>
                      </FeedColumn.Tabs>
                    ) : null}
                  </FeedColumn>
                  <span />
                </div>
                <ol className="contents">
                  {rows.map((r, n) => (
                    <FeedRow key={r.kind === "item" ? r.item.key : `${r.kind}-${r.kind === "quiet" ? r.day.id : n}`} row={r} store={store} channel={channel} open={open} opts={opts} />
                  ))}
                </ol>
                <div className="ll-row" aria-hidden>
                  <span className="ll-rail" />
                  <FeedColumn platform={channel} className="ll-slice ll-tail" />
                  <span />
                </div>
              </div>
            )}
          </PanelBody>
        </>
      )}
      {store.nothingAtAll ? null : <LineupFoot store={store} />}
    </>
  )
}

function FeedRow({ row, store, channel, open, opts }: { row: Row; store: LineupStore; channel: Channel; open: Item | null; opts: LabOptions }) {
  if (row.kind === "waiting-head") {
    return (
      <li className="ll-row ll-mark-row">
        <span className="ll-rail">
          <span className="text-kit-meta font-kit-strong text-kit-ink">No time yet</span>
        </span>
        <FeedColumn platform={channel} className="ll-slice">
          <span className="ll-band">Approved, not in the feed until it has a time</span>
        </FeedColumn>
        <span />
      </li>
    )
  }
  if (row.kind === "now") {
    return (
      <li className="ll-row ll-now" aria-label={`Now, ${NOW.time}`}>
        <span className="ll-rail">
          <LiveDot>
            <span className="font-kit-mono text-kit-mono-sm text-kit-ink tabular-nums">{`Now ${NOW.time}`}</span>
          </LiveDot>
        </span>
        <FeedColumn platform={channel} className="ll-slice">
          <span className="ll-now-line" aria-hidden />
        </FeedColumn>
        <span />
      </li>
    )
  }
  if (row.kind === "quiet") {
    return (
      <li className="ll-row ll-mark-row">
        <span className="ll-rail">
          <DayLabel day={row.day} />
        </span>
        <FeedColumn platform={channel} className="ll-slice">
          <span className="ll-band">{`Nothing goes out on ${CHANNEL_LABEL[channel]} ${row.day.label === "Tomorrow" ? "tomorrow" : `on ${row.day.label}`}`}</span>
        </FeedColumn>
        <span className="ll-margin">{opts.notes === "on" ? <Hand tone="graphite">quiet day</Hand> : null}</span>
      </li>
    )
  }
  const item = row.item
  const picked = open?.key === item.key
  const note = opts.notes === "on" ? store.notes[item.key] : undefined
  return (
    <li className="ll-row" data-picked={picked || undefined} onClick={() => store.select(item.key)}>
      <span className="ll-rail">
        {row.first ? <DayLabel day={row.first} /> : null}
        <button
          type="button"
          data-item={item.key}
          aria-current={picked || undefined}
          aria-label={`${item.kind === "stranded" ? "No time" : `${row.first?.label ?? ""} ${item.time}`.trim()}: ${titleOf(item)}`}
          className="ll-rail-btn"
          onClick={(e) => {
            e.stopPropagation()
            store.select(item.key)
          }}
        >
          {item.kind === "stranded" ? <span className="text-kit-meta text-kit-ink-muted">—</span> : <Mono muted={!picked}>{item.time}</Mono>}
          <StateMark item={item} />
        </button>
      </span>
      <FeedColumn platform={channel} className="ll-slice">
        {pictureOf(item)}
      </FeedColumn>
      <span className="ll-margin">
        {picked ? (
          <span className="flex flex-col gap-kit-related" onClick={(e) => e.stopPropagation()}>
            {note && item.kind !== "stranded" ? <span className="text-kit-meta text-kit-ink-muted">{note}</span> : null}
            <ItemVerbs item={item} store={store} compact />
          </span>
        ) : note ? (
          <Hand tone="graphite">{handOf(note)}</Hand>
        ) : null}
      </span>
    </li>
  )
}

function DayLabel({ day }: { day: Day }) {
  return (
    <span className="ll-day">
      <span className="text-kit-meta font-kit-strong text-kit-ink">{day.label}</span>
      {day.label !== day.date ? <span className="text-kit-meta text-kit-ink-muted">{day.date}</span> : null}
    </span>
  )
}

/** A note, as a few handwritten words: lower case, no stop. */
function handOf(note: string) {
  const short = note.replace(/\.$/, "").replace(/ An approval lands here.*$/, "").replace(/\.$/, "")
  return short.charAt(0).toLowerCase() + short.slice(1)
}
