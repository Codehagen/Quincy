"use client"

/*
 * Built on ui-sdk (@ui-sdk/react/date-picker), not Base UI: Base UI has no
 * date picker. ui-sdk owns the popup (anchoring, dismiss, focus return) and
 * the calendar grid inside it; the time slots are plain buttons in the same
 * popup, so one component never mixes the two behaviour layers.
 */

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { DatePicker, DatePickerContent, DatePickerTrigger } from "@ui-sdk/react/date-picker"

import { CalendarMonth } from "./calendar-month"
import { CONTROL_SURFACE, FOCUS_RING, HIT_44 } from "./control-styles"
import { useControllable } from "./use-controllable"

/** An ISO date and a 24-hour "HH:MM" time. */
export type DateTimeValue = { date: string; time: string }

export type DateTimePickerProps = {
  /** Visible, always: "Publish on". */
  label: string
  value?: DateTimeValue | null
  defaultValue?: DateTimeValue | null
  onValueChange?: (value: DateTimeValue | null) => void
  /** The person's posting times, "HH:MM", in order. The only times offered. */
  times: readonly string[]
  /** Times already holding a post, per ISO date. Shown taken, and as dots on the day. */
  taken?: Readonly<Record<string, readonly string[]>>
  /**
   * Earliest pickable ISO date. For scheduling, today. Once every time today
   * has passed, the picker moves it to tomorrow on its own.
   */
  min?: string
  /** Today's ISO date. Defaults to the browser's; pass it for a stable picture. */
  today?: string
  /**
   * The IANA zone the times are written in ("Europe/Oslo"): the account's,
   * not the browser's. A time on today's date is "passed" against the wall
   * clock in this zone. Omitted, the browser's own zone, which is wrong
   * whenever someone schedules from a laptop in another country.
   */
  timeZone?: string
  disabled?: boolean
  /** A message from outside (the slot was taken meanwhile). Shown under the field. */
  error?: string
  placeholder?: string
}

// en-GB on purpose: "Thu 19 Nov" reads day-first, and server and client
// format the same string, so hydration agrees.
const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

function dayLabel(iso: string) {
  return DAY_LABEL.format(new Date(`${iso}T00:00:00Z`))
}

const MINUTE = 60_000
const pad = (n: number) => String(n).padStart(2, "0")

/**
 * The wall clock at `ms` in `timeZone` (the browser's when omitted),
 * "YYYY-MM-DD" and "HH:MM", as the times are written, and the day after.
 */
function wallClock(ms: number, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00"
  const date = `${get("year")}-${get("month")}-${get("day")}`
  // Calendar arithmetic on the date alone, in UTC, so no zone shifts it.
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return {
    date,
    time: `${get("hour")}:${get("minute")}`,
    tomorrow: `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`,
  }
}

function subscribeMinute(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>
  const schedule = () => {
    timer = setTimeout(() => {
      onChange()
      schedule()
    }, MINUTE - (Date.now() % MINUTE))
  }
  schedule()
  return () => clearTimeout(timer)
}

const minuteNow = () => Math.floor(Date.now() / MINUTE) * MINUTE

/**
 * The current minute, or null on the server and in the hydration pass, so
 * the markup agrees and the past is only greyed once the clock is known.
 */
function useMinute() {
  return React.useSyncExternalStore(subscribeMinute, minuteNow, () => null)
}

const CHIP =
  `relative h-9 rounded-full text-kit-body tabular-nums select-none ${FOCUS_RING} ${HIT_44} ` +
  "transition-[background-color,color,scale] duration-[var(--kit-duration-state),var(--kit-duration-state),var(--kit-duration-press)] ease-kit-out motion-reduce:transition-none " +
  "not-disabled:active:scale-(--kit-press-scale) motion-reduce:not-disabled:active:scale-100 " +
  `${CONTROL_SURFACE} text-kit-ink hover:not-disabled:bg-kit-control-hover ` +
  // Picked is the ink fill at the same weight, so the time does not reflow.
  "aria-pressed:bg-kit-primary aria-pressed:text-kit-primary-on aria-pressed:hover:bg-kit-primary-hover " +
  "disabled:cursor-default disabled:text-kit-ink-muted disabled:opacity-60 data-taken:line-through " +
  // Passed is quieter than taken and never struck: nothing sits there, the moment is just gone.
  "data-past:opacity-40"

