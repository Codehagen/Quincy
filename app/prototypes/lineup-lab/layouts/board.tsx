"use client"

import * as React from "react"

import { Button, Panel, PanelBody, PanelHeader, WorkspacePage, WorkspacePanes } from "@/components/kit"

import { CHANNEL_LABEL, DAYS, NOW, WEEKDAY_LONG, type Channel, type Day } from "../data"
import type { LabOptions } from "../lab-options"
import { ChannelGlyph, Mono, StateMark, isSettled, titleOf } from "../parts/cells"
import { BOARD_KEYS, FirstRun, LineupFilters, LineupFoot, LineupToolbar, NothingOpen } from "../parts/chrome"
import { revealItem, useLineupKeys } from "../parts/keys"
import { FeedPicture } from "../parts/post-feed"
import { ItemVerbs } from "../parts/verbs"
import { isPast, type Item, type LineupStore, type Target } from "../use-lineup"
import { FeedSurface } from "./feed"
import { pictureOf, stripOf } from "./table"

/**
 * 2 · Board: the rhythm as a grid. Days are columns (today first, the
 * rolling week lib/lineup.ts draws), and the rows are the times you
 * publish at: one row per slot time, plus one row for one-offs. Every
 * cell is a commitment (a slot) or nothing, so an empty Wednesday reads
 * as no slot, and an open slot reads as a dashed cell where a post should
 * be. The open cell's post stands in a phone-width pane beside the grid.
 *
 * Not a month and not hours: a few rows of the times you chose. The
 * earlier calendar was rejected for 135px columns that wrapped every post
 * onto three lines (app/(app)/lineup/page.tsx); here a cell holds the
 * opening line clamped (a control), and the grid folds into 3 · Feed under
 * ~1100px of workspace.
 *
 * Keys: j / k in time order, h / l a day, ⇧H / ⇧L the post a day (into a
 * slot when one is there, else the same time as a one-off), ⇧J / ⇧K later
 * or earlier on its channel. Drag a post onto an open slot, a post on its
 * channel (they trade), or an empty cell (a one-off at that time): pointer
 * only, with the keys and Move as the way for everyone else.
 */

const FOLD_MIN = 1100
const OTHER = "other"

export function BoardLayout({ store, opts }: { store: LineupStore; opts: LabOptions }) {
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
        {fold ? <FeedSurface store={store} opts={opts} /> : <BoardSurface store={store} opts={opts} />}
      </div>
    </WorkspacePage>
  )
}

type Ghost = { dayId: string; time: string }

