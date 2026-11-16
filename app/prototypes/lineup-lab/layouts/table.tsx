"use client"

import * as React from "react"

import {
  DataList,
  EmptyRegion,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspacePage,
  WorkspacePanes,
  revealDataListRow,
  type DataListColumn,
  type DataListGroup,
} from "@/components/kit"

import { CHANNEL_LABEL, NOW } from "../data"
import type { LabOptions } from "../lab-options"
import { ChannelGlyph, Mono, StateMark, isSettled, titleOf } from "../parts/cells"
import { FilteredEmpty, FirstRun, LineupFilters, LineupFoot, LineupToolbar, NothingOpen, NothingQueued } from "../parts/chrome"
import { useLineupKeys } from "../parts/keys"
import { FeedGap, FeedPicture, FeedPostOf } from "../parts/post-feed"
import { ItemVerbs } from "../parts/verbs"
import { whenLabel, type Item, type LineupStore } from "../use-lineup"
import { FeedSurface } from "./feed"

/**
 * 1 · Table: the pattern Ideas and Drafts picked. A dense list of the
 * week in time order, grouped by day, the approved posts with no time on
 * top; the open post drawn as the feed will show it, in a pane beside the
 * list (Drafts' C · Feed parts, read-only). Open slots are rows in their
 * own day, so the gap is where it falls, not a section of its own.
 *
 * The pane is the feed column and its padding (598 + 40), with no margin
 * column: Lineup's marks are one line, said under the picture. So at 1280
 * the list keeps 434 and stays a table; under a ~1000 workspace it folds
 * into 3 · Feed, with the same store and keys.
 */

const FOLD_MIN = 1000

export function TableLayout({ store, opts }: { store: LineupStore; opts: LabOptions }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [fold, setFold] = React.useState<boolean | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFold(el.clientWidth < FOLD_MIN)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <WorkspacePage ref={ref}>
      <div className="flex min-h-0 flex-1 flex-col" style={fold === null ? { visibility: "hidden" } : undefined}>
        {fold ? <FeedSurface store={store} opts={opts} /> : <TableSurface store={store} opts={opts} />}
      </div>
    </WorkspacePage>
  )
}

function columns(): DataListColumn<Item>[] {
  return [
    {
      id: "time",
      header: "Time",
      width: "3rem",
      skeleton: "short",
      cell: (i) => (i.kind === "stranded" ? <Mono>—</Mono> : <Mono muted={isSettled(i)}>{i.time}</Mono>),
    },
    { id: "ch", header: "", width: "1rem", skeleton: "glyph", cell: (i) => <ChannelGlyph channel={i.channel} /> },
    {
      id: "title",
      header: "Post",
      width: "minmax(0,1fr)",
      skeleton: "title",
      cell: (i) => (
        <span className={`block truncate text-kit-dense ${i.kind === "open" || isSettled(i) ? "text-kit-ink-muted" : "text-kit-ink"}`}>{titleOf(i)}</span>
      ),
    },
    {
      id: "slot",
      header: "Slot",
      width: "5.5rem",
      wide: true,
      cell: (i) => <span className="truncate text-kit-meta text-kit-ink-muted">{slotCell(i)}</span>,
    },
    { id: "state", header: "State", width: "6.5rem", cell: (i) => <StateMark item={i} /> },
  ]
}

function slotCell(i: Item) {
  if (i.kind === "open") return CHANNEL_LABEL[i.channel]
  if (i.kind === "stranded") return "None yet"
  return i.post.slotId ? "Slot" : "One-off"
}

export function groupsOf(store: LineupStore): DataListGroup<Item>[] {
  const out: DataListGroup<Item>[] = []
  if (store.waiting.length > 0) {
    out.push({
      key: "waiting",
      label: <GroupLabel title="Approved, no time" count={store.waiting.length} />,
      name: `${store.waiting.length} approved with no time`,
      items: store.waiting,
    })
  }
  for (const { day, items } of store.byDay) {
    if (items.length === 0) continue
    out.push({
      key: day.id,
      label: <GroupLabel title={day.label} sub={day.date} count={items.filter((i) => i.kind === "post").length} />,
      name: `${day.label}, ${day.date}`,
      items,
    })
  }
  return out
}

