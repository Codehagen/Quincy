"use client"

import * as React from "react"

import { ButtonLink, EmptyRegion, EmptyState, LiveDot, Segmented, TextLink, Toolbar, ToolbarGroup, ToolbarTitle } from "@/components/kit"
import { Friend } from "@/components/mascot"
import { PERIOD_OPTIONS, dayLabel, isStale, type NumbersData, type Period } from "@/lib/numbers-read"

/**
 * The page row: the name, one line of where the numbers come from, and the
 * period (7 / 30 / 90 days), which scopes everything under it: one filter
 * row above the charts, never a filter per chart. In Table it carries the
 * crumb back ("Numbers / Posts"), so it reads as a path, not a view switch.
 */
export function NumbersToolbar({
  line,
  period,
  setPeriod,
  back,
}: {
  /** The line beside the name; null hides the period too (nothing to scope). */
  line: string | null
  period: Period
  setPeriod: (p: Period) => void
  /** Table opened from the Dashboard: the title becomes a crumb back. */
  back?: () => void
}) {
  return (
    <Toolbar label="Numbers" divided>
      <div className="flex min-w-0 items-baseline gap-kit-related">
        {back ? (
          <nav aria-label="Breadcrumb" className="shrink-0">
            <ol className="flex items-baseline gap-1.5 text-kit-heading">
              <li>
                <button
                  type="button"
                  onClick={back}
                  aria-keyshortcuts="Escape"
                  className="cursor-pointer rounded-kit-chip text-kit-ink-muted outline-hidden transition-[color] duration-(--kit-duration-state) ease-kit-out hover:text-kit-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus motion-reduce:transition-none"
                >
                  Numbers
                </button>
              </li>
              <li aria-hidden className="text-kit-ink-muted">
                /
              </li>
              <li>
                <ToolbarTitle as="h2">Posts</ToolbarTitle>
              </li>
            </ol>
          </nav>
        ) : (
          <ToolbarTitle>Numbers</ToolbarTitle>
        )}
        <p className="hidden truncate text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block">
          {line ?? "Every post against your own median. Never a follower count."}
        </p>
      </div>
      {line === null ? null : (
        <ToolbarGroup end>
          <Segmented aria-label="Period" options={PERIOD_OPTIONS} value={period} onValueChange={setPeriod} />
        </ToolbarGroup>
      )}
    </Toolbar>
  )
}

/** Reading, said where the numbers will land (docs/design/states.md, "Working"). Never bars. */
export function ReadingLine() {
  return (
    <div role="status" className="text-kit-dense text-kit-ink">
      <LiveDot pulse>Reading your numbers. This usually takes a few seconds.</LiveDot>
    </div>
  )
}

/**
 * Above the grid while something about the data needs saying: the channel
 * went away, the morning read is behind, too little history for a usual,
 * or facts about the rows (posts with no text yet). One line, first person.
 */
export function StateLine({ data, enoughHistory, minWeeks, showNotes = true }: { data: NumbersData; enoughHistory: boolean; minWeeks: number; showNotes?: boolean }) {
  const last = data.lastRead ? dayLabel(data.today, Math.round((Date.parse(`${data.today}T00:00:00Z`) - Date.parse(`${data.lastRead}T00:00:00Z`)) / 86_400_000)) : null
  if (!data.connected) {
    return (
      <div role="status" className="flex flex-wrap items-baseline gap-x-kit-related gap-y-kit-tight text-kit-dense">
        <p className="text-kit-ink">
          X isn&apos;t connected.{" "}
          <span className="text-kit-ink-muted">These are the numbers as they stood{last ? ` on ${last}` : ""}; I&apos;ll read again once it is.</span>
        </p>
        <TextLink href="/channels">Connect X</TextLink>
      </div>
    )
  }
  if (isStale(data)) {
    return (
      <div role="status" className="flex flex-wrap items-baseline gap-x-kit-related gap-y-kit-tight text-kit-dense">
        <p className="text-kit-ink">
          The last reading is from {last}. <span className="text-kit-ink-muted">I read X every morning at 06:00 UTC.</span>
        </p>
        <TextLink href="/channels">Check the connection</TextLink>
      </div>
    )
  }
  if (!enoughHistory) {
    return (
      <p role="status" className="text-kit-dense text-kit-ink">
        {data.historyWeeks === 0 ? "Less than a week of readings so far." : `${data.historyWeeks} ${data.historyWeeks === 1 ? "week" : "weeks"} of readings so far.`}{" "}
        <span className="text-kit-ink-muted">I&apos;ll say what&apos;s usual for you once there are {minWeeks} weeks behind the period. Until then each number stands alone.</span>
      </p>
    )
  }
  if (showNotes && data.notes.length) return <p className="text-kit-meta text-pretty text-kit-ink-muted">{data.notes.join(" ")}</p>
  return null
}

/** Nothing to measure, said where the numbers would be, with the friend, centred. */
export function EmptyNumbers({ kind }: { kind: "empty" | "disconnected" }) {
  return (
    <EmptyRegion>
      {kind === "disconnected" ? (
        <EmptyState
          frame="none"
          media={<Friend size={48} state="waiting" className="text-kit-ink" />}
          bold="No channel connected."
          rest="Connect X and I'll read back every post each morning, and set it against your own median. Never a follower count."
        >
          <ButtonLink href="/channels" variant="action">
            Connect X
          </ButtonLink>
        </EmptyState>
      ) : (
        <EmptyState
          frame="none"
          media={<Friend size={48} state="resting" className="text-kit-ink" />}
          bold="Nothing published yet."
          rest="Once a post goes out, I'll measure it every morning. After three weeks I can tell you what's usual for you."
        >
          <ButtonLink href="/drafts">Go to Drafts</ButtonLink>
        </EmptyState>
      )}
    </EmptyRegion>
  )
}

/** A panel on the grid: a white object on the ground, lifted by elevation. */
export function GridPanel({
  title,
  meta,
  children,
  className = "",
}: {
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const hid = React.useId()
  return (
    <section aria-labelledby={hid} className={`flex min-w-0 flex-col gap-kit-related rounded-kit-control bg-kit-object p-kit-group shadow-kit-object ${className}`}>
      <header className="flex min-h-7 flex-wrap items-center justify-between gap-x-kit-related gap-y-kit-tight">
        <h2 id={hid} className="text-kit-dense font-kit-strong text-kit-ink">
          {title}
        </h2>
        {meta ? <div className="text-kit-meta text-kit-ink-muted tabular-nums">{meta}</div> : null}
      </header>
      {children}
    </section>
  )
}