function BoardSurface({ store, opts }: { store: LineupStore; opts: LabOptions }) {
  const [ghost, setGhost] = React.useState<Ghost | null>(null)
  const [dragging, setDragging] = React.useState<string | null>(null)
  const open = ghost ? null : store.selected

  const times = React.useMemo(() => [...new Set(store.slots.map((s) => s.time))].sort(), [store.slots])
  const rowOf = (i: Item) => (times.includes(i.time) ? i.time : OTHER)
  const rows = React.useMemo(() => {
    const hasOther = store.timeline.some((i) => !times.includes(i.time))
    return [...times, ...(hasOther ? [OTHER] : [])]
  }, [store.timeline, times])
  const cellItems = (dayId: string, row: string) => store.timeline.filter((i) => i.dayId === dayId && rowOf(i) === row)

  const where = (): { d: number; r: string } | null => {
    if (ghost) return { d: DAYS.findIndex((x) => x.id === ghost.dayId), r: ghost.time }
    if (!open || open.kind === "stranded") return null
    return { d: DAYS.findIndex((x) => x.id === open.dayId), r: rowOf(open) }
  }

  const goDay = (by: 1 | -1) => {
    const w = where()
    if (!w) return
    const d = Math.min(DAYS.length - 1, Math.max(0, w.d + by))
    const day = DAYS[d]!
    const found = cellItems(day.id, w.r)[0]
    if (found) {
      setGhost(null)
      store.select(found.key)
      revealItem(found.key)
    } else if (w.r !== OTHER) {
      setGhost({ dayId: day.id, time: w.r })
      store.selectGhost()
      revealItem(`ghost:${day.id}:${w.r}`)
    }
  }

  /** Where a post lands when it is dropped on (or stepped into) a cell. */
  const landOn = (postId: string, dayId: string, row: string) => {
    const p = store.posts.find((x) => x.id === postId)
    if (!p || row === OTHER) return
    const here = cellItems(dayId, row)
    const slotHere = here.find((i): i is Extract<Item, { kind: "open" }> => i.kind === "open" && i.channel === p.channel)
    const postHere = here.find((i) => i.kind === "post" && i.post.id !== p.id && i.channel === p.channel && i.post.state === "queued")
    if (slotHere) store.move(p.id, { kind: "slot", slotId: slotHere.slot.id })
    else if (postHere && postHere.kind === "post") store.swap(p.id, postHere.post.id)
    else {
      const standing = store.slots.find((s) => s.channel === p.channel && s.time === row && s.weekday === DAYS.find((d) => d.id === dayId)!.weekday)
      const target: Target = standing && !store.filledBy.has(standing.id) ? { kind: "slot", slotId: standing.id } : { kind: "day", dayId, time: row }
      store.move(p.id, target)
    }
    setGhost(null)
  }

  const reveal = React.useCallback((k: string) => revealItem(k), [])
  const post = open?.kind === "post" ? open.post : null
  useLineupKeys(store, {
    reveal,
    extra: {
      h: (e) => {
        if (e.shiftKey && post) {
          const d = DAYS.findIndex((x) => x.id === post.dayId)
          if (d > 0) landOn(post.id, DAYS[d - 1]!.id, rowOf(open!))
        } else goDay(-1)
      },
      l: (e) => {
        if (e.shiftKey && post) {
          const d = DAYS.findIndex((x) => x.id === post.dayId)
          if (d < DAYS.length - 1) landOn(post.id, DAYS[d + 1]!.id, rowOf(open!))
        } else goDay(1)
      },
    },
  })

  const columns = `4.5rem repeat(7, minmax(0, 1fr))`

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
                <div className="flex flex-col gap-kit-group px-kit-group pt-kit-related pb-kit-group">
                  {store.waiting.length > 0 ? <Tray store={store} open={open} onPick={() => setGhost(null)} /> : null}
                  <div role="grid" aria-label="The week by slot" aria-rowcount={rows.length + 1} className="ll-board" style={{ gridTemplateColumns: columns, ["--ll-lines" as string]: opts.cellLines }} data-loading={store.phase === "loading" || undefined}>
                    <div role="row" className="contents">
                      <span role="columnheader" className="ll-board-corner" />
                      {DAYS.map((d) => (
                        <DayHead key={d.id} day={d} quiet={store.quietDays.includes(d.id)} />
                      ))}
                    </div>
                    {rows.map((row) => (
                      <div role="row" key={row} className="contents">
                        <span role="rowheader" className="ll-board-time">
                          {row === OTHER ? <span className="text-kit-meta text-kit-ink-muted">One-offs</span> : <Mono>{row}</Mono>}
                        </span>
                        {DAYS.map((d) => {
                          const here = store.phase === "loading" ? [] : cellItems(d.id, row)
                          const isGhost = ghost?.dayId === d.id && ghost.time === row
                          const past = row !== OTHER && isPast(d.id, row)
                          return (
                            <div
                              role="gridcell"
                              key={d.id}
                              className="ll-cell"
                              data-today={d.id === NOW.dayId || undefined}
                              data-past={past || undefined}
                              data-drop={dragging && row !== OTHER && !past ? "" : undefined}
                              onDragOver={(e) => {
                                if (dragging && row !== OTHER && !past) e.preventDefault()
                              }}
                              onDrop={(e) => {
                                e.preventDefault()
                                const id = e.dataTransfer.getData("text/plain")
                                setDragging(null)
                                if (id) landOn(id, d.id, row)
                              }}
                            >
                              {store.phase === "loading" ? <span className="ll-card ll-card-skel" aria-hidden /> : null}
                              {here.map((i) => (
                                <Card
                                  key={i.key}
                                  item={i}
                                  picked={open?.key === i.key}
                                  showTime={row === OTHER}
                                  onPick={() => {
                                    setGhost(null)
                                    store.select(i.key)
                                  }}
                                  onDragStart={() => setDragging(i.key)}
                                  onDragEnd={() => setDragging(null)}
                                />
                              ))}
                              {here.length === 0 && row !== OTHER && !past && store.phase === "live" ? (
                                <button
                                  type="button"
                                  data-item={`ghost:${d.id}:${row}`}
                                  data-picked={isGhost || undefined}
                                  aria-label={`${d.label} ${row}: no slot`}
                                  className="ll-empty"
                                  onClick={() => {
                                    setGhost({ dayId: d.id, time: row })
                                    store.selectGhost()
                                  }}
                                />
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                  {store.phase === "loading" ? (
                    <p role="status" className="sr-only">
                      Loading the week
                    </p>
                  ) : null}
                </div>
              </PanelBody>
            </Panel>
            <Panel label="Open cell" width={`${opts.boardPane}px`} edge="start">
              <PanelBody label="The open cell" scrollKey={open?.key ?? (ghost ? `${ghost.dayId}${ghost.time}` : null)}>
                {ghost ? (
                  <GhostPane
                    ghost={ghost}
                    store={store}
                    onMade={(key) => {
                      setGhost(null)
                      store.select(key)
                    }}
                  />
                ) : open && store.phase === "live" ? (
                  <>
                    <PanelHeader end={<StateMark item={open} hideWord />}>
                      <ChannelGlyph channel={open.channel} />
                      <span className="truncate">{stripOf(open)}</span>
                    </PanelHeader>
                    <div className="flex flex-col gap-kit-group px-kit-group py-kit-group">
                      <FeedPicture channel={open.channel}>{pictureOf(open)}</FeedPicture>
                      {opts.notes === "on" && open.kind !== "stranded" && store.notes[open.key] ? <p className="text-kit-meta text-kit-ink-muted">{store.notes[open.key]}</p> : null}
                      <ItemVerbs item={open} store={store} compact />
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-full flex-col">
                    <PanelHeader>
                      <span aria-hidden />
                    </PanelHeader>
                    <div className="px-kit-group pt-kit-group">{store.phase === "loading" ? null : <NothingOpen />}</div>
                  </div>
                )}
              </PanelBody>
            </Panel>
          </WorkspacePanes>
        </>
      )}
      {store.nothingAtAll ? null : <LineupFoot store={store} keys={BOARD_KEYS} />}
    </>
  )
}

function DayHead({ day, quiet }: { day: Day; quiet: boolean }) {
  const today = day.id === NOW.dayId
  return (
    <span role="columnheader" className="ll-board-day" data-today={today || undefined}>
      <span className={`text-kit-meta ${today ? "font-kit-strong text-kit-ink" : "text-kit-ink-muted"}`}>{today ? "Today" : day.short}</span>
      <span className="font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">{day.date.split(" ")[1]}</span>
      {quiet ? <span className="ms-auto text-kit-meta text-kit-ink-muted">Quiet</span> : null}
    </span>
  )
}

function Card({
  item,
  picked,
  showTime,
  onPick,
  onDragStart,
  onDragEnd,
}: {
  item: Item
  picked: boolean
  showTime: boolean
  onPick: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const draggable = item.kind === "post" && item.post.state === "queued"
  const kind = item.kind === "open" ? (item.passed ? "passed" : "open") : item.kind === "post" ? item.post.state : "stranded"
  return (
    <button
      type="button"
      data-item={item.key}
      data-kind={kind}
      data-picked={picked || undefined}
      aria-current={picked || undefined}
      draggable={draggable || undefined}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData("text/plain", item.key)
              e.dataTransfer.effectAllowed = "move"
              onDragStart()
            }
          : undefined
      }
      onDragEnd={onDragEnd}
      onClick={onPick}
      className="ll-card"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <ChannelGlyph channel={item.channel} />
        {showTime ? <Mono muted={isSettled(item)}>{item.time}</Mono> : null}
        <span className="ms-auto">
          <StateMark item={item} hideWord />
        </span>
      </span>
      <span className={`ll-card-text ${item.kind === "open" || isSettled(item) ? "text-kit-ink-muted" : "text-kit-ink"}`}>
        {item.kind === "open" ? (item.passed ? "Passed empty" : "Open slot") : titleOf(item)}
      </span>
    </button>
  )
}

/** Approved posts with no time, above the grid: they are in no cell yet. */
function Tray({ store, open, onPick }: { store: LineupStore; open: Item | null; onPick: () => void }) {
  return (
    <section aria-label="Approved, no time" className="flex flex-col gap-kit-tight">
      <h2 className="text-kit-meta font-kit-strong text-kit-ink-muted">Approved, no time</h2>
      <div className="flex flex-wrap gap-2">
        {store.waiting.map((i) => (
          <button
            key={i.key}
            type="button"
            data-item={i.key}
            data-kind="stranded"
            data-picked={open?.key === i.key || undefined}
            className="ll-card ll-card-tray"
            onClick={() => {
              onPick()
              store.select(i.key)
            }}
          >
            <span className="flex items-center gap-1.5">
              <ChannelGlyph channel={i.channel} />
              <StateMark item={i} />
            </span>
            <span className="ll-card-text text-kit-ink">{titleOf(i)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** An empty cell: no slot here. Making one is `createSlot`: this weekday at this time, every week. */
function GhostPane({ ghost, store, onMade }: { ghost: Ghost; store: LineupStore; onMade: (key: string) => void }) {
  const day = DAYS.find((d) => d.id === ghost.dayId)!
  const exists = (c: Channel) => store.slots.some((s) => s.channel === c && s.weekday === day.weekday && s.time === ghost.time)
  return (
    <>
      <PanelHeader>
        <span className="truncate">{`${day.label === "Today" || day.label === "Tomorrow" ? day.label : day.short} ${ghost.time} · no slot`}</span>
      </PanelHeader>
      <div className="flex flex-col gap-kit-related px-kit-group py-kit-group">
        <p className="text-kit-dense text-pretty text-kit-ink">
          Nothing goes out here.{" "}
          <span className="text-kit-ink-muted">{`Make it a slot and every ${WEEKDAY_LONG[day.weekday - 1]} at ${ghost.time} takes the next approved post.`}</span>
        </p>
        <div className="flex flex-wrap gap-kit-controls">
          {store.connected.map((c, i) => (
            <Button key={c} size="sm" variant={i === 0 ? "action" : "quiet"} disabled={exists(c)} onClick={() => {
                store.addSlot(c, day.weekday, ghost.time)
                onMade(`slot:s-${c}-${day.weekday}-${ghost.time}`)
              }}
            >
              {`Make it ${c === "x" ? "an" : "a"} ${CHANNEL_LABEL[c]} slot`}
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}