function GroupLabel({ title, sub, count }: { title: string; sub?: string; count: number }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-kit-strong text-kit-ink">{title}</span>
      {sub && sub !== title ? <span>{sub}</span> : null}
      {count > 0 ? <span className="font-kit-mono text-kit-mono-sm tabular-nums">{count}</span> : null}
    </span>
  )
}

function TableSurface({ store, opts }: { store: LineupStore; opts: LabOptions }) {
  useLineupKeys(store, { reveal: (k) => revealDataListRow(k) })
  const open = store.selected
  const cols = React.useMemo(() => columns(), [])
  const groups = groupsOf(store)
  const queuedAny = store.posts.some((p) => p.state === "queued")

  return (
    <>
      <LineupToolbar store={store} />
      {store.phase === "live" && store.nothingAtAll ? (
        <FirstRun store={store} />
      ) : (
        <>
          <LineupFilters store={store} />
          <WorkspacePanes>
            <Panel label="The week">
              <PanelBody>
                <DataList
                  label="The week"
                  aria-keyshortcuts="j k m p b u s"
                  groups={groups}
                  getKey={(i) => i.key}
                  getLabel={titleOf}
                  value={open?.key ?? null}
                  onValueChange={store.select}
                  columns={cols}
                  status={store.phase === "loading" ? "loading" : "ready"}
                  loadingLabel="Loading the week"
                  empty={store.posts.length === 0 && store.items.length === 0 ? <NothingQueued /> : <FilteredEmpty store={store} />}
                />
              </PanelBody>
            </Panel>
            <Panel label="Open post" width={`${opts.postX + 40}px`} edge="start">
              <PanelBody label="The open post" scrollKey={open?.key ?? null}>
                {open && store.phase === "live" ? (
                  <>
                    <PanelHeader end={<StateMark item={open} />}>
                      <ChannelGlyph channel={open.channel} />
                      <span className="truncate">{stripOf(open)}</span>
                    </PanelHeader>
                    <div className="flex flex-col gap-kit-group px-kit-group py-kit-group">
                      <div style={{ width: "100%", maxWidth: opts.postX }}>
                        <FeedPicture channel={open.channel}>{pictureOf(open)}</FeedPicture>
                      </div>
                      <div className="flex flex-col gap-kit-related" style={{ maxWidth: opts.postX }}>
                        {opts.notes === "on" && open.kind !== "stranded" && store.notes[open.key] ? <p className="text-kit-meta text-kit-ink-muted">{store.notes[open.key]}</p> : null}
                        <ItemVerbs item={open} store={store} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-full flex-col">
                    <PanelHeader>
                      <span aria-hidden />
                    </PanelHeader>
                    {store.phase === "loading" ? null : !queuedAny && store.openSlots.length > 0 ? (
                      <EmptyRegion>
                        <NothingQueued />
                      </EmptyRegion>
                    ) : (
                      <div className="px-kit-group pt-kit-group">
                        <NothingOpen />
                      </div>
                    )}
                  </div>
                )}
              </PanelBody>
            </Panel>
          </WorkspacePanes>
        </>
      )}
      {store.nothingAtAll ? null : <LineupFoot store={store} />}
    </>
  )
}

/** The pane's strip: when, and what stands behind the time. */
export function stripOf(i: Item) {
  if (i.kind === "stranded") return "Approved, waiting for a time"
  if (i.kind === "open") return `${whenLabel(i.dayId, i.time)} · your ${CHANNEL_LABEL[i.channel]} slot`
  const p = i.post
  const when = whenLabel(p.dayId, p.time)
  if (p.state === "published") return `Went out ${when}`
  if (p.state === "failed") return `Was due ${when}`
  if (p.state === "sending") return `Sending since ${p.time}`
  return `${when} · ${p.slotId ? "your slot" : "a one-off"}`
}

/** What the column holds for an item: the post, or the gap where one would stand. */
export function pictureOf(i: Item) {
  if (i.kind === "post") return <FeedPostOf post={i.post} />
  if (i.kind === "stranded")
    return <FeedPostOf post={{ id: i.key, versionId: i.s.versionId, idea: i.s.idea, channel: i.s.channel, body: i.s.body, dayId: NOW.dayId, time: NOW.time, slotId: null, state: "queued", url: null, error: null }} />
  return <FeedGap channel={i.channel} dayId={i.dayId} time={i.time} passed={i.passed} />
}

