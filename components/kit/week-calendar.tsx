"use client"

import * as React from "react"
import {
  bindDrag,
  bindDragPreview,
  byCell,
  createChange,
  createGridFocus,
  createSpans,
  definePrimitive,
  dragThreshold,
  selects,
  type GridCell,
  type Span,
  type SpansDraft,
} from "@ui-sdk/core"
import { addDays } from "@ui-sdk/core/date"
import { usePart, usePrimitive, type PartProps, type PrimitiveHandle } from "@ui-sdk/react/primitive"

import { useAnnounce } from "./announcer"
import { useControllable } from "./use-controllable"
import {
  DAY_MINUTES,
  dateOfKey,
  describeCell,
  describePlace,
  hhmm,
  lanesOf,
  minuteAtY,
  placeOnLayer,
  stepHeld,
  weekdayShort,
  type HeldPlace,
  type Lane,
} from "./week-calendar-math"
import "./week-calendar.css"

export { describePlace, hhmm } from "./week-calendar-math"

/**
 * WeekCalendar: a week (or one day) of continuous time, 00:00 to 24:00, with
 * blocks placed at their exact minute, moved by pointer and by keyboard.
 * Nothing in it knows what a block stands for: the page decides what a
 * block is, what a drop means and what empty time offers (decided on
 * /prototypes/lineup-lab, "2 · Calendar"; Lineup reads it in
 * components/lineup/lineup-calendar.tsx).
 *
 * ```tsx
 * <WeekCalendar week="2026-11-16" today="2026-11-16" value={picked} onValueChange={setPicked} onMove={move} onPropose={propose}>
 *   <WeekCalendar.Tray label="No time yet">
 *     <WeekCalendar.TrayItem value="v-1">…</WeekCalendar.TrayItem>
 *   </WeekCalendar.Tray>
 *   <WeekCalendar.Header />
 *   <WeekCalendar.Grid axis={<WeekCalendar.TimeAxis now={860} />}>
 *     <WeekCalendar.Block value="p-1" day="2026-11-17" start={480} end={525} label="Backup post">…</WeekCalendar.Block>
 *     <WeekCalendar.NowLine day="2026-11-16" minute={860} />
 *     <WeekCalendar.Note day="2026-11-18" minute={540}>quiet day</WeekCalendar.Note>
 *     <WeekCalendar.Proposal day="2026-11-19" minute={615} />
 *   </WeekCalendar.Grid>
 * </WeekCalendar>
 * ```
 *
 * **ui-sdk only**, never Base UI, in every part: `createSpans` (blocks on day
 * tracks, the pointer drag with a snapped draft, auto-scroll), `createGridFocus`
 * (the quarter hours' keys: one tab stop, arrows, Home / End, Page Up / Down),
 * `bindDrag` + `bindDragPreview` (the tray). The root holds the primitive and
 * gives it to the parts through context; the page holds none of it.
 *
 * Each part takes a `ref` and a `className` and spreads the rest of its props
 * onto its element. State is data on the element (`data-variant`,
 * `data-state`, `data-picked`, `data-held`, `data-lifted`, `data-focused`,
 * `data-today`), never a boolean prop. The picked block and the week are
 * controlled (`value`, `week`) or not (`defaultValue`, `defaultWeek`).
 *
 * Built here because ui-sdk lacks them, and kept small: a held "pick up,
 * move, drop" keyboard mode on a span (`spans.keydown` commits every arrow
 * and resizes with Shift); the drop's settle spring (ui-sdk's solver is not
 * exported, so the curve is CSS); gliding between snaps while dragging.
 *
 * Its quarter hours are 14px at the default hour: under the 44px a finger
 * needs. A page offers a coarse pointer another layout (Lineup gives it its
 * Feed), rather than this grid.
 */

/* ── The ui-sdk primitive ─────────────────────────────────────────── */

export type BlockVariant = "post" | "slot" | "passed"

type CalSpan = Span & { variant: BlockVariant }
type PrimState = { value: CalSpan[]; moving: SpansDraft<CalSpan> | null; cell: GridCell | null }
type PrimOptions = {
  value?: CalSpan[]
  onValueChange?: (value: CalSpan[]) => void
  disabled?: (span: CalSpan) => boolean
  label?: (span: CalSpan) => string
  tracks?: string[]
  cols?: number
  rows?: number
  step?: number
  onCell?: (cell: GridCell) => void
  startCell?: GridCell
}

