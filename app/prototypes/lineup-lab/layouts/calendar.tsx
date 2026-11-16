"use client"

import * as React from "react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { addDays, startOfWeek } from "@ui-sdk/core/date"
import { bindDrag, bindDragPreview, dragThreshold } from "@ui-sdk/core"

import {
  Button,
  ButtonLink,
  IconButton,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspacePage,
  WorkspacePanes,
  useAnnounce,
  useReducedMotion,
  type KeyBarItem,
} from "@/components/kit"

import { CHANNEL_LABEL, NOW, WEEKDAY_LONG, WEEKDAY_SHORT, type Channel, type LabPost, type LabSlot } from "../data"
import type { LabOptions } from "../lab-options"
import { ChannelGlyph, Mono, StateMark, titleOf } from "../parts/cells"
import { FirstRun, LineupFilters, LineupFoot, LineupToolbar, NothingOpen } from "../parts/chrome"
import { useLineupKeys } from "../parts/keys"
import { FeedPicture } from "../parts/post-feed"
import { ItemVerbs } from "../parts/verbs"
import { STEP, WeekGrid, hhmm, type CalSpan, type GridDay } from "../parts/week-grid"
import { isPast, openingOf, quoted, type Item, type LineupStore } from "../use-lineup"
import { FeedSurface } from "./feed"
import { pictureOf, stripOf } from "./table"

/**
 * 2 · Calendar (the owner picked Board, 2026-11-16: "make this into a
 * calendar that we also can have all the times between also"). A Mon–Sun
 * week with continuous time down the left (00:00–24:00, a 15-minute snap),
 * opening on the working morning; posts are blocks at their exact minute,
 * open slots dashed blocks at theirs; the open block's post stands as the
 * feed in the pane beside it. The grid, its keys, the drag and the side by
 * side layout are ui-sdk (parts/week-grid.tsx); the chrome is the kit.
 *
 * Widths: a week from ~1020px of workspace (the pane narrows to 320 under
 * 1200, so 1280 is a week); one day with a day strip from 860; under that,
 * and on a phone, 3 · Feed.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const VISUAL_MINUTES = 45
const THIS_WEEK = startOfWeek(NOW.dayId, 1)
const NOW_MINUTE = Number(NOW.time.slice(0, 2)) * 60 + Number(NOW.time.slice(3))

export const CAL_KEYS: readonly KeyBarItem[] = [
  { keys: ["←", "↑", "↓", "→"], label: "Cell" },
  { keys: ["Enter"], label: "Pick up, drop" },
  { keys: ["⇧↑", "⇧↓"], label: "An hour" },
  { keys: ["Esc"], label: "Put back" },
  { keys: ["P"], label: "Post now" },
  { keys: ["B"], label: "Back to Drafts" },
  { keys: ["U"], label: "Undo" },
  { keys: ["S"], label: "Slots" },
]

type Mode = "week" | "day" | "feed"

export function CalendarLayout({ store, opts }: { store: LineupStore; opts: LabOptions }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const mode: Mode | null = width === null ? null : width >= 1020 ? "week" : width >= 860 ? "day" : "feed"
  return (
    <WorkspacePage ref={ref}>
      <div className="flex min-h-0 flex-1 flex-col" style={mode === null ? { visibility: "hidden" } : undefined}>
        {mode === "feed" ? <FeedSurface store={store} opts={opts} /> : mode ? <CalendarSurface store={store} opts={opts} mode={mode} pane={width! >= 1200 ? 380 : 320} /> : null}
      </div>
    </WorkspacePage>
  )
}

/* ── Dates ─────────────────────────────────────────────────────────── */

function dateOf(id: string) {
  return new Date(`${id}T12:00:00Z`)
}
function isoWeekday(id: string) {
  return dateOf(id).getUTCDay() || 7
}
function shortOf(id: string) {
  return WEEKDAY_SHORT[isoWeekday(id) - 1]!
}
function weekLabel(start: string) {
  const a = dateOf(start)
  const b = dateOf(addDays(start, 6))
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
}
const minuteOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/* ── The surface ───────────────────────────────────────────────────── */

