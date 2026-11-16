"use client"

/*
 * Internal to the kit: the month that Calendar and DateTimePicker share.
 * ui-sdk calendar parts (@ui-sdk/react/calendar) run inside either root, so
 * one month serves both. ui-sdk, not Base UI: Base UI has no calendar. It
 * gives a grid with one tab stop, arrows between days, PageUp/PageDown by
 * month, and announced month changes.
 */

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import {
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
} from "@ui-sdk/react/calendar"

import { FOCUS_RING } from "./control-styles"

/** How many posts sit on each ISO date ("2026-11-19": 2). Up to three dots show. */
export type CalendarSlots = Readonly<Record<string, number>>

// 32px to see, 40 to hit with a mouse and 44 on touch. Square, not
// vertical-only like HIT_44: the month name between the arrows is not a
// control, so the wider box overlaps nothing.
const STEP =
  `relative grid size-8 place-items-center rounded-full text-kit-ink-muted ${FOCUS_RING} ` +
  "after:absolute after:top-1/2 after:left-1/2 after:size-10 after:-translate-1/2 pointer-coarse:after:size-11 " +
  "transition-[background-color,color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  "hover:not-disabled:bg-kit-control-hover hover:not-disabled:text-kit-ink disabled:opacity-40"

// 40px days under a fine pointer, 44 on touch: seven of them are 308px,
// which fits a 390 screen with the 16px gutters and the panel's padding.
const DAY =
  "relative size-10 rounded-full p-0 text-center align-middle text-kit-body tabular-nums text-kit-ink select-none pointer-coarse:size-11 " +
  `${FOCUS_RING} focus-visible:outline-offset-[-2px] ` +
  "transition-[background-color,color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  // No hover grey on a day that cannot be picked: it would promise a click.
  "hover:[&:not([data-selected],[data-disabled],[data-unavailable])]:bg-kit-control-hover " +
  "data-today:font-kit-strong data-today:[&:not([data-selected])]:shadow-kit-inset " +
  "data-outside:text-kit-ink-muted " +
  "data-unavailable:cursor-default data-unavailable:text-kit-ink-muted data-unavailable:line-through " +
  "data-disabled:cursor-default data-disabled:opacity-40 " +
  // Picked is the ink thumb, as Segmented's: a fill, never blue, and the
  // weight stays put (only today is strong), so the digits do not jump.
  // ui-sdk writes data-selected="" and shadcn's `data-selected:` variant
  // only matches "true", so presence is matched by hand.
  "[&[data-selected]]:bg-kit-primary [&[data-selected]]:text-kit-primary-on"

export function CalendarMonth({ slots }: { slots?: CalendarSlots }) {
  return (
    <div data-slot="kit-calendar-month" className="flex w-max flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <CalendarPrevious className={STEP}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} aria-hidden />
        </CalendarPrevious>
        <CalendarHeading className="m-0 text-kit-body font-kit-strong text-kit-ink" />
        <CalendarNext className={STEP}>
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
        </CalendarNext>
      </div>
      <CalendarGrid className="border-separate border-spacing-0">
        <CalendarWeekdays>
          {(index) => (
            <CalendarWeekday
              index={index}
              className="h-8 p-0 text-center text-kit-small font-kit-regular text-kit-ink-muted"
            >
              {(state) => (
                <abbr title={state.name} className="no-underline">
                  {state.label}
                </abbr>
              )}
            </CalendarWeekday>
          )}
        </CalendarWeekdays>
        <CalendarWeeks>
          {(cell) =>
            cell.hidden ? null : (
              <CalendarDay
                value={cell.date}
                className={DAY}
                // ui-sdk names each day ("Wednesday, November 18, 2026"); a day
                // with posts says how many, since its dots are hidden.
                aria-label={dayName(cell.date, cell.outside ? 0 : (slots?.[cell.date] ?? 0))}
              >
                {(state) => (
                  <Day label={state.label} count={state.outside ? 0 : (slots?.[state.date] ?? 0)} />
                )}
              </CalendarDay>
            )
          }
        </CalendarWeeks>
      </CalendarGrid>
    </div>
  )
}

// "en", as ui-sdk names the other days, so every day reads alike.
const DAY_NAME = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

function dayName(iso: string, count: number) {
  if (count === 0) return undefined
  const name = DAY_NAME.format(new Date(`${iso}T00:00:00Z`))
  return `${name}, ${count} ${count === 1 ? "post" : "posts"} scheduled`
}

function Day({ label, count }: { label: string; count: number }) {
  const dots = Math.min(count, 3)
  return (
    <>
      {label}
      {dots > 0 ? (
        <>
          <span aria-hidden className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5 pointer-coarse:bottom-1.5">
            {Array.from({ length: dots }, (_, i) => (
              <span key={i} className="size-1 rounded-full bg-current opacity-60" />
            ))}
          </span>
        </>
      ) : null}
    </>
  )
}