const week = definePrimitive({
  name: "week-calendar",
  options: {
    value: "list",
    onValueChange: "callback",
    disabled: "value",
    label: "value",
    tracks: "list",
    cols: "value",
    rows: "value",
    step: "value",
    onCell: "value",
    startCell: "value",
  },
  state: (options: PrimOptions): PrimState => ({ value: options.value ?? [], moving: null, cell: options.startCell ?? null }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    return {
      spans: createSpans<PrimState, CalSpan>(context, {
        key: "value",
        draft: "moving",
        set: (value, details) => change("value", value, details),
        min: () => 0,
        max: () => DAY_MINUTES,
        step: () => context.options().step ?? 15,
        axis: "y",
        overlap: true,
        tracks: () => context.options().tracks ?? [],
        disabled: (span) => context.options().disabled?.(span) ?? false,
        label: (span) => context.options().label?.(span) ?? span.id,
        // The page says each move once, through its own announcer.
        message: () => "",
      }),
      grid: createGridFocus<PrimState>(context, {
        key: "cell",
        rows: () => context.options().rows ?? 96,
        cols: () => context.options().cols ?? 7,
        pageSize: () => 16,
        onMove: (cell) => context.options().onCell?.(cell),
      }),
    }
  },
  slots: (slot) => ({
    root: slot<object, { spans: CalSpan[]; moving: SpansDraft<CalSpan> | null }>({
      state: (state, { api }) => ({ spans: api.spans.spans(state), moving: state.moving }),
    }),
    track: slot<{ value: string }>({
      props: { value: "string" },
      bind: (el, { api, key }) => api.spans.bindTrack(el, key),
    }),
    span: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { api, key }) => api.spans.spanAttrs(state, key),
      bind: (el, { api, key }) => api.spans.bindSpan(el, key),
      on: { pointerdown: (event, { api, key }) => api.spans.spanPointerdown(event, key) },
    }),
    cell: slot<{ row: number; col: number }>({
      props: { row: "number", col: "number" },
      selects: selects({ cell: byCell, value: [], moving: [] }),
      attrs: (state, { api, props }) => ({ tabindex: api.grid.tabIndex(state, props) }),
      on: {
        keydown: (event, { api }) => {
          api.grid.keydown(event)
        },
        pointerdown: (event, { api, props }) => {
          api.grid.focus(props, { reason: "item-press", event })
        },
      },
      bind: (el, { api, props }) => api.grid.bind(el, props),
    }),
  }),
})

/** Hand an element to a ref of either kind. */
function assignRef<T>(ref: React.Ref<T> | undefined, el: T | null) {
  if (typeof ref === "function") ref(el)
  else if (ref) (ref as React.RefObject<T | null>).current = el
}

/** Element props with `data-*` keys, which an object literal cannot name for a typed part. */
const dataProps = (o: Record<string, unknown>) => o as PartProps<"div">
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ")

/* ── Context ──────────────────────────────────────────────────────── */

type Registered = CalSpan & { label: string; disabled: boolean }
export type CalendarDay = { id: string; today: boolean }

type Ctx = {
  handle: PrimitiveHandle<typeof week>
  days: CalendarDay[]
  snap: number
  hourHeight: number
  /** Which way the last week change went (for the slide), and a key that changes with it. */
  dir: -1 | 0 | 1
  viewKey: string
  value: string | null
  setValue: (id: string | null) => void
  held: HeldPlace | null
  setHeld: (h: HeldPlace | null) => void
  active: GridCell | null
  register: (span: Registered) => void
  unregister: (id: string) => void
  spanAt: (day: string, minute: number) => Registered | undefined
  focusCell: (dayIndex: number, minute: number) => void
  /** The Grid's element, so a query for a cell stays inside this calendar. */
  gridRef: React.RefObject<HTMLDivElement | null>
  onMove: (id: string, day: string, minute: number) => boolean
  propose: (day: string, minute: number) => void
  announce: (text: string) => void
  describe: (day: string, minute: number) => string
  /** Where a tray item being dragged would land. */
  dropAt: { day: string; minute: number } | null
  setDropAt: (at: { day: string; minute: number } | null) => void
  cellLabel: (day: string, minute: number) => string
}

const CalendarContext = React.createContext<Ctx | null>(null)

function useCalendar(part: string) {
  const c = React.useContext(CalendarContext)
  if (!c) throw new Error(`${part} must sit inside <WeekCalendar>.`)
  return c
}

