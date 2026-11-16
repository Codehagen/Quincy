"use client"

import * as React from "react"

import {
  ButtonLink,
  EmptyRegion,
  EmptyState,
  LiveDot,
  Segmented,
  Skeleton,
  type SkeletonWidth,
  Tag,
  TextLink,
  Toolbar,
  ToolbarGroup,
  ToolbarTitle,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

import { PERIOD_OPTIONS, type NumbersData, type Period } from "../data"

/** What the lab shows: the data as it is, or one of the states. */
export type Phase = "live" | "loading" | "empty" | "disconnected" | "thin" | "failed"

/**
 * The page row: the name, one line of where the numbers come from, and the
 * period (7 / 30 / 90 days), which scopes everything under it (one filter
 * row above the charts, never a filter per chart).
 */
export function NumbersToolbar({
  data,
  phase,
  period,
  setPeriod,
  control,
  back,
}: {
  data: NumbersData
  phase: Phase
  period: Period
  setPeriod: (p: Period) => void
  /** In place of the period: C's week stepper. */
  control?: React.ReactNode
  /** Table opened from the Dashboard: the title becomes a crumb back. */
  back?: () => void
}) {
  const quiet = phase === "empty" || phase === "disconnected"
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
          {quiet
            ? "Every post against your own median. Never a follower count."
            : phase === "failed"
              ? "Against your own median. Yesterday's reading."
              : `Against your own median. Read ${data.lastRead}.`}
        </p>
      </div>
      {quiet ? null : (
        <ToolbarGroup end>
          {control ?? <Segmented aria-label="Period" options={PERIOD_OPTIONS} value={period} onValueChange={setPeriod} />}
        </ToolbarGroup>
      )}
    </Toolbar>
  )
}

/** Above the grid while a state stands: one sentence, first person, the way out beside it. */
export function StateLine({ phase, minWeeks, notes }: { phase: Phase; minWeeks: number; notes?: string[] }) {
  if (phase === "loading") {
    return (
      <div role="status" className="text-kit-dense text-kit-ink">
        <LiveDot pulse>Reading your numbers. This usually takes a few seconds.</LiveDot>
      </div>
    )
  }
  if (phase === "failed") {
    return (
      <div role="status" className="flex flex-wrap items-baseline gap-x-kit-related gap-y-kit-tight text-kit-dense">
        <p className="text-kit-ink">
          I couldn&apos;t read X this morning. <span className="text-kit-ink-muted">These are yesterday&apos;s numbers; I&apos;ll try again at 06:00.</span>
        </p>
        <TextLink href="/channels">Check the connection</TextLink>
      </div>
    )
  }
  if (phase === "thin") {
    return (
      <p role="status" className="text-kit-dense text-kit-ink">
        Two weeks of posts so far.{" "}
        <span className="text-kit-ink-muted">I&apos;ll say what&apos;s usual for you once there are {minWeeks} weeks behind the period. Until then each number stands alone.</span>
      </p>
    )
  }
  if (notes && notes.length) {
    return (
      <p className="text-kit-meta text-kit-ink-muted">
        {notes.join(" ")}
      </p>
    )
  }
  return null
}

/** Nothing to measure, said where the numbers would be, with the friend. */
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

/** A number the product cannot compute yet: said, never faked. */
export function Proposed({ why }: { why: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <Tag look="text">Proposed</Tag>
      <span className="text-kit-meta text-kit-ink-muted">{why}</span>
    </span>
  )
}

/** The loading bars: static, on the same grid as what they stand for. */
export function Bars({ widths }: { widths: readonly SkeletonWidth[] }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} />
      ))}
    </div>
  )
}

/** A panel on the grid: a white object on the ground, lifted by elevation. */
export function GridPanel({
  title,
  meta,
  children,
  className = "",
  id,
}: {
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  const hid = React.useId()
  return (
    <section id={id} aria-labelledby={hid} className={`flex min-w-0 flex-col gap-kit-related rounded-kit-control bg-kit-object p-kit-group shadow-kit-object ${className}`}>
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
