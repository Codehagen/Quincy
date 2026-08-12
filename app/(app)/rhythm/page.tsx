import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getSession } from "@/lib/session"
import { formatConversationDate } from "@/lib/format-date"
import { resolveTimeZone } from "@/lib/timezone"
import {
  describeCadence,
  getHeartbeatRuns,
  getRhythmStates,
  isRunnable,
  RHYTHMS,
} from "@/lib/rhythms"
import type { RhythmCardState } from "@/components/rhythm/rhythm-grid"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { RhythmGrid } from "@/components/rhythm/rhythm-grid"
import { constructMetadata } from "@/lib/metadata"

/**
 * What Quincy does on its own.
 *
 * This replaces two hardcoded pages — `/rhythm` and `/rhythm-grid` — that were
 * fixtures with no data behind them, grouped as "Daily" and "Pipelines". The
 * grouping is now by what a rhythm *does*, because "GitHub to X" and "Substack
 * to X" are one rhythm with a different source, and filing them by platform is
 * how a catalogue ends up with fourteen entries under one name and one under
 * another. Platform is a filter instead; the chips are above the list.
 *
 * **The switches are real now** for rhythms with a handler (plans/016).
 * Heartbeat is the exception and stays checked-and-disabled: it runs for
 * everyone on a system-wide cron, so it is maintenance rather than a choice,
 * and its history still comes from `brain_event` rather than `rhythm_run`.
 * That is two sources for one column, and it is the accepted cost of not
 * migrating the only rhythm that already worked.
 *
 * Everything without a handler still renders inert with "soon" — the same call
 * /channels makes about platforms it cannot connect yet. A catalogue you can
 * read beats a page that pretends the product is smaller than the plan, and a
 * control that does nothing is worse than no control.
 *
 * The card carries the switch; the time lives on /rhythm/[id]. This page is
 * for glancing and toggling, and a time control on every card would put three
 * of them in one row of a grid whose job is to be readable at speed.
 */
export const metadata = constructMetadata({
  title: "Rhythm",
  noIndex: true,
})

export default async function RhythmPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/rhythm")
  }

  const [runs, states] = await Promise.all([
    getHeartbeatRuns(session.user.id, 1),
    getRhythmStates(session.user.id),
  ])

  const zone = resolveTimeZone(session.user.timezone)
  const now = new Date()

  /**
   * Every card's state, formatted here rather than in the client component.
   *
   * The grid is `"use client"`, and a date formatted there renders a different
   * string than the server produced in the seconds either side of midnight —
   * the same rule `Draft.from.at` and `Riff.capturedAt` follow.
   */
  const cards: Record<string, RhythmCardState> = {}

  for (const rhythm of RHYTHMS) {
    const state = states.get(rhythm.id)

    cards[rhythm.id] = {
      enabled: state?.enabled ?? false,
      runnable: isRunnable(rhythm),
      when: state ? describeCadence(state) : null,
      receipt: state?.lastRun
        ? formatConversationDate(state.lastRun.at, zone, now)
        : null,
      failed: state?.lastRun?.state === "failed",
    }
  }

  // Reused rather than duplicated. The name says conversation, but the
  // bucketing — Today, Yesterday, N days ago, then a real date — is exactly
  // what a run list wants, and a second copy would drift from this one.
  const lastRun = runs[0]
    ? formatConversationDate(runs[0].at, zone, now)
    : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Rhythm</PageHeaderTitle>
          <PageHeaderDescription>
            What Quincy does on its own. Every rhythm says when it runs, what it
            reads, and what it leaves behind.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {/* useQueryState reads the platform filter; Suspense is what keeps that
          from opting the whole route out of static rendering. */}
      <Suspense>
        <RhythmGrid lastRun={lastRun} cards={cards} />
      </Suspense>

      {/* At the foot, not the head. Someone landing on six unfamiliar groupings
          asks this question after scrolling, not before — and a banner at the
          top would sell the thesis to people who came here to turn something
          on. */}
      <p className="text-caption text-muted-foreground px-3">
        Grouped by what each rhythm does, never by platform.{" "}
        <Link
          href="/why"
          className="text-foreground underline underline-offset-4"
        >
          Why Quincy works this way
        </Link>
        .
      </p>
    </div>
  )
}