/** What the Grid's parts read while a pointer drags: the spans as they show, and their lanes. */
const DraftContext = React.createContext<{ shown: CalSpan[]; moving: SpansDraft<CalSpan> | null; lanes: Map<string, Lane> } | null>(null)

/* ── Root ─────────────────────────────────────────────────────────── */

export type WeekCalendarProps = {
  /** The Monday of the week shown, `YYYY-MM-DD`. Controlled with `onWeekChange`, or `defaultWeek`. */
  week?: string
  defaultWeek?: string
  onWeekChange?: (week: string) => void
  /** `week` (seven columns) or `day` (one column, `day`). */
  view?: "week" | "day"
  /** In the `day` view: which day, `YYYY-MM-DD`. */
  day?: string
  /** Today, `YYYY-MM-DD`: its column and head are marked. */
  today?: string
  /** The picked block's `value`, or null. Controlled with `onValueChange`, or `defaultValue`. */
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
  /** A block was dropped (pointer) or put down (Enter). Return false to put it back. */
  onMove: (value: string, day: string, minute: number) => boolean
  /** Enter, or a click, on an empty stretch of time. */
  onPropose?: (day: string, minute: number) => void
  /** The snap, and what an arrow moves a held block by. Default 15. */
  snapMinutes?: number
  /** The height of an hour, in px. Default 56. */
  hourHeight?: number
  /** Where the tab stop sits before the grid is entered (minutes). Default 07:00. */
  startMinute?: number
  /** Says a move, a pick-up, a put-back. Default: the page's Announcer (useAnnounce). */
  onAnnounce?: (text: string) => void
  /** How a place is said ("Tue 08:15"). */
  describe?: (day: string, minute: number) => string
  children: React.ReactNode
}

