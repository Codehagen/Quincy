"use client"

import * as React from "react"
import {
  byCell,
  createChange,
  createGridFocus,
  createSpans,
  definePrimitive,
  selects,
  stackSpans,
  type ChangeDetails,
  type GridCell,
  type Span,
  type SpansDraft,
  type SpansReason,
} from "@ui-sdk/core"
import { usePart, usePrimitive, type PartProps } from "@ui-sdk/react/primitive"

/** Element props with `data-*` keys, which an object literal cannot name for a typed part. */
const dataProps = (o: Record<string, unknown>) => o as PartProps<"div">

/**
 * The week as a calendar: days across, continuous time down (00:00 to
 * 24:00, a 15-minute snap), posts as blocks at their exact minute. Built on
 * ui-sdk only (never Base UI in this component):
 *
 * - `createSpans`: the blocks on day tracks, the pointer drag between days
 *   and times with a snapped draft, auto-scroll at the scroller's edge, and
 *   `stackSpans` for blocks that land at nearly the same time (side by side).
 * - `createGridFocus`: one tab stop, the arrows through 96 quarter-hour rows
 *   by 7 days, Home / End, Page Up / Page Down.
 *
 * What ui-sdk does not have, built here and kept small:
 *
 * - **A "pick up, move, drop" keyboard mode on a span.** `spans.keydown`
 *   commits every arrow at once, and Shift resizes; the brief asks for a
 *   held block that Enter drops and Escape puts back, with ⇧ meaning an
 *   hour. The held position is local state until Enter.
 * - **The settle spring.** ui-sdk's spring solver (`springLinearEasing`) is
 *   internal, not exported, so the drop's spring is a CSS `linear()` curve
 *   (candidates.css, `--ll-spring`).
 * - **Following the pointer between snaps.** The draft snaps to 15 minutes;
 *   the block glides between snaps on a 60ms transition, so it never jumps.
 */

export type CalSpan = Span & {
  /** The store item's key (a post id, or `slot:<id>:<day>`). */
  key: string
  kind: "post" | "open" | "passed"
  /** A post's state (queued, sending, published, failed), for its surface. */
  state?: string
}

type WeekState = { value: CalSpan[]; moving: SpansDraft<CalSpan> | null; cell: GridCell | null }

type WeekOptions = {
  value?: CalSpan[]
  onValueChange?: (value: CalSpan[], details: ChangeDetails<SpansReason>) => void
  /** Spans a pointer cannot move: sent, sending, failed, an open slot, a passed time. */
  locked?: (span: CalSpan) => boolean
  label?: (span: CalSpan) => string
  tracks?: string[]
  cols?: number
  onCell?: (cell: GridCell) => void
  /** Where the tab stop is before the grid is entered (the working morning, not 00:00). */
  startCell?: GridCell
}

export const QUARTERS = 96
const DAY = 24 * 60
export const STEP = 15

