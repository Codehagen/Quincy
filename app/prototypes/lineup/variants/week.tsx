"use client"

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"

import { countQueued, DAYS } from "../data"
import { EmptyDay, EntryRow } from "../parts"

/**
 * Week — axis: seven columns, the whole week at once.
 *
 * The closest thing here to a calendar, and it earns the comparison: cadence is
 * free. Tuesday having three posts and Thursday one is a thing you see rather
 * than a thing you count, and the gap on Wednesday is a hole in the row instead
 * of a sentence you scroll past.
 *
 * The reasons to distrust it are the ones Board already taught us on Drafts.
 * Seven columns inside the sidebar leaves ~130px each at 1440 — narrower than
 * the platform mark plus a time — so the post's idea wraps to three lines or
 * truncates to nothing useful. And it has no phone layout: below the breakpoint
 * this has to become Agenda, which is a second layout to maintain for a gain
 * the cadence strip already buys in one row.
 *
 * The deeper objection is that it optimises for the wrong question. Seeing the
 * week is a planning question you ask on Sunday. What is going out today, and
 * is this the right order, is the question you ask every other day — and Week
 * makes that the small text in one of seven columns.
 */
export function Week() {
  const open = countQueued(DAYS)

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Lineup</PageHeaderTitle>
          <PageHeaderDescription>
            When approved writing goes out. Drafts decides what; this decides
            when.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <p className="px-3 text-caption text-muted-foreground">
        <span className="font-mono tabular-nums">{open.entries}</span>{" "}
        {open.entries === 1 ? "post" : "posts"} queued across{" "}
        <span className="font-mono tabular-nums">{open.days}</span>{" "}
        {open.days === 1 ? "day" : "days"}
      </p>

      {/* Seven equal tracks. Not a scroller: a day off to the right is a day
          you do not plan against, which is the entire point of the layout. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {DAYS.map((day) => (
          <section
            key={day.id}
            className="flex flex-col gap-2 rounded-xl border border-border p-2"
          >
            <div className="flex flex-col gap-0.5 px-1">
              <h2 className="text-card-title">{day.label}</h2>
              <p className="text-caption text-muted-foreground">{day.date}</p>
            </div>

            {day.entries.length === 0 ? (
              <EmptyDay />
            ) : (
              <ul className="flex flex-col gap-2">
                {day.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} compact />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