function WeekCalendarRoot({
  week: weekProp,
  defaultWeek,
  onWeekChange,
  view = "week",
  day,
  today,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  onMove,
  onPropose,
  snapMinutes = 15,
  hourHeight = 56,
  startMinute = 7 * 60,
  onAnnounce,
  describe = describePlace,
  children,
}: WeekCalendarProps) {
  const pageAnnounce = useAnnounce()
  const announce = onAnnounce ?? pageAnnounce
  const [weekStart] = useControllable(weekProp, defaultWeek ?? today ?? "1970-01-05", onWeekChange)
  const [value, setValue] = useControllable<string | null>(valueProp, defaultValue, onValueChange)
  const [held, setHeld] = React.useState<HeldPlace | null>(null)
  const [active, setActive] = React.useState<GridCell | null>(null)
  const [dropAt, setDropAt] = React.useState<{ day: string; minute: number } | null>(null)
  const gridRef = React.useRef<HTMLDivElement | null>(null)

  // The slide's direction, from the last week change (adjusted in render, React's way to follow a prop).
  const [seenWeek, setSeenWeek] = React.useState(weekStart)
  const [dir, setDir] = React.useState<-1 | 0 | 1>(0)
  if (seenWeek !== weekStart) {
    setDir(weekStart < seenWeek ? -1 : 1)
    setSeenWeek(weekStart)
  }

  const days: CalendarDay[] = React.useMemo(() => {
    const ids = view === "day" && day ? [day] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    return ids.map((id) => ({ id, today: id === today }))
  }, [view, day, weekStart, today])

  // Blocks register themselves (their place, variant, label), so the root can hand ui-sdk the spans.
  const [registry, setRegistry] = React.useState<ReadonlyMap<string, Registered>>(() => new Map())
  const register = React.useCallback((span: Registered) => {
    setRegistry((prev) => {
      const was = prev.get(span.id)
      if (was && was.track === span.track && was.start === span.start && was.end === span.end && was.variant === span.variant && was.label === span.label && was.disabled === span.disabled) return prev
      return new Map(prev).set(span.id, span)
    })
  }, [])
  const unregister = React.useCallback((id: string) => {
    setRegistry((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])
  // A refused drop changes nothing in the registry; this makes a new array anyway, so ui-sdk's draft resets to what is true.
  const [refused, setRefused] = React.useState(0)
  const spans = React.useMemo(() => {
    void refused
    return [...registry.values()]
  }, [registry, refused])
  // Read by callbacks that must stay stable (the memoised cells) and by ui-sdk's options.
  const latest = React.useRef(registry)
  React.useLayoutEffect(() => {
    latest.current = registry
  })

  const spanAt = React.useCallback(
    (d: string, minute: number) =>
      [...latest.current.values()]
        .filter((s) => s.track === d && s.start <= minute && minute < s.end)
        .sort((a, b) => (a.variant === "post" ? -1 : 1) - (b.variant === "post" ? -1 : 1))[0],
    []
  )

  const todayIndex = Math.max(0, days.findIndex((d) => d.today))
  const handle = usePrimitive(week, {
    value: spans,
    tracks: days.map((d) => d.id),
    cols: days.length,
    rows: DAY_MINUTES / snapMinutes,
    step: snapMinutes,
    startCell: { row: Math.floor(startMinute / snapMinutes), col: view === "week" ? todayIndex : 0 },
    disabled: (s: CalSpan) => latest.current.get(s.id)?.disabled ?? true,
    label: (s: CalSpan) => latest.current.get(s.id)?.label ?? s.id,
    onCell: (cell: GridCell) => {
      setActive(cell)
      const d = days[cell.col]
      if (!d) return
      const s = spanAt(d.id, cell.row * snapMinutes)
      if (s && !held) setValue(s.id)
    },
    onValueChange: (next: CalSpan[]) => {
      const moved = next.find((n) => {
        const was = latest.current.get(n.id)
        return was && (was.track !== n.track || was.start !== n.start)
      })
      if (moved && !onMove(moved.id, moved.track, moved.start)) setRefused((r) => r + 1)
    },
  })

  const focusCell = (dayIndex: number, minute: number) => {
    const row = Math.floor(minute / snapMinutes)
    handle.api.grid.focus({ row, col: dayIndex }, { reason: "imperative" })
    // A press on a block: the scroller under it may have taken focus on mousedown. Put it on the cell.
    const d = days[dayIndex]
    const el = d ? gridRef.current?.querySelector<HTMLElement>(`[data-cell-day="${d.id}"][data-cell-minute="${row * snapMinutes}"]`) : null
    if (el && document.activeElement !== el) el.focus({ preventScroll: true })
  }

  const proposeRef = React.useRef(onPropose)
  React.useLayoutEffect(() => {
    proposeRef.current = onPropose
  })
  const propose = React.useCallback((d: string, m: number) => proposeRef.current?.(d, m), [])

  // A new function when the blocks change, so the memoised cells re-read their names.
  const cellLabel = React.useCallback(
    (d: string, minute: number) => {
      const here = [...registry.values()].find((s) => s.track === d && s.start === minute)
      return `${describeCell(d, minute)}${here ? `: ${here.label}` : ""}`
    },
    [registry]
  )

  const ctx: Ctx = {
    handle,
    days,
    snap: snapMinutes,
    hourHeight,
    dir,
    viewKey: weekStart + view + (view === "day" ? day : ""),
    value,
    setValue,
    held,
    setHeld,
    active,
    register,
    unregister,
    spanAt,
    focusCell,
    gridRef,
    onMove,
    propose,
    announce,
    describe,
    dropAt,
    setDropAt,
    cellLabel,
  }
  return <CalendarContext value={ctx}>{children}</CalendarContext>
}

/* ── Header and DayHead ───────────────────────────────────────────── */

export type WeekCalendarHeaderProps = React.ComponentPropsWithRef<"div">

/** The day heads, over the grid: one `DayHead` per day shown, unless you pass your own. Sticky. A picture: hidden from assistive tech (each cell says its day). */
function Header({ className, style, children, ...rest }: WeekCalendarHeaderProps) {
  const c = useCalendar("WeekCalendar.Header")
  return (
    <div
      key={c.viewKey}
      aria-hidden
      className={cx("wc-head", className)}
      data-dir={c.dir || undefined}
      style={{ ["--wc-days" as string]: c.days.length, ...style } as React.CSSProperties}
      {...rest}
    >
      <span />
      {children ?? c.days.map((d) => <DayHead key={d.id} day={d.id} />)}
    </div>
  )
}

export type WeekCalendarDayHeadProps = React.ComponentPropsWithRef<"span"> & {
  /** The day, `YYYY-MM-DD`. */
  day: string
}

/** One day's head: "Mon 16". `data-today` and `data-past` (before today) for styles. */
function DayHead({ day, className, children, ...rest }: WeekCalendarDayHeadProps) {
  const c = useCalendar("WeekCalendar.DayHead")
  const today = c.days.find((d) => d.today)?.id
  return (
    <span className={cx("wc-dayhead", className)} data-today={day === today || undefined} data-past={(today && day < today) || undefined} {...rest}>
      {children ?? (
        <>
          <span>{weekdayShort(day)}</span>
          <span className="wc-date">{dateOfKey(day).getUTCDate()}</span>
        </>
      )}
    </span>
  )
}

/* ── Grid ─────────────────────────────────────────────────────────── */

export type WeekCalendarGridProps = Omit<React.ComponentPropsWithRef<"div">, "children"> & {
  /** The time axis, left of the days: a `WeekCalendar.TimeAxis`. */
  axis?: React.ReactNode
  /** What stands on the time: Blocks, the NowLine, Notes, a Proposal. */
  children?: React.ReactNode
}

const GRID_LABEL = "Week calendar. Arrow keys move through the quarter hours; Enter picks up a block, or offers what could go in an empty one."

/**
 * The days and their quarter hours (the focus grid: arrows, Home / End,
 * Page Up / Down), with everything placed on them in one layer. Enter on a
 * block picks it up; ↑ ↓ move it a snap, ⇧↑ ⇧↓ an hour, ← → a day; Enter puts
 * it down, Escape (or leaving the grid) puts it back. Enter on empty time
 * proposes (`onPropose`).
 *
 * `role="application"` with a name that says its keys: a screen reader
 * passes the arrows through, and each cell keeps its own name.
 */
function Grid({ axis, className, style, children, ref, "aria-label": ariaLabel = GRID_LABEL, ...rest }: WeekCalendarGridProps) {
  const c = useCalendar("WeekCalendar.Grid")
  const { days, snap, held, setHeld, announce, describe } = c
  const n = days.length

  const step = (h: HeldPlace, dDay: number, dMin: number) => {
    const span = c.spanAt(days[h.fromDay]!.id, h.fromStart)
    return stepHeld(h, dDay, dMin, { days: n, length: span ? span.end - span.start : snap * 3 })
  }

  const putBack = (h: HeldPlace) => {
    setHeld(null)
    announce(`Put back, ${describe(days[h.fromDay]!.id, h.fromStart)}.`)
  }

  const onKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (held) {
      let next: HeldPlace | null = null
      if (e.key === "ArrowUp") next = step(held, 0, e.shiftKey ? -60 : -snap)
      else if (e.key === "ArrowDown") next = step(held, 0, e.shiftKey ? 60 : snap)
      else if (e.key === "ArrowLeft") next = step(held, -1, 0)
      else if (e.key === "ArrowRight") next = step(held, 1, 0)
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        e.stopPropagation()
        const at = held
        setHeld(null)
        if (at.day === at.fromDay && at.start === at.fromStart) {
          announce(`Dropped where it was, ${describe(days[at.day]!.id, at.start)}.`)
          return
        }
        if (!c.onMove(at.id, days[at.day]!.id, at.start)) c.focusCell(at.fromDay, at.fromStart)
        return
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        putBack(held)
        c.focusCell(held.fromDay, held.fromStart)
        return
      }
      if (next) {
        e.preventDefault()
        e.stopPropagation()
        setHeld(next)
        announce(describe(days[next.day]!.id, next.start))
        c.focusCell(next.day, next.start)
      }
      return
    }
    if (e.key !== "Enter" && e.key !== " ") return
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell-day]")
    if (!cell) return
    e.preventDefault()
    const d = cell.dataset.cellDay!
    const minute = Number(cell.dataset.cellMinute)
    const s = c.spanAt(d, minute)
    if (!s) {
      c.propose(d, minute)
      return
    }
    c.setValue(s.id)
    if (s.disabled) return
    const i = days.findIndex((x) => x.id === s.track)
    setHeld({ id: s.id, day: i, start: s.start, fromDay: i, fromStart: s.start })
    announce(`Picked up ${s.label}. Arrows move it, Shift and an arrow an hour. Enter drops, Escape puts it back.`)
  }

  const { gridRef } = c
  const setRefs = React.useCallback(
    (el: HTMLDivElement | null) => {
      assignRef(gridRef, el)
      assignRef(ref, el)
    },
    [gridRef, ref]
  )

  return usePart(
    c.handle,
    "root",
    {},
    {
      ...rest,
      ref: setRefs,
      className: cx("wc-grid", className),
      role: "application",
      "aria-label": ariaLabel,
      "aria-roledescription": "week calendar",
      onKeyDownCapture,
      // A held block never outlives focus: leaving the grid puts it back.
      onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
        if (!held || e.currentTarget.contains(e.relatedTarget as Node | null)) return
        putBack(held)
      },
      style: { ["--wc-hour" as string]: `${c.hourHeight}px`, ["--wc-days" as string]: n, ...style } as React.CSSProperties,
      children: ({ spans: shown, moving }: { spans: CalSpan[]; moving: SpansDraft<CalSpan> | null }) => (
        <DraftContext value={{ shown, moving, lanes: lanesOf(shown, held?.id) }}>
          <div className="wc-body" key={c.viewKey} data-dir={c.dir || undefined} style={{ height: 24 * c.hourHeight }}>
            {axis}
            <Days days={days} hourHeight={c.hourHeight} snap={snap} cellLabel={c.cellLabel} spanAt={c.spanAt} propose={c.propose} />
            <div className="wc-layer" aria-hidden>
              {children}
              {c.dropAt ? <Proposal day={c.dropAt.day} minute={c.dropAt.minute} /> : null}
            </div>
          </div>
        </DraftContext>
      ),
    },
    "div"
  )
}