/**
 * A day and one of the person's posting times, for scheduling a post. The
 * field shows "Thu 19 Nov · 09:00"; it opens a month (Monday first, dots
 * where posts already sit) with the day's times under it. Picking a day
 * keeps the popup open; picking a time commits and closes. Taken times stay
 * visible and say so, so the week's shape is never hidden.
 */
export function DateTimePicker({
  label,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  times,
  taken,
  min,
  today,
  timeZone,
  disabled = false,
  error,
  placeholder = "Pick a day and time",
}: DateTimePickerProps) {
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange)
  const [open, setOpen] = React.useState(false)
  const [day, setDay] = React.useState<string | null>(value?.date ?? null)
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const labelId = React.useId()
  const valueId = React.useId()
  const errorId = React.useId()

  const slots = React.useMemo(() => {
    const out: Record<string, number> = {}
    for (const [date, list] of Object.entries(taken ?? {})) out[date] = list.length
    return out
  }, [taken])

  const openChange = (next: boolean) => {
    setOpen(next)
    if (next) setDay(value?.date ?? null)
  }

  // A time today at or before this minute cannot be scheduled. Read after
  // mount, as the wall clock in `timeZone` (the times are "HH:MM" there).
  const minute = useMinute()
  const clock = React.useMemo(
    () => (minute === null ? null : wallClock(minute, timeZone)),
    [minute, timeZone],
  )
  const isPast = (date: string, time: string) =>
    clock !== null && (date < clock.date || (date === clock.date && time <= clock.time))
  const pastOnDay = new Set(day ? times.filter((t) => isPast(day, t)) : [])
  // When nothing is left today, today is no longer the earliest day.
  const todayIsOver = clock !== null && times.length > 0 && times.every((t) => isPast(clock.date, t))
  const effectiveMin =
    min !== undefined && clock !== null && todayIsOver && min <= clock.date ? clock.tomorrow : min

  const takenOnDay = new Set(day ? (taken?.[day] ?? []) : [])
  const free = times.filter((t) => !takenOnDay.has(t) && !pastOnDay.has(t))
  const shown = value ? `${dayLabel(value.date)} · ${value.time}` : null

  return (
    <div data-slot="kit-date-time-picker" className="flex w-full min-w-0 flex-col gap-1.5">
      <span id={labelId} className={`text-kit-body font-kit-strong text-kit-ink select-none ${disabled ? "opacity-50" : ""}`}>
        {label}
      </span>
      <DatePicker
        mode="single"
        value={day}
        onValueChange={(next) => setDay(typeof next === "string" ? next : null)}
        open={open}
        onOpenChange={openChange}
        closeOnSelect={false}
        min={effectiveMin}
        today={today}
        disabled={disabled}
        weekStartsOn={1}
        weekdayFormat="narrow"
        fixedWeeks
      >
        <div ref={setAnchor} className="w-full">
          <DatePickerTrigger
            // The label and what is picked, so it is announced
            // "Publish on, Thu 19 Nov · 12:00", not just "Publish on".
            aria-labelledby={`${labelId} ${valueId}`}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            className={
              `relative flex h-kit-control-md w-full min-w-0 items-center gap-2.5 rounded-kit-control px-3 text-left text-kit-body ${CONTROL_SURFACE} ${FOCUS_RING} ` +
              "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none hover:not-data-disabled:bg-kit-control-hover " +
              "aria-invalid:shadow-kit-invalid data-disabled:cursor-default data-disabled:opacity-50"
            }
          >
            <HugeiconsIcon icon={Calendar03Icon} size={16} strokeWidth={2} aria-hidden className="shrink-0 text-kit-ink-muted" />
            <span id={valueId} className={`min-w-0 flex-1 truncate tabular-nums ${shown ? "text-kit-ink" : "text-kit-ink-muted"}`}>
              {shown ?? placeholder}
            </span>
          </DatePickerTrigger>
        </div>
        <DatePickerContent
          anchor={anchor}
          sideOffset={6}
          collisionPadding={16}
          className={
            // shadow-kit-lifted (overlay-styles FLOATING_ELEVATION), as Menu, Select and Popover: every floating panel shares one elevation.
            // It grows from the trigger (ui-sdk's --transform-origin) and scrolls
            // rather than running off a short screen.
            "z-50 flex max-h-(--available-height) max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto overscroll-contain rounded-kit-object bg-kit-object p-3 text-kit-body text-kit-ink shadow-kit-lifted outline-none " +
            "origin-(--transform-origin) transition-[opacity,scale] duration-(--kit-duration-state) ease-kit-out " +
            "data-starting-style:scale-96 data-starting-style:opacity-0 data-ending-style:scale-96 data-ending-style:opacity-0 " +
            "motion-reduce:transition-[opacity] motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100"
          }
        >
          <CalendarMonth slots={slots} />
          <span aria-hidden className="h-px bg-kit-hairline" />
          <TimeSlots
            day={day}
            times={times}
            taken={takenOnDay}
            past={pastOnDay}
            freeCount={free.length}
            picked={value && value.date === day ? value.time : null}
            onPick={(time) => {
              if (!day) return
              setValue({ date: day, time })
              setOpen(false)
            }}
          />
        </DatePickerContent>
      </DatePicker>
      {error ? (
        <span id={errorId} className="text-kit-small text-kit-danger">
          {error}
        </span>
      ) : null}
    </div>
  )
}