const week = definePrimitive({
  name: "lineup-week",
  options: {
    value: "list",
    onValueChange: "callback",
    locked: "value",
    label: "value",
    tracks: "list",
    cols: "value",
    onCell: "value",
    startCell: "value",
  },
  state: (options: WeekOptions): WeekState => ({ value: options.value ?? [], moving: null, cell: options.startCell ?? null }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context)
    return {
      spans: createSpans<WeekState, CalSpan>(context, {
        key: "value",
        draft: "moving",
        set: (value, details) => change("value", value, details),
        min: () => 0,
        max: () => DAY,
        step: () => STEP,
        axis: "y",
        overlap: true,
        tracks: () => context.options().tracks ?? [],
        disabled: (span) => context.options().locked?.(span) ?? false,
        label: (span) => context.options().label?.(span) ?? span.id,
        // The page says each move once, through its own announcer (the store's note).
        message: () => "",
      }),
      grid: createGridFocus<WeekState>(context, {
        key: "cell",
        rows: () => QUARTERS,
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

export type GridDay = { id: string; short: string; date: number; today: boolean }

export type WeekGridProps = {
  days: GridDay[]
  spans: CalSpan[]
  hourPx: number
  selectedKey: string | null
  /** A proposal open on an empty cell. */
  ghost: { dayId: string; minute: number } | null
  /** Today's column and the clock, for the now line; null when today is not in view. */
  now: { dayId: string; minute: number } | null
  locked: (span: CalSpan) => boolean
  label: (span: CalSpan) => string
  cellLabel: (dayId: string, minute: number) => string
  onSelect: (key: string) => void
  /** Enter or a click on an empty quarter hour. */
  onPropose: (dayId: string, minute: number) => void
  /** A pointer drop, or Enter on a held block. Returns whether the store took it. */
  onMove: (key: string, dayId: string, minute: number) => boolean
  announce: (text: string) => void
  /** Said while a block is held: "Tue 08:15". */
  describe: (dayId: string, minute: number) => string
  renderBlock: (span: CalSpan, focused: boolean, start: number) => React.ReactNode
  /** Changes on a week switch; the body slides in from `dir`. */
  startCell: GridCell
  weekKey: string
  dir: -1 | 0 | 1
  reduced: boolean
}

type Held = { key: string; day: number; start: number; fromDay: number; fromStart: number }

export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`

export function WeekGrid(props: WeekGridProps) {
  const { days, spans, hourPx, selectedKey, ghost, now, onSelect, onPropose, onMove, announce, describe, renderBlock, weekKey, dir } = props
  const [held, setHeld] = React.useState<Held | null>(null)
  const [active, setActive] = React.useState<GridCell | null>(null)
  const tracks = React.useMemo(() => days.map((d) => d.id), [days])

  // Read through a ref, so the memoised cells keep one stable callback.
  const spansRef = React.useRef(spans)
  React.useLayoutEffect(() => {
    spansRef.current = spans
  })
  const spanAt = React.useCallback(
    (dayId: string, minute: number) =>
      spansRef.current
        .filter((s) => s.track === dayId && s.start <= minute && minute < s.end)
        .sort((a, b) => (a.kind === "post" ? -1 : 1) - (b.kind === "post" ? -1 : 1))[0],
    []
  )

  const handle = usePrimitive(week, {
    value: spans,
    tracks,
    cols: days.length,
    startCell: props.startCell,
    locked: props.locked,
    label: props.label,
    onCell: (cell: GridCell) => {
      setActive(cell)
      const day = days[cell.col]
      if (!day) return
      const s = spanAt(day.id, cell.row * STEP)
      if (s && !held) onSelect(s.key)
    },
    onValueChange: (next: CalSpan[]) => {
      // A pointer drop: the span whose place changed.
      const moved = next.find((n) => {
        const was = spans.find((s) => s.id === n.id)
        return was && (was.track !== n.track || was.start !== n.start)
      })
      if (moved) onMove(moved.key, moved.track, moved.start)
    },
  })

  const focusCell = (dayIdx: number, minute: number) => {
    const row = Math.floor(minute / STEP)
    handle.api.grid.focus({ row, col: dayIdx }, { reason: "imperative" })
    // A press on a block: the scroller under it may have taken focus on mousedown. Put it on the cell.
    const day = days[dayIdx]
    const el = day ? document.querySelector<HTMLElement>(`[data-cell-day="${day.id}"][data-cell-minute="${row * STEP}"]`) : null
    if (el && document.activeElement !== el) el.focus({ preventScroll: true })
  }

  const step = (h: Held, dDay: number, dMin: number): Held => {
    const span = spans.find((s) => s.key === h.key)!
    const len = span.end - span.start
    const day = Math.min(days.length - 1, Math.max(0, h.day + dDay))
    const start = Math.min(DAY - len, Math.max(0, h.start + dMin))
    return { ...h, day, start }
  }

  const onKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (held) {
      let next: Held | null = null
      if (e.key === "ArrowUp") next = step(held, 0, e.shiftKey ? -60 : -STEP)
      else if (e.key === "ArrowDown") next = step(held, 0, e.shiftKey ? 60 : STEP)
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
        if (!onMove(at.key, days[at.day]!.id, at.start)) focusCell(at.fromDay, at.fromStart)
        return
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setHeld(null)
        announce(`Put back, ${describe(days[held.fromDay]!.id, held.fromStart)}.`)
        focusCell(held.fromDay, held.fromStart)
        return
      }
      if (next) {
        e.preventDefault()
        e.stopPropagation()
        setHeld(next)
        announce(describe(days[next.day]!.id, next.start))
        focusCell(next.day, next.start)
      }
      return
    }
    if (e.key !== "Enter" && e.key !== " ") return
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell-day]")
    if (!cell) return
    e.preventDefault()
    const dayId = cell.dataset.cellDay!
    const minute = Number(cell.dataset.cellMinute)
    const s = spanAt(dayId, minute)
    if (!s) {
      onPropose(dayId, minute)
      return
    }
    onSelect(s.key)
    if (props.locked(s)) return
    const d = days.findIndex((x) => x.id === s.track)
    setHeld({ key: s.key, day: d, start: s.start, fromDay: d, fromStart: s.start })
    announce(`Picked up ${props.label(s)}. Arrows move it, Shift and an arrow an hour. Enter drops, Escape puts it back.`)
  }

  const n = days.length
  const height = 24 * hourPx

  return usePart(
    handle,
    "root",
    {},
    {
      className: "ll-week",
      "aria-roledescription": "week calendar",
      onKeyDownCapture,
      style: { ["--ll-hour" as string]: `${hourPx}px`, ["--ll-days" as string]: n } as React.CSSProperties,
      children: ({ spans: shown, moving }: { spans: CalSpan[]; moving: SpansDraft<CalSpan> | null }) => {
        const lanes = stackSpans(shown)
        return (
          <div className="ll-week-body" key={weekKey} data-dir={dir || undefined} style={{ height }}>
            <div className="ll-week-gutter" aria-hidden>
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="ll-week-hour" style={{ top: h * hourPx }}>
                  {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>
            <Tracks days={days} hourPx={hourPx} cellLabel={props.cellLabel} onPropose={onPropose} spanAt={spanAt} />
            <div className="ll-week-layer" aria-hidden>
              {now ? (
                <span
                  className="ll-week-now"
                  style={{
                    width: `calc(100cqw / ${n})`,
                    translate: `calc(100cqw / ${n} * ${days.findIndex((d) => d.id === now.dayId)}) calc(${now.minute / DAY} * 100cqh)`,
                  }}
                >
                  <span className="ll-week-now-dot" />
                </span>
              ) : null}
              {ghost && days.some((d) => d.id === ghost.dayId) ? (
                <span
                  className="ll-week-ghost"
                  style={place(days.findIndex((d) => d.id === ghost.dayId), ghost.minute, 45, n, { lane: 0, lanes: 1 })}
                />
              ) : null}
              {shown.map((s) => {
                const isHeld = held?.key === s.key
                const d = isHeld ? held!.day : days.findIndex((x) => x.id === s.track)
                const start = isHeld ? held!.start : s.start
                if (d < 0) return null
                const lane = isHeld ? { lane: 0, lanes: 1 } : (lanes.get(s.id) ?? { lane: 0, lanes: 1 })
                const activeHere = active && active.col === d && active.row * STEP >= start && active.row * STEP < start + (s.end - s.start)
                return (
                  <SpanBlock
                    key={s.id}
                    id={s.id}
                    style={place(d, start, s.end - s.start, n, lane)}
                    kind={s.kind}
                    state={s.state}
                    picked={selectedKey === s.key}
                    held={isHeld}
                    focused={!!activeHere}
                    dragging={moving?.id === s.id}
                    onPick={() => {
                      onSelect(s.key)
                      focusCell(d, start)
                    }}
                  >
                    {renderBlock(s, !!activeHere, start)}
                  </SpanBlock>
                )
              })}
            </div>
          </div>
        )
      },
    },
    "div"
  )
}

/** A block's box: its day column, its lane in that day, its minute. Moved by `translate` only, so a move animates. */
function place(day: number, start: number, len: number, n: number, lane: { lane: number; lanes: number }): React.CSSProperties {
  const col = `100cqw / ${n}`
  return {
    width: `calc(${col} / ${lane.lanes} - 4px)`,
    height: `calc(${len / DAY} * 100cqh - 2px)`,
    translate: `calc(${col} * ${day} + ${col} / ${lane.lanes} * ${lane.lane} + 2px) calc(${start / DAY} * 100cqh + 1px)`,
  }
}

function SpanBlock({
  id,
  style,
  kind,
  state,
  picked,
  held,
  focused,
  dragging,
  onPick,
  children,
}: {
  id: string
  style: React.CSSProperties
  kind: CalSpan["kind"]
  state?: string
  picked: boolean
  held: boolean
  focused: boolean
  dragging: boolean
  onPick: () => void
  children: React.ReactNode
}) {
  return usePart(
    week,
    "span",
    { value: id },
    dataProps({
      className: "ll-block",
      style,
      onClick: onPick,
      // Keep focus where the grid puts it (the block's cell), not on the scroller under the press.
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      "data-kind": kind,
      "data-state": state,
      "data-picked": picked || undefined,
      "data-held": held || undefined,
      "data-focused": focused || undefined,
      "data-lifted": held || dragging || undefined,
      children,
    }),
    "div"
  )
}

/**
 * The day tracks and their quarter-hour cells: the grid that takes focus.
 * Memoised, so a drag (which re-renders the blocks every frame) never
 * re-renders 672 cells.
 */
const Tracks = React.memo(function Tracks({
  days,
  hourPx,
  cellLabel,
  onPropose,
  spanAt,
}: {
  days: GridDay[]
  hourPx: number
  cellLabel: (dayId: string, minute: number) => string
  onPropose: (dayId: string, minute: number) => void
  spanAt: (dayId: string, minute: number) => CalSpan | undefined
}) {
  return (
    <div className="ll-week-tracks">
      {days.map((d, col) => (
        <Track key={d.id} day={d}>
          {Array.from({ length: QUARTERS }, (_, row) => (
            <Cell
              key={row}
              row={row}
              col={col}
              dayId={d.id}
              minute={row * STEP}
              hourPx={hourPx}
              label={cellLabel(d.id, row * STEP)}
              onClick={() => {
                if (!spanAt(d.id, row * STEP)) onPropose(d.id, row * STEP)
              }}
            />
          ))}
        </Track>
      ))}
    </div>
  )
})

function Track({ day, children }: { day: GridDay; children: React.ReactNode }) {
  return usePart(
    week,
    "track",
    { value: day.id },
    dataProps({ className: "ll-week-track", "data-track-day": day.id, "data-today": day.today || undefined, children }),
    "div"
  )
}

function Cell({ row, col, dayId, minute, hourPx, label, onClick }: { row: number; col: number; dayId: string; minute: number; hourPx: number; label: string; onClick: () => void }) {
  return usePart(
    week,
    "cell",
    { row, col },
    dataProps({
      className: "ll-week-cell",
      role: "button",
      "aria-label": label,
      "data-cell-day": dayId,
      "data-cell-minute": minute,
      "data-hour": minute % 60 === 0 || undefined,
      "data-half": minute % 60 === 30 || undefined,
      style: { height: hourPx / 4 },
      onClick,
    }),
    "div"
  )
}