/**
 * The day tracks and their quarter-hour cells: the grid that takes focus.
 * Memoised, so a drag (which re-renders the blocks every frame) never
 * re-renders the cells.
 */
const Days = React.memo(function Days({
  days,
  hourHeight,
  snap,
  cellLabel,
  spanAt,
  propose,
}: {
  days: CalendarDay[]
  hourHeight: number
  snap: number
  cellLabel: (day: string, minute: number) => string
  spanAt: (day: string, minute: number) => Registered | undefined
  propose: (day: string, minute: number) => void
}) {
  const rows = DAY_MINUTES / snap
  return (
    <div className="wc-tracks">
      {days.map((d, col) => (
        <Day key={d.id} day={d}>
          {Array.from({ length: rows }, (_, row) => (
            <Cell
              key={row}
              row={row}
              col={col}
              day={d.id}
              minute={row * snap}
              height={(hourHeight * snap) / 60}
              label={cellLabel(d.id, row * snap)}
              onClick={() => {
                if (!spanAt(d.id, row * snap)) propose(d.id, row * snap)
              }}
            />
          ))}
        </Day>
      ))}
    </div>
  )
})

/** One day's track: a column the blocks are dropped on. Grid renders it (it is not a public part); `data-today` for its recess. */
function Day({ day, children }: { day: CalendarDay; children: React.ReactNode }) {
  return usePart(week, "track", { value: day.id }, dataProps({ className: "wc-track", "data-track-day": day.id, "data-today": day.today || undefined, children }), "div")
}