type Picked = { kind: "post"; post: LabPost } | { kind: "open"; slot: LabSlot; dayId: string; passed: boolean } | { kind: "stranded"; key: string }
type Ghost = { dayId: string; minute: number }

function CalendarSurface({ store, opts, mode, pane }: { store: LineupStore; opts: LabOptions; mode: "week" | "day"; pane: number }) {
  const announce = useAnnounce()
  const reduced = useReducedMotion()
  const [weekStart, setWeekStart] = React.useState(THIS_WEEK)
  const [dir, setDir] = React.useState<-1 | 0 | 1>(0)
  const [dayIdx, setDayIdx] = React.useState(Math.max(0, isoWeekday(NOW.dayId) - 1))
  // Opens on the store's pick (the first queued post), as the other layouts do.
  const [picked, setPicked] = React.useState<string | null>(() => (store.selected?.kind === "post" ? store.selected.key : null))
  const [ghost, setGhost] = React.useState<Ghost | null>(null)
  const [hover, setHover] = React.useState<Ghost | null>(null)

  // j / k (the store's selection) move the calendar's pick too.
  const [seenStoreKey, setSeenStoreKey] = React.useState(store.selectedKey)
  if (store.selectedKey !== seenStoreKey) {
    setSeenStoreKey(store.selectedKey)
    const key = store.selectedKey
    if (key && store.posts.some((p) => p.id === key)) {
      setPicked(key)
      setGhost(null)
    } else if (key?.startsWith("slot:")) {
      const s = store.slots.find((x) => `slot:${x.id}` === key)
      if (s) setPicked(`slot:${s.id}:${addDays(THIS_WEEK, s.weekday - 1)}`)
    } else if (key?.startsWith("st:")) setPicked(key)
  }

  const weekDays = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const shownDays = mode === "week" ? weekDays : [weekDays[dayIdx]!]
  const gridDays: GridDay[] = shownDays.map((id) => ({ id, short: shortOf(id), date: dateOf(id).getUTCDate(), today: id === NOW.dayId }))

  const ch = store.filters.channel
  const ahead = store.filters.show === "ahead"
  const spans = React.useMemo<CalSpan[]>(() => {
    const inWeek = new Set(weekDays)
    const out: CalSpan[] = []
    for (const p of store.posts) {
      if (!inWeek.has(p.dayId) || (ch !== "all" && p.channel !== ch) || (ahead && p.state === "published")) continue
      const start = minuteOf(p.time)
      out.push({ id: p.id, key: p.id, track: p.dayId, start, end: start + VISUAL_MINUTES, kind: "post", state: p.state })
    }
    for (const s of store.slots) {
      if (ch !== "all" && s.channel !== ch) continue
      const dayId = addDays(weekStart, s.weekday - 1)
      if (store.posts.some((p) => p.slotId === s.id && p.dayId === dayId)) continue
      const passed = isPast(dayId, s.time)
      if (ahead && passed) continue
      const start = minuteOf(s.time)
      const key = `slot:${s.id}:${dayId}`
      out.push({ id: key, key, track: dayId, start, end: start + VISUAL_MINUTES, kind: passed ? "passed" : "open" })
    }
    return out
  }, [store.posts, store.slots, weekDays, weekStart, ch, ahead])

  const pickOf = (key: string | null): Picked | null => {
    if (!key) return null
    if (key.startsWith("st:")) return store.stranded.some((s) => `st:${s.versionId}` === key) ? { kind: "stranded", key } : null
    if (key.startsWith("slot:")) {
      const [, slotId, dayId] = key.split(":")
      const slot = store.slots.find((s) => s.id === slotId)
      return slot && dayId ? { kind: "open", slot, dayId, passed: isPast(dayId, slot.time) } : null
    }
    const post = store.posts.find((p) => p.id === key)
    return post ? { kind: "post", post } : null
  }
  const current = pickOf(picked)
  const item: Item | null =
    current?.kind === "post"
      ? { kind: "post", key: current.post.id, dayId: current.post.dayId, time: current.post.time, channel: current.post.channel, post: current.post }
      : current?.kind === "open"
        ? { kind: "open", key: picked!, dayId: current.dayId, time: current.slot.time, channel: current.slot.channel, slot: current.slot, passed: current.passed }
        : current?.kind === "stranded"
          ? (store.waiting.find((w) => w.key === current.key) ?? null)
          : null

  const pick = (key: string) => {
    setPicked(key)
    setGhost(null)
    // Keep the store's selection (P, B, M act on it) in step for this week's items.
    if (store.items.some((i) => i.key === key)) store.select(key)
    else if (key.startsWith("slot:") && key.slice(-10) >= THIS_WEEK && key.slice(-10) <= addDays(THIS_WEEK, 6)) store.select(key.split(":").slice(0, 2).join(":"))
    else store.select("")
  }

  const describe = React.useCallback((dayId: string, minute: number) => `${shortOf(dayId)} ${hhmm(minute)}`, [])
  const label = React.useCallback(
    (s: CalSpan) => {
      const p = store.posts.find((x) => x.id === s.key)
      return p ? `${quoted(openingOf(p.body))}, ${CHANNEL_LABEL[p.channel]}` : s.kind === "open" ? "an open slot" : "a slot that passed empty"
    },
    [store.posts]
  )
  const cellLabel = React.useCallback(
    (dayId: string, minute: number) => {
      const d = dateOf(dayId)
      const here = spans.find((s) => s.track === dayId && s.start === minute)
      return `${WEEKDAY_LONG[isoWeekday(dayId) - 1]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hhmm(minute)}${here ? `: ${label(here)}` : ""}`
    },
    [spans, label]
  )
  const locked = React.useCallback(
    (s: CalSpan) => {
      if (s.kind !== "post") return true
      const p = store.posts.find((x) => x.id === s.key)
      return !p || p.state !== "queued" || isPast(p.dayId, p.time)
    },
    [store.posts]
  )

  /** A drop (pointer or Enter): into an open slot of its channel at exactly that time, else a one-off there. */
  const onMove = (key: string, dayId: string, minute: number) => {
    const p = store.posts.find((x) => x.id === key)
    if (!p) return false
    const time = hhmm(minute)
    const slot = store.slots.find((s) => s.channel === p.channel && s.weekday === isoWeekday(dayId) && s.time === time && !store.posts.some((q) => q.slotId === s.id && q.dayId === dayId && q.id !== p.id))
    return store.move(p.id, slot ? { kind: "slot", slotId: slot.id, dayId } : { kind: "day", dayId, time })
  }

  const goWeek = (by: -1 | 0 | 1) => {
    const next = by === 0 ? THIS_WEEK : addDays(weekStart, by * 7)
    if (next === weekStart) return
    setDir(by === 0 ? (next < weekStart ? -1 : 1) : by)
    setWeekStart(next)
    if (by === 0) setDayIdx(Math.max(0, isoWeekday(NOW.dayId) - 1))
    announce(`Week of ${weekLabel(next)}${next === THIS_WEEK ? ", this week" : ""}.`)
  }

  // Open on the working morning, and back to it when the week changes.
  const bodyRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const scroller = bodyRef.current?.closest<HTMLElement>('[data-slot="kit-panel-body"]')
    const grid = bodyRef.current?.querySelector<HTMLElement>(".ll-week-body")
    if (!scroller || !grid) return
    const top = grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    // 07:00 just under the sticky day heads (32).
    scroller.scrollTop = top + 7 * opts.hourPx - 40
  }, [weekStart, mode, opts.hourPx])

  useLineupKeys(store, {
    reveal: (key) => document.querySelector(`[data-span-id="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" }),
  })

  const weekSwitch = (
    <div className="flex items-center gap-1">
      <span className="me-1 hidden font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums @[52rem]/kit-workspace:inline">{weekLabel(weekStart)}</span>
      <IconButton icon={ArrowLeft01Icon} aria-label="The week before" onClick={() => goWeek(-1)} />
      <Button size="xs" variant="ghost" disabled={weekStart === THIS_WEEK} onClick={() => goWeek(0)}>
        Today
      </Button>
      <IconButton icon={ArrowRight01Icon} aria-label="The week after" onClick={() => goWeek(1)} />
    </div>
  )

  const showNow = shownDays.includes(NOW.dayId) ? { dayId: NOW.dayId, minute: NOW_MINUTE } : null

  return (
    <>
      <LineupToolbar store={store} />
      {store.phase === "live" && store.nothingAtAll ? (
        <FirstRun store={store} />
      ) : (
        <>
          <LineupFilters store={store} end={weekSwitch} />
          <WorkspacePanes>
            <Panel label="The week">
              {/* Outside the scroller: the tray and the day strip stay in view while the hours scroll. */}
              {store.waiting.length > 0 && store.phase === "live" ? (
                <Tray store={store} picked={picked} onPick={pick} onHover={setHover} onDrop={(versionId, at) => store.placeAt(versionId, at.dayId, hhmm(at.minute))} />
              ) : null}
              {mode === "day" ? <DayStrip days={weekDays} index={dayIdx} onPick={setDayIdx} store={store} /> : null}
              <PanelBody>
                <div ref={bodyRef} className="flex flex-col">
                  <div className="ll-week-head" style={{ ["--ll-days" as string]: shownDays.length } as React.CSSProperties} aria-hidden>
                    <span />
                    {gridDays.map((d) => (
                      <span key={d.id} className="ll-week-dayhead" data-today={d.today || undefined} data-past={d.id < NOW.dayId || undefined}>
                        <span>{d.short}</span>
                        <span className="ll-week-date">{d.date}</span>
                      </span>
                    ))}
                  </div>
                  {store.phase === "loading" ? (
                    <div role="status" aria-label="Loading the week" className="ll-week-loading" style={{ height: 24 * opts.hourPx }} />
                  ) : (
                    <WeekGrid
                      days={gridDays}
                      spans={spans}
                      hourPx={opts.hourPx}
                      selectedKey={picked}
                      ghost={hover ?? ghost}
                      now={showNow}
                      locked={locked}
                      label={label}
                      cellLabel={cellLabel}
                      onSelect={pick}
                      onPropose={(dayId, minute) => {
                        setGhost({ dayId, minute })
                        setPicked(null)
                        store.select("")
                        announce(`${describe(dayId, minute)}. Nothing here. The pane offers what could go here.`)
                      }}
                      onMove={onMove}
                      announce={announce}
                      describe={describe}
                      renderBlock={(s, focused, start) => <BlockBody span={s} store={store} focused={focused} start={start} />}
                      startCell={{ row: 28, col: mode === "week" ? Math.max(0, isoWeekday(NOW.dayId) - 1) : 0 }}
                      weekKey={weekStart + mode}
                      dir={dir}
                      reduced={reduced}
                    />
                  )}
                </div>
              </PanelBody>
            </Panel>
            <Panel label="Open post" width={`${pane}px`} edge="start">
              <PanelBody label="The open post" scrollKey={picked ?? (ghost ? `${ghost.dayId}${ghost.minute}` : null)}>
                {ghost ? (
                  <GhostPane ghost={ghost} store={store} onDone={() => setGhost(null)} />
                ) : item && store.phase === "live" ? (
                  <>
                    <PanelHeader end={<StateMark item={item} hideWord />}>
                      <ChannelGlyph channel={item.channel} />
                      <span className="truncate">{stripOf(item)}</span>
                    </PanelHeader>
                    <div className="flex flex-col gap-kit-group px-kit-group py-kit-group">
                      <FeedPicture channel={item.channel}>{pictureOf(item)}</FeedPicture>
                      {opts.notes === "on" && item.kind !== "stranded" && store.notes[item.kind === "open" ? `slot:${item.slot.id}` : item.key] ? (
                        <p className="text-kit-meta text-kit-ink-muted">{store.notes[item.kind === "open" ? `slot:${item.slot.id}` : item.key]}</p>
                      ) : null}
                      <ItemVerbs item={item} store={store} compact />
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
      {store.nothingAtAll ? null : <LineupFoot store={store} keys={CAL_KEYS} />}
    </>
  )
}

/* ── Pieces ────────────────────────────────────────────────────────── */

function BlockBody({ span, store, focused, start }: { span: CalSpan; store: LineupStore; focused: boolean; start: number }) {
  const p = span.kind === "post" ? store.posts.find((x) => x.id === span.key) : undefined
  const channel: Channel = p?.channel ?? (store.slots.find((s) => span.key.startsWith(`slot:${s.id}:`))?.channel ?? "x")
  const item: Item | null = p ? { kind: "post", key: p.id, dayId: p.dayId, time: p.time, channel: p.channel, post: p } : null
  return (
    <span className="ll-block-inner" data-focused={focused || undefined}>
      <span className="flex min-w-0 items-center gap-1">
        <ChannelGlyph channel={channel} />
        <Mono muted={span.kind !== "post" || p?.state === "published"}>{hhmm(start)}</Mono>
        {item ? (
          <span className="ms-auto">
            <StateMark item={item} hideWord />
          </span>
        ) : null}
      </span>
      <span className="ll-block-text">{p ? openingOf(p.body) : span.kind === "open" ? `Open ${CHANNEL_LABEL[channel]} slot` : "Passed empty"}</span>
    </span>
  )
}

/** In one-day mode: the week as seven buttons over the column. Whether a day holds a post is a dot, never a count. */
function DayStrip({ days, index, onPick, store }: { days: string[]; index: number; onPick: (i: number) => void; store: LineupStore }) {
  return (
    <div className="ll-daystrip" role="group" aria-label="Day">
      {days.map((id, i) => {
        const has = store.posts.some((p) => p.dayId === id)
        return (
          <button key={id} type="button" aria-pressed={i === index} data-today={id === NOW.dayId || undefined} onClick={() => onPick(i)}>
            <span>{shortOf(id)}</span>
            <span className="font-kit-mono tabular-nums">{dateOf(id).getUTCDate()}</span>
            <span className="ll-daystrip-dot" data-on={has || undefined} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Approved, with no time: chips over the grid. Pick one to see it in the
 * pane; drag one onto the grid to give it that day and time (proposed: the
 * server's placement takes the next free slot, not a chosen one). The drag
 * is ui-sdk's `bindDrag` with a `bindDragPreview` that follows the pointer
 * one to one; the quarter hour under the pointer is drawn as the ghost.
 */
function Tray({
  store,
  picked,
  onPick,
  onHover,
  onDrop,
}: {
  store: LineupStore
  picked: string | null
  onPick: (key: string) => void
  onHover: (at: Ghost | null) => void
  onDrop: (versionId: string, at: Ghost) => boolean
}) {
  const at = (x: number, y: number): Ghost | null => {
    const track = document.elementsFromPoint(x, y).map((el) => (el as HTMLElement).closest<HTMLElement>("[data-track-day]")).find(Boolean)
    if (!track) return null
    const r = track.getBoundingClientRect()
    const q = Math.min(95, Math.max(0, Math.floor(((y - r.top) / r.height) * 96)))
    return { dayId: track.dataset.trackDay!, minute: q * STEP }
  }
  return (
    <section aria-label="Approved, no time" className="ll-tray">
      <h2 className="text-kit-meta font-kit-strong text-kit-ink-muted">Approved, no time</h2>
      <div className="flex flex-wrap gap-2">
        {store.waiting.map((w) => (
          <button
            key={w.key}
            type="button"
            className="ll-chip"
            data-picked={picked === w.key || undefined}
            onClick={() => onPick(w.key)}
            onPointerDown={(event) => {
              const el = event.currentTarget
              let preview: ReturnType<typeof bindDragPreview> | null = null
              let last: Ghost | null = null
              bindDrag(el, event.nativeEvent, {
                threshold: dragThreshold,
                cancelOnEscape: true,
                onStart: (e) => {
                  preview = bindDragPreview(el, { x: e.clientX, y: e.clientY })
                  preview.el.setAttribute("data-lifted", "")
                },
                onMove: ({ x, y }) => {
                  preview?.move(x, y)
                  last = at(x, y)
                  onHover(last)
                },
                onEnd: (_e, canceled) => {
                  preview?.remove()
                  onHover(null)
                  if (!canceled && last) onDrop(w.s.versionId, last)
                },
              })
            }}
          >
            <span className="flex items-center gap-1.5">
              <ChannelGlyph channel={w.channel} />
              <StateMark item={w} />
            </span>
            <span className="ll-card-text text-kit-ink">{titleOf(w)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * An empty quarter hour, proposed: make the weekday and time a slot
 * (`createSlot`, real), or put an approved post there (proposed: place,
 * then move).
 */
function GhostPane({ ghost, store, onDone }: { ghost: Ghost; store: LineupStore; onDone: () => void }) {
  const time = hhmm(ghost.minute)
  const wd = isoWeekday(ghost.dayId)
  const d = dateOf(ghost.dayId)
  const past = isPast(ghost.dayId, time)
  return (
    <>
      <PanelHeader>
        <span className="truncate">{`${shortOf(ghost.dayId)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${time} · nothing here`}</span>
      </PanelHeader>
      <div className="flex flex-col gap-kit-related px-kit-group py-kit-group">
        {past ? (
          <p className="text-kit-dense text-pretty text-kit-ink">
            That time has passed. <span className="text-kit-ink-muted">A post put there would go out straight away. Pick a later one.</span>
          </p>
        ) : (
          <>
            <p className="text-kit-dense text-pretty text-kit-ink">
              Nothing goes out here.{" "}
              <span className="text-kit-ink-muted">{`Make it a slot and every ${WEEKDAY_LONG[wd - 1]} at ${time} takes the next approved post${store.stranded.length ? ", or put one here now" : ""}.`}</span>
            </p>
            <div className="flex flex-wrap gap-kit-controls">
              {store.stranded.slice(0, 2).map((s, i) => (
                <Button
                  key={s.versionId}
                  size="sm"
                  variant={i === 0 ? "action" : "quiet"}
                  onClick={() => {
                    if (store.placeAt(s.versionId, ghost.dayId, time)) onDone()
                  }}
                >
                  {`Put “${clip(openingOf(s.body))}” here`}
                </Button>
              ))}
              {store.connected.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={store.stranded.length === 0 && c === store.connected[0] ? "action" : "quiet"}
                  disabled={store.slots.some((s) => s.channel === c && s.weekday === wd && s.time === time)}
                  onClick={() => {
                    store.addSlot(c, wd, time)
                    onDone()
                  }}
                >
                  {`Make it ${c === "x" ? "an" : "a"} ${CHANNEL_LABEL[c]} slot`}
                </Button>
              ))}
              <ButtonLink href="/drafts" size="sm" variant="quiet">
                Approve a draft
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function clip(t: string, n = 26) {
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t.replace(/[.!?]+$/, "")
}
