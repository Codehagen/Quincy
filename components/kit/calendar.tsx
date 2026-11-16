"use client"

/*
 * Built on ui-sdk (@ui-sdk/react/calendar), not Base UI: Base UI has no
 * calendar. ui-sdk gives a month grid with one tab stop, arrow keys between
 * days, PageUp/PageDown by month, Home/End by week, min/max and unavailable
 * dates that stay focusable so a keyboard user still hears them.
 */

import * as React from "react"
import { Calendar as CalendarRoot, type DateMatchers } from "@ui-sdk/react/calendar"

import { CalendarMonth, type CalendarSlots } from "./calendar-month"

export type { CalendarSlots }

export type CalendarStatus = "idle" | "loading" | "error"

export type CalendarProps = {
  /** The picked ISO date ("2026-11-19"), or null. Pass it to control. */
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (date: string | null) => void
  /** Posts already scheduled, per ISO date. Shown as up to three dots. */
  slots?: CalendarSlots
  /** Earliest pickable ISO date. For scheduling, today. */
  min?: string
  max?: string
  /** Days that cannot be picked: ISO dates, `{ from, to }`, `{ weekday: [0, 6] }`. */
  unavailable?: DateMatchers
  disabled?: boolean
  /** Today's ISO date. Defaults to the browser's; pass it for a stable picture. */
  today?: string
  /**
   * Whether `slots` are still loading or failed. The days still pick; a
   * muted line under the grid says the dots are not there yet.
   */
  status?: CalendarStatus
  /** Names the grid for assistive tech. Default "Schedule". */
  "aria-label"?: string
}

/**
 * A month for scheduling: weeks start on Monday, today has a ring, the
 * picked day is the ink thumb, and days with posts carry dots. No surface of
 * its own: put it in a Card, or use DateTimePicker for the popup.
 */
export function Calendar({
  value,
  defaultValue,
  onValueChange,
  slots,
  min,
  max,
  unavailable,
  disabled,
  today,
  status = "idle",
  "aria-label": ariaLabel = "Schedule",
}: CalendarProps) {
  // ui-sdk writes its own data-slot on the root, so the kit's sits on a
  // wrapper that takes no box (display: contents).
  return (
    <div data-slot="kit-calendar" className="contents">
      <CalendarRoot
        aria-label={ariaLabel}
        mode="single"
        value={value}
        defaultValue={defaultValue ?? undefined}
        onValueChange={(next) => onValueChange?.(typeof next === "string" ? next : null)}
        min={min}
        max={max}
        unavailable={unavailable}
        disabled={disabled}
        today={today}
        weekStartsOn={1}
        weekdayFormat="narrow"
        fixedWeeks
        className="flex w-max max-w-full flex-col gap-2 data-disabled:opacity-50"
      >
        <CalendarMonth slots={status === "idle" ? slots : undefined} />
        {status !== "idle" ? (
          <p
            role="status"
            className={`px-1 text-kit-small ${status === "error" ? "text-kit-danger" : "text-kit-ink-muted"}`}
          >
            {status === "loading"
              ? "Loading what’s already scheduled…"
              : "Couldn’t load the schedule. Days still pick."}
          </p>
        ) : null}
      </CalendarRoot>
    </div>
  )
}