function Cell({ row, col, day, minute, height, label, onClick }: { row: number; col: number; day: string; minute: number; height: number; label: string; onClick: () => void }) {
  return usePart(
    week,
    "cell",
    { row, col },
    dataProps({
      className: "wc-cell",
      role: "button",
      "aria-label": label,
      "data-cell-day": day,
      "data-cell-minute": minute,
      "data-hour": minute % 60 === 0 || undefined,
      "data-half": minute % 60 === 30 || undefined,
      style: { height },
      onClick,
    }),
    "div"
  )
}

/* ── TimeAxis ─────────────────────────────────────────────────────── */

export type WeekCalendarTimeAxisProps = React.ComponentPropsWithRef<"div"> & {
  /** Now, in minutes: said in ink where the hour label would be. */
  now?: number | null
}

/** The hours down the left, every hour labelled. A picture: each cell says its time. */
function TimeAxis({ now = null, className, ...rest }: WeekCalendarTimeAxisProps) {
  const c = useCalendar("WeekCalendar.TimeAxis")
  const h = c.hourHeight
  return (
    <div aria-hidden className={cx("wc-gutter", className)} {...rest}>
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i} className="wc-hour" data-hidden={now != null && Math.abs(now - i * 60) < 20 ? "" : undefined} style={{ top: i * h }}>
          {i === 0 ? "" : `${String(i).padStart(2, "0")}:00`}
        </span>
      ))}
      {now != null ? (
        <span className="wc-now-time" style={{ top: (now / 60) * h }}>
          {hhmm(now)}
        </span>
      ) : null}
    </div>
  )
}

/* ── Things placed on the time ────────────────────────────────────── */

export type BlockState = {
  /** Where it is drawn now (a drag's draft, or a held block's place), in minutes. */
  start: number
  /** The grid's focus is on one of its cells. */
  focused: boolean
  picked: boolean
  lifted: boolean
}

