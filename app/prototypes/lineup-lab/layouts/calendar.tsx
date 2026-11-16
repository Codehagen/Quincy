"use client"

import * as React from "react"
import { Alert02Icon, ArrowLeft01Icon, ArrowRight01Icon, SentIcon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { addDays, startOfWeek } from "@ui-sdk/core/date"

import {
  Button,
  ButtonLink,
  IconButton,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspacePage,
  WorkspacePanes,
  ICON_DENSE,
  useAnnounce,
  type KeyBarItem,
} from "@/components/kit"

import { CHANNEL_LABEL, NOW, WEEKDAY_LONG, WEEKDAY_SHORT, type Channel, type LabPost, type LabSlot } from "../data"
import type { LabOptions } from "../lab-options"
import { ChannelGlyph, Mono, titleOf } from "../parts/cells"
import { Hand } from "@/components/kit/bracket"
import { FirstRun, LineupFilters, LineupFoot, LineupToolbar, NothingOpen } from "../parts/chrome"
import { useLineupKeys } from "../parts/keys"
import { FeedPicture } from "../parts/post-feed"
import { ItemVerbs } from "../parts/verbs"
import { WeekCalendar, hhmm, type BlockVariant } from "../parts/week-calendar"
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
 * side layout are ui-sdk (parts/week-calendar.tsx, the WeekCalendar parts); the chrome is the kit.
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
    // A touch screen gets the Feed: a quarter hour is 14px, under the 44px a finger needs.
    const coarse = window.matchMedia("(pointer: coarse)")
    const measure = () => setWidth(coarse.matches ? 0 : el.clientWidth)
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

/** A block's data, as this page builds it: a post, or a slot's occurrence. */
type CalBlock = { id: string; track: string; start: number; end: number; variant: BlockVariant; state?: string }

type Picked = { kind: "post"; post: LabPost } | { kind: "open"; slot: LabSlot; dayId: string; passed: boolean } | { kind: "stranded"; key: string }
type Ghost = { dayId: string; minute: number }

function CalendarSurface({ store, opts, mode, pane }: { store: LineupStore; opts: LabOptions; mode: "week" | "day"; pane: number }) {
  const announce = useAnnounce()
  const [weekStart, setWeekStart] = React.useState(THIS_WEEK)
  const [dayIdx, setDayIdx] = React.useState(Math.max(0, isoWeekday(NOW.dayId) - 1))
  // Opens on the store's pick (the first queued post), as the other layouts do.
  const [picked, setPicked] = React.useState<string | null>(() => (store.selected?.kind === "post" ? store.selected.key : null))
  const [ghost, setGhost] = React.useState<Ghost | null>(null)

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
  const shownDays = React.useMemo(() => (mode === "week" ? weekDays : [weekDays[dayIdx]!]), [mode, weekDays, dayIdx])

  const ch = store.filters.channel
  const ahead = store.filters.show === "ahead"
  const spans = React.useMemo<CalBlock[]>(() => {
    const inWeek = new Set(weekDays)
    const out: CalBlock[] = []
    for (const p of store.posts) {
      if (!inWeek.has(p.dayId) || (ch !== "all" && p.channel !== ch) || (ahead && p.state === "published")) continue
      const start = minuteOf(p.time)
      out.push({ id: p.id, track: p.dayId, start, end: start + VISUAL_MINUTES, variant: "post", state: p.state })
    }
    for (const s of store.slots) {
      if (ch !== "all" && s.channel !== ch) continue
      const dayId = addDays(weekStart, s.weekday - 1)
      if (store.posts.some((p) => p.slotId === s.id && p.dayId === dayId)) continue
      const passed = isPast(dayId, s.time)
      if (ahead && passed) continue
      const start = minuteOf(s.time)
      const key = `slot:${s.id}:${dayId}`
      out.push({ id: key, track: dayId, start, end: start + VISUAL_MINUTES, variant: passed ? "passed" : "slot" })
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
    if (store.items.some((i) => i.key === key) || store.posts.some((p) => p.id === key)) store.select(key)
    else if (key.startsWith("slot:") && key.slice(-10) >= THIS_WEEK && key.slice(-10) <= addDays(THIS_WEEK, 6)) store.select(key.split(":").slice(0, 2).join(":"))
    else store.select("")
  }

  const describe = React.useCallback((dayId: string, minute: number) => `${shortOf(dayId)} ${hhmm(minute)}`, [])
  const label = (s: CalBlock) => {
    const p = store.posts.find((x) => x.id === s.id)
    return p ? `${quoted(openingOf(p.body))}, ${CHANNEL_LABEL[p.channel]}` : s.variant === "slot" ? "an open slot" : "a slot that passed empty"
  }
  /** Only a queued post still ahead moves. */
  const disabledOf = (s: CalBlock) => {
    const p = s.variant === "post" ? store.posts.find((x) => x.id === s.id) : undefined
    return !p || p.state !== "queued" || isPast(p.dayId, p.time)
  }

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
    // A proposal belongs to the week it was made in.
    setGhost(null)
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

  /**
   * Quincy's notes on the grid (proposed), handwritten in graphite, a few
   * lower-case words each: a quiet day ahead, the next open slot, a post
   * close behind another on its channel. Facts about the week, never a
   * verdict, and never a number of anything.
   */
  const gridNotes = React.useMemo(() => {
    const out: { id: string; day: string; minute: number; text: string }[] = []
    for (const id of shownDays) {
      if (id <= NOW.dayId) continue
      if (!spans.some((x) => x.track === id && x.variant !== "passed")) out.push({ id: `quiet-${id}`, day: id, minute: 9 * 60, text: "quiet day" })
    }
    const next = spans.filter((x) => x.variant === "slot").sort((a, b) => a.track.localeCompare(b.track) || a.start - b.start)[0]
    if (next) out.push({ id: `next-${next.id}`, day: next.track, minute: next.end + 4, text: "next open slot" })
    for (const x of spans) {
      const note = x.variant === "post" ? store.notes[x.id] : undefined
      if (note?.includes(" after the ")) out.push({ id: `after-${x.id}`, day: x.track, minute: x.end + 4, text: `close behind ${note.match(/\d\d:\d\d/)?.[0] ?? "the last"}` })
    }
    return out
  }, [shownDays, spans, store.notes])

  const showNow = shownDays.includes(NOW.dayId)

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
              <WeekCalendar
                week={weekStart}
                view={mode}
                day={weekDays[dayIdx]}
                today={NOW.dayId}
                value={picked}
                onValueChange={(key) => (key ? pick(key) : setPicked(null))}
                onMove={onMove}
                onPropose={(dayId, minute) => {
                  setGhost({ dayId, minute })
                  setPicked(null)
                  store.select("")
                  announce(`${describe(dayId, minute)}. Nothing here. The pane offers what could go here.`)
                }}
                snapMinutes={15}
                hourHeight={opts.hourPx}
                onAnnounce={announce}
                describe={describe}
              >
                {/* Outside the scroller: the tray and the day strip stay in view while the hours scroll. */}
                {store.waiting.length > 0 && store.phase === "live" ? (
                  <WeekCalendar.Tray label="Approved, no time">
                    {store.waiting.map((w) => (
                      <WeekCalendar.TrayItem key={w.key} value={w.key} onPlace={(day, minute) => store.placeAt(w.s.versionId, day, hhmm(minute))}>
                        <span className="flex min-w-0 items-start gap-1.5">
                          <ChannelGlyph channel={w.channel} />
                          <span className="ll-card-text text-kit-ink">{titleOf(w)}</span>
                        </span>
                      </WeekCalendar.TrayItem>
                    ))}
                  </WeekCalendar.Tray>
                ) : null}
                {mode === "day" ? <DayStrip days={weekDays} index={dayIdx} onPick={setDayIdx} store={store} /> : null}
                <PanelBody>
                  <div ref={bodyRef} className="flex flex-col">
                    <WeekCalendar.Header />
                    {store.phase === "loading" ? (
                      <div role="status" aria-label="Loading the week" className="ll-week-loading" style={{ height: 24 * opts.hourPx }} />
                    ) : (
                      <WeekCalendar.Grid axis={<WeekCalendar.TimeAxis now={showNow ? NOW_MINUTE : null} />}>
                        {showNow ? <WeekCalendar.NowLine day={NOW.dayId} minute={NOW_MINUTE} /> : null}
                        {opts.notes === "on"
                          ? gridNotes.map((note) => (
                              <WeekCalendar.Note key={note.id} day={note.day} minute={note.minute}>
                                <Hand tone="graphite">{note.text}</Hand>
                              </WeekCalendar.Note>
                            ))
                          : null}
                        {ghost ? <WeekCalendar.Proposal day={ghost.dayId} minute={ghost.minute} /> : null}
                        {spans.map((b) => (
                          <WeekCalendar.Block key={b.id} value={b.id} day={b.track} start={b.start} end={b.end} variant={b.variant} state={b.state} disabled={disabledOf(b)} label={label(b)}>
                            {({ start, focused }) => <BlockBody block={b} store={store} start={start} focused={focused} />}
                          </WeekCalendar.Block>
                        ))}
                      </WeekCalendar.Grid>
                    )}
                  </div>
                </PanelBody>
              </WeekCalendar>
            </Panel>
            <Panel label="Open post" width={`${pane}px`} edge="start">
              <PanelBody label="The open post" scrollKey={picked ?? (ghost ? `${ghost.dayId}${ghost.minute}` : null)}>
                {ghost ? (
                  <GhostPane ghost={ghost} store={store} onDone={() => setGhost(null)} />
                ) : item && store.phase === "live" ? (
                  <>
                    <PanelHeader end={<CalMark item={item} />}>
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

function BlockBody({ block, store, start, focused }: { block: CalBlock; store: LineupStore; start: number; focused: boolean }) {
  const p = block.variant === "post" ? store.posts.find((x) => x.id === block.id) : undefined
  const channel: Channel = p?.channel ?? (store.slots.find((s) => block.id.startsWith(`slot:${s.id}:`))?.channel ?? "x")
  const item: Item | null = p ? { kind: "post", key: p.id, dayId: p.dayId, time: p.time, channel: p.channel, post: p } : null
  return (
    <span className="ll-block-inner" data-focused={focused || undefined}>
      <span className="flex min-w-0 items-center gap-1">
        <ChannelGlyph channel={channel} />
        <Mono muted={block.variant !== "post" || p?.state === "published"}>{hhmm(start)}</Mono>
        {item ? (
          <span className="ms-auto">
            <CalMark item={item} hideWord />
          </span>
        ) : null}
      </span>
      <span className="ll-block-text">{p ? openingOf(p.body) : block.variant === "slot" ? `Open ${CHANNEL_LABEL[channel]} slot` : "Passed empty"}</span>
    </span>
  )
}

/**
 * A block's state on the calendar, static: the owner asked for no green and
 * no blinking here (2026-11-16, "fjern den grønne blinken"). Sending is a
 * still glyph and the word, like the other states; queued has no mark, a
 * slot has none (its dashed edge says it). Only this layout: LiveDot stays
 * as it is everywhere else.
 */
function CalMark({ item, hideWord = false }: { item: Item; hideWord?: boolean }) {
  if (item.kind !== "post") return null
  const st = item.post.state
  if (st === "queued") return null
  const [icon, word] = st === "sending" ? [SentIcon, "Sending"] : st === "published" ? [Tick02Icon, "Sent"] : [Alert02Icon, "Didn't go"]
  return (
    <span className="inline-flex items-center gap-1.5 text-kit-meta whitespace-nowrap text-kit-ink-muted">
      <HugeiconsIcon icon={icon} {...ICON_DENSE} aria-hidden className="shrink-0" />
      <span className={hideWord ? "sr-only" : undefined}>{word}</span>
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