function TimeSlots({
  day,
  times,
  taken,
  past,
  freeCount,
  picked,
  onPick,
}: {
  day: string | null
  times: readonly string[]
  taken: ReadonlySet<string>
  past: ReadonlySet<string>
  freeCount: number
  picked: string | null
  onPick: (time: string) => void
}) {
  const headingId = React.useId()
  if (times.length === 0) {
    return (
      <p className="max-w-72 px-1 text-kit-small text-kit-ink-muted">
        No posting times yet. Set them in Rhythm, and they show up here.
      </p>
    )
  }
  // With no day yet the times still show, unpickable: the popup keeps its
  // height when a day is picked, and the person sees what is on offer.
  return (
    <div className="flex w-full flex-col gap-2">
      <p id={headingId} className="px-1 text-kit-small font-kit-strong text-kit-ink-muted">
        {!day
          ? "Pick a day to see its times."
          : freeCount === 0
            ? past.size === 0
              ? `Every time on ${dayLabel(day)} is taken.`
              : times.every((t) => past.has(t))
                ? `Every time on ${dayLabel(day)} has passed.`
                : `Nothing left on ${dayLabel(day)}.`
            : `Times on ${dayLabel(day)}`}
      </p>
      <div role="group" aria-labelledby={headingId} className="grid w-full grid-cols-4 gap-1.5">
        {times.map((t) => {
          const isTaken = taken.has(t)
          // Taken wins: a post sits there, which says more than the hour.
          const isPast = !isTaken && past.has(t)
          return (
            <button
              key={t}
              type="button"
              disabled={!day || isTaken || isPast}
              data-taken={isTaken || undefined}
              data-past={isPast || undefined}
              aria-pressed={picked === t}
              aria-label={isTaken ? `${t}, taken` : isPast ? `${t}, passed` : t}
              onClick={() => onPick(t)}
              className={CHIP}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}