export type WeekCalendarBlockProps = Omit<React.ComponentPropsWithRef<"div">, "children"> & {
  /** Its id: what `value` / `onValueChange` and `onMove` name. */
  value: string
  /** `YYYY-MM-DD`. */
  day: string
  /** Minutes from midnight. `end` sets how tall it is drawn. */
  start: number
  end: number
  /** `post` (raised, movable), `slot` (dashed), `passed` (a quieter dash). */
  variant?: BlockVariant
  /** Free data for the page's styles, written as `data-state`. */
  state?: string
  /** It cannot be moved by pointer or key. A `slot` or `passed` block never moves. */
  disabled?: boolean
  /** Its name for assistive tech. */
  label: string
  children?: React.ReactNode | ((state: BlockState) => React.ReactNode)
}

/** A block on the time. Picks itself on a press; drags when it is a movable `post`. */
function Block({ value, day, start, end, variant = "post", state, disabled = false, label, className, style, children, ...rest }: WeekCalendarBlockProps) {
  const c = useCalendar("WeekCalendar.Block")
  const draft = React.useContext(DraftContext)
  const off = disabled || variant !== "post"
  const { register, unregister } = c
  React.useLayoutEffect(() => {
    register({ id: value, track: day, start, end, variant, label, disabled: off })
  }, [register, value, day, start, end, variant, label, off])
  React.useEffect(() => () => unregister(value), [unregister, value])

  const shown = draft?.shown.find((s) => s.id === value)
  const isHeld = c.held?.id === value
  const d = isHeld ? c.held!.day : c.days.findIndex((x) => x.id === (shown?.track ?? day))
  const at = isHeld ? c.held!.start : (shown?.start ?? start)
  const len = end - start
  const lane = draft?.lanes.get(value) ?? { lane: 0, lanes: 1 }
  const focused = !!c.active && c.active.col === d && c.active.row * c.snap >= at && c.active.row * c.snap < at + len
  const picked = c.value === value
  const lifted = isHeld || draft?.moving?.id === value
  const content = typeof children === "function" ? children({ start: at, focused, picked, lifted }) : children
  const part = usePart(
    week,
    "span",
    { value },
    dataProps({
      ...rest,
      className: cx("wc-block", className),
      style: { ...placeOnLayer(d, at, len, c.days.length, lane), ...(style as React.CSSProperties) },
      onClick: () => {
        c.setValue(value)
        c.focusCell(d, at)
      },
      // Keep focus where the grid puts it (the block's cell), not on the scroller under the press.
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      "data-variant": variant,
      "data-state": state,
      "data-movable": !off || undefined,
      "data-picked": picked || undefined,
      "data-held": isHeld || undefined,
      "data-focused": focused || undefined,
      "data-lifted": lifted || undefined,
      children: content,
    }),
    "div"
  )
  return d < 0 ? null : part
}

export type WeekCalendarNowLineProps = React.ComponentPropsWithRef<"span"> & { day: string; minute: number }

/** Now: one still ink line across its day. No dot, no pulse, no tick. */
function NowLine({ day, minute, className, style, ...rest }: WeekCalendarNowLineProps) {
  const c = useCalendar("WeekCalendar.NowLine")
  const n = c.days.length
  const d = c.days.findIndex((x) => x.id === day)
  if (d < 0) return null
  return (
    <span
      className={cx("wc-now", className)}
      style={{ width: `calc(100cqw / ${n})`, translate: `calc(100cqw / ${n} * ${d}) calc(${minute / DAY_MINUTES} * 100cqh)`, ...style }}
      {...rest}
    />
  )
}

export type WeekCalendarNoteProps = React.ComponentPropsWithRef<"span"> & { day: string; minute: number }

/** A note written on the time, at a day and minute. Never takes a press. */
function Note({ day, minute, className, style, children, ...rest }: WeekCalendarNoteProps) {
  const c = useCalendar("WeekCalendar.Note")
  const n = c.days.length
  const d = c.days.findIndex((x) => x.id === day)
  if (d < 0) return null
  return (
    <span className={cx("wc-note", className)} style={{ width: `calc(100cqw / ${n} - 8px)`, translate: `calc(100cqw / ${n} * ${d} + 6px) calc(${minute / DAY_MINUTES} * 100cqh)`, ...style }} {...rest}>
      {children}
    </span>
  )
}

