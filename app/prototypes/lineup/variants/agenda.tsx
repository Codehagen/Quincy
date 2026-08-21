"use client"

import * as React from "react"

import { withViewTransition } from "@/lib/view-transition"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"

import {
  countQueued,
  DAYS,
  moveEntry,
  moveOptions,
  rescheduleEntry,
  rowsForDay,
  SLOTS,
  unscheduleEntry,
  type MoveTarget,
} from "../data"
import {
  CadenceStrip,
  DayHeading,
  EmptyDay,
  EmptySlotRow,
  EntryRow,
  UnscheduledRow,
} from "../parts"

/**
 * Agenda — axis: one column, grouped by day, with standing slots merged in.
 *
 * The shape the product already assumes. Morning Brief reads this surface for
 * "what is going out today", and a day-grouped list is that question with the
 * answer at the top; you scroll forward into the week rather than navigating to
 * it.
 *
 * An empty day costs one line here. That is the argument against the grid: most
 * days in a publishing week have nothing in them, and the layout should spend
 * its space on the days that do.
 *
 * **Slots merged rather than given their own page.** The Slots variant won one
 * thing outright — it can say you have a Wednesday slot standing empty, which
 * is an absence measured against a commitment rather than a blank date. That
 * sentence is worth keeping and a second surface is not.
 *
 * **State lives here, not in `parts`.** Moving a post changes two things at
 * once — which day holds it, and which slots are free — and only something
 * above both can keep those in agreement. The losing variants mount the same
 * row component without passing `onMove`, so they stay a static record of the
 * layout comparison rather than drifting into half-built interactions.
 */
export function Agenda() {
  const [state, setState] = React.useState({ days: DAYS, slots: SLOTS })

  /**
   * The post that just moved, so focus can follow it.
   *
   * Moving a row unmounts the menu trigger that started it, and the browser
   * answers that by dropping focus to `<body>` — the same defect Drafts had on
   * approve. Null on first render so nothing steals focus on load.
   */
  const [movedId, setMovedId] = React.useState<string | null>(null)

  const move = React.useCallback((entryId: string, target: MoveTarget) => {
    setMovedId(entryId)
    withViewTransition(() =>
      setState((current) =>
        moveEntry(current.days, current.slots, entryId, target)
      )
    )
  }, [])

  /**
   * No confirmation. The post keeps its text and its approval and lands back on
   * Drafts; the receipt it leaves behind carries the undo. Focus moves to that
   * receipt, because the Unschedule button that started this is gone.
   */
  const unschedule = React.useCallback((entryId: string) => {
    setMovedId(entryId)
    withViewTransition(() =>
      setState((current) =>
        unscheduleEntry(current.days, current.slots, entryId)
      )
    )
  }, [])

  const reschedule = React.useCallback((entryId: string) => {
    setMovedId(entryId)
    withViewTransition(() =>
      setState((current) =>
        rescheduleEntry(current.days, current.slots, entryId)
      )
    )
  }, [])

  const { days, slots } = state
  const open = countQueued(days)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Lineup</PageHeaderTitle>
          <PageHeaderDescription>
            When approved writing goes out. Drafts decides what; this decides
            when.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="flex flex-col gap-3 px-3">
        <CadenceStrip days={days} />
        <p className="text-caption text-muted-foreground">
          <span className="font-mono tabular-nums">{open.entries}</span>{" "}
          {open.entries === 1 ? "post" : "posts"} queued across{" "}
          <span className="font-mono tabular-nums">{open.days}</span>{" "}
          {open.days === 1 ? "day" : "days"}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {days.map((day) => {
          const rows = rowsForDay(day, slots)

          return (
            <section key={day.id} className="flex flex-col gap-2">
              <DayHeading day={day} />
              {rows.length === 0 ? (
                <EmptyDay />
              ) : (
                <ul className="flex flex-col gap-2">
                  {rows.map((row) => {
                    if (row.kind === "slot") {
                      return <EmptySlotRow key={row.slot.id} slot={row.slot} />
                    }

                    if (row.entry.state === "unscheduled") {
                      return (
                        <UnscheduledRow
                          key={row.entry.id}
                          entry={row.entry}
                          takeFocus={movedId === row.entry.id}
                          onUndo={() => reschedule(row.entry.id)}
                        />
                      )
                    }

                    const { openSlots, nextDay } = moveOptions(
                      days,
                      slots,
                      row.entry
                    )

                    return (
                      <EntryRow
                        key={row.entry.id}
                        entry={row.entry}
                        openSlots={openSlots}
                        nextDay={nextDay}
                        takeFocus={movedId === row.entry.id}
                        onMove={(target) => move(row.entry.id, target)}
                        onUnschedule={() => unschedule(row.entry.id)}
                      />
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
