"use client"

import * as React from "react"
import {
  MagicWand01Icon,
  Mic01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { Riff } from "@/lib/riffs"
import { cn } from "@/lib/utils"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from "@/components/page-header"
import {
  AngleCard,
  AnglesPending,
  Provenance,
  RiffFailed,
  Scrap,
  Steer,
} from "@/components/riffs/riff-parts"
import { Button } from "@/components/ui/button"

import { ProtoAngleActions, ProtoRiffFooter } from "./parts"
import { countOpen, groupByDay, type Board } from "./state"

/**
 * The shipped Desk layout, rebuilt on the prototype's local board.
 *
 * A mirror of `app/(app)/riffs/page.tsx` and `components/riffs/riff-card.tsx`
 * rather than an import of them, for one reason: both hard-wire `AngleActions`
 * and the real `RecordBox`/`AdaptBox`, which call server actions that write
 * real rows and spend real money. Everything presentational is still the
 * production component — `Provenance`, `Scrap`, `AngleCard`, `AnglesPending`,
 * `RiffFailed`, `Steer`.
 *
 * Round three's two variants both extend this, so it lives here and neither
 * copies it. If this drifts from the shipped page, the comparison is measuring
 * the drift.
 */

/** Matches `FOLD_SCRAP_ABOVE` in the shipped card. */
const FOLD_SCRAP_ABOVE = 420

export function DeskFrame({
  board,
  children,
}: {
  board: Board
  children: React.ReactNode
}) {
  const open = countOpen(board.riffs)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
      <PageHeader className="items-center">
        <PageHeaderContent>
          <PageHeaderTitle className="text-section">Riffs</PageHeaderTitle>
        </PageHeaderContent>
        {open.angles > 0 ? (
          <p className="text-caption text-muted-foreground shrink-0">
            {/* Singular matters here: the count reaches one on the way down
                every single time, so "1 angles waiting on you" is a state every
                user passes through on their last decision. Caught by the Faults
                variant against a one-angle fixture, and fixed in the shipped
                page too. */}
            <span className="font-mono tabular-nums">{open.angles}</span>{" "}
            {open.angles === 1 ? "angle" : "angles"} waiting on you
          </p>
        ) : null}
      </PageHeader>

      <ProtoInstrument />
      {children}
    </div>
  )
}

/**
 * The instrument, with the capture dialogs stubbed out.
 *
 * Identical markup and weights to `components/riffs/instrument.tsx`; the
 * buttons open nothing. Capture is not what either of round three's variants is
 * asking about, and wiring the real dialogs here would post audio to
 * `/api/voice-notes` under a live session.
 */
function ProtoInstrument() {
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl p-5 shadow-xs sm:flex-row sm:items-center">
      <div
        aria-hidden="true"
        className="bg-signal-surface text-signal-foreground flex size-11 shrink-0 items-center justify-center rounded-lg select-none"
      >
        <HugeiconsIcon icon={Mic01Icon} className="size-5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-card-title">Say what happened</h2>
        <p className="text-caption text-muted-foreground max-w-[60ch] text-pretty">
          However it comes out. Quincy reads through the false starts, and you
          hear the take back before anything is sent.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button type="button" disabled>
          <HugeiconsIcon
            aria-hidden="true"
            data-icon="inline-start"
            icon={Mic01Icon}
          />
          Record a thought
        </Button>
        <Button type="button" variant="outline" disabled>
          <HugeiconsIcon
            aria-hidden="true"
            data-icon="inline-start"
            icon={MagicWand01Icon}
          />
          Adapt a post
        </Button>
      </div>
    </div>
  )
}

/** The day-grouped queue, exactly as the shipped page groups it. */
export function Queue({
  board,
  renderExtra,
  renderAngleExtra,
}: {
  board: Board
  /** Slot under the angles, where the variants add what they are testing. */
  renderExtra?: (riff: Riff) => React.ReactNode
  /** Slot inside each angle, above its actions. */
  renderAngleExtra?: (angle: Riff["angles"][number]) => React.ReactNode
}) {
  const groups = groupByDay(board.riffs)

  return (
    <div className="flex flex-col gap-8">
      {groups.map(([day, dayRiffs]) => (
        <section key={day} aria-labelledby={`day-${day}`}>
          <h2
            id={`day-${day}`}
            className="text-eyebrow text-muted-foreground px-3 pb-3 uppercase"
          >
            {day}
          </h2>
          <div className="flex flex-col gap-4">
            {dayRiffs.map((riff) => (
              <ExchangeCard
                key={riff.id}
                riff={riff}
                board={board}
                extra={renderExtra?.(riff)}
                renderAngleExtra={renderAngleExtra}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function ExchangeCard({
  riff,
  board,
  extra,
  renderAngleExtra,
}: {
  riff: Riff
  board: Board
  extra?: React.ReactNode
  renderAngleExtra?: (angle: Riff["angles"][number]) => React.ReactNode
}) {
  const [full, setFull] = React.useState(false)
  const nameId = `riff-${riff.id}-from`
  const scrapId = `riff-${riff.id}-said`
  const waiting = riff.angles.filter((a) => a.status !== "drafted").length
  const foldable = riff.scrap.length > FOLD_SCRAP_ABOVE

  return (
    <article
      aria-labelledby={nameId}
      className="bg-card flex flex-col gap-4 rounded-xl p-4 shadow-xs"
    >
      <Provenance riff={riff} id={nameId} dateInGroupHeading />

      {riff.scrap ? (
        <div className="flex flex-col items-start gap-1">
          <div
            id={scrapId}
            className={cn("w-full", foldable && !full && "[&_p]:line-clamp-4")}
          >
            <Scrap>{riff.scrap}</Scrap>
          </div>
          {foldable ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              aria-expanded={full}
              aria-controls={scrapId}
              onClick={() => setFull((v) => !v)}
            >
              {full ? "Show less" : "Show all of it"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {riff.state === "working" ? (
        <AnglesPending stuck={riff.stuck} />
      ) : riff.state === "failed" ? (
        <RiffFailed message={riff.failure} />
      ) : riff.angles.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          Nothing left on this one.
        </p>
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            {waiting === 0
              ? "Everything here is drafted."
              : `Quincy found ${waiting === 1 ? "one way" : `${waiting} ways`} to take it.`}
          </p>

          <ul className="flex flex-col gap-2">
            {riff.angles.map((angle) => (
              <AngleCard key={angle.id} angle={angle} onQuiet>
                {/* `AngleCard` renders shape, reasoning, then its children, so
                    anything a variant adds per angle lands here — below the
                    reasoning, above the actions. A destination mark would read
                    better beside the shape tag, which would mean giving the
                    production component a `meta` slot; not worth changing a
                    shipped component for a variant nobody has chosen yet. */}
                {renderAngleExtra?.(angle)}
                <ProtoAngleActions angle={angle} board={board} />
              </AngleCard>
            ))}
          </ul>
        </>
      )}

      {/* Where each variant puts what it is testing. Above `Steer`, because
          steering is the general-purpose escape hatch and belongs last. */}
      {extra}

      {riff.state === "ready" && riff.angles.length > 0 ? (
        <Steer riffId={riff.id} />
      ) : null}

      <ProtoRiffFooter riff={riff} board={board} />
    </article>
  )
}