export type WeekCalendarProposalProps = React.ComponentPropsWithRef<"span"> & {
  day: string
  minute: number
  /** How tall it is drawn, in minutes. Default 45. */
  length?: number
}

/** Where something would go: a dashed ink outline at a day and minute (a proposal, a drop). */
function Proposal({ day, minute, length = 45, className, style, ...rest }: WeekCalendarProposalProps) {
  const c = useCalendar("WeekCalendar.Proposal")
  const d = c.days.findIndex((x) => x.id === day)
  if (d < 0) return null
  return <span className={cx("wc-proposal", className)} style={{ ...placeOnLayer(d, minute, length, c.days.length), ...style }} {...rest} />
}

/* ── Tray ─────────────────────────────────────────────────────────── */

export type WeekCalendarTrayProps = React.ComponentPropsWithRef<"section"> & {
  /** The tray's name, shown over its items ("Approved, no time"). */
  label: string
}

/** Things with no time yet, over the grid. */
function Tray({ label, className, children, ...rest }: WeekCalendarTrayProps) {
  useCalendar("WeekCalendar.Tray")
  const headingId = React.useId()
  return (
    <section aria-labelledby={headingId} className={cx("wc-tray", className)} {...rest}>
      <h2 id={headingId} className="text-kit-meta font-kit-strong text-kit-ink-muted">
        {label}
      </h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

export type WeekCalendarTrayItemProps = Omit<React.ComponentPropsWithRef<"button">, "value"> & {
  /** Its id: a press picks it (`onValueChange`). */
  value: string
  /**
   * It was dragged onto the grid and let go, at a day and a snapped minute.
   * Without it the item is pressed, never dragged. Not `onDrop`: that is the
   * browser's own drag and drop, which this does not use.
   */
  onPlace?: (day: string, minute: number) => void
}

/**
 * One thing in the tray. A press picks it. With `onPlace`, a drag carries a
 * copy that follows the pointer one to one (ui-sdk's `bindDrag` +
 * `bindDragPreview`), the snapped place under it drawn as a Proposal; Escape
 * cancels.
 */
function TrayItem({ value, onPlace, className, onClick, onPointerDown, children, type = "button", ...rest }: WeekCalendarTrayItemProps) {
  const c = useCalendar("WeekCalendar.TrayItem")
  const { setDropAt, snap, gridRef } = c
  const at = (x: number, y: number) => {
    const track = document
      .elementsFromPoint(x, y)
      .map((el) => (el as HTMLElement).closest<HTMLElement>("[data-track-day]"))
      .find((el) => el && gridRef.current?.contains(el))
    if (!track) return null
    const r = track.getBoundingClientRect()
    return { day: track.dataset.trackDay!, minute: minuteAtY(y, r.top, r.height, snap) }
  }
  return (
    <button
      type={type}
      className={cx("wc-chip", className)}
      data-picked={c.value === value || undefined}
      data-draggable={onPlace ? "" : undefined}
      aria-pressed={c.value === value}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) c.setValue(value)
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (event.defaultPrevented || !onPlace) return
        const el = event.currentTarget
        let preview: ReturnType<typeof bindDragPreview> | null = null
        let last: { day: string; minute: number } | null = null
        bindDrag(el, event.nativeEvent, {
          threshold: dragThreshold,
          cancelOnEscape: true,
          onStart: (e) => {
            preview = bindDragPreview(el, { x: e.clientX, y: e.clientY })
            preview.el.setAttribute("data-lifted", "")
          },
          onMove: ({ x, y }) => {
            preview?.move(x, y)
            // The preview follows every move; the calendar re-renders only
            // when the snapped place under it changes, not once a pointer event.
            const next = at(x, y)
            if (next?.day !== last?.day || next?.minute !== last?.minute) setDropAt(next)
            last = next
          },
          onEnd: (_e, canceled) => {
            preview?.remove()
            setDropAt(null)
            if (!canceled && last) onPlace(last.day, last.minute)
          },
        })
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

/** The calendar's state, for a part written by hand: the days shown, the picked value, the snap and the hour. */
export function useWeekCalendar() {
  const c = useCalendar("useWeekCalendar")
  return { days: c.days, value: c.value, setValue: c.setValue, snap: c.snap, hourHeight: c.hourHeight }
}

export const WeekCalendar = Object.assign(WeekCalendarRoot, {
  Header,
  DayHead,
  Grid,
  TimeAxis,
  Block,
  NowLine,
  Note,
  Proposal,
  Tray,
  TrayItem,
})
