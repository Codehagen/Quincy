import Link from "next/link"

import { cn } from "@/lib/utils"
import {
  FAMILY_LABEL,
  FAMILY_NOTE,
  FAMILY_ORDER,
  LIVE_RHYTHMS,
  type Rhythm,
} from "@/lib/rhythms"
import { RUNS_ELSEWHERE } from "@/lib/rhythm-handlers"
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card"
import { Flow } from "./node-chip"
import { RhythmSwitch } from "./rhythm-switch"

/**
 * Every rhythm that runs, and nothing else.
 *
 * This used to render the whole catalogue — twenty-seven cards, twenty of them
 * inert under the word "soon". The argument for that was that a catalogue you
 * can read beats a page pretending the product is smaller than the plan, and
 * it was wrong in the one way that matters: a reader counts, and twenty
 * promises against seven facts is a page arguing the product is mostly a plan.
 * `LIVE_RHYTHMS` derives from the handler registry, so a card cannot exist
 * without code behind it, and the twenty are still in lib/rhythms.ts waiting
 * for theirs. See plans/027, 4a.
 *
 * A server component now. The one reason it was `"use client"` was the
 * platform filter's URL state, and the filter went with the inert cards: of
 * the seven that run, six of the seven chips answered with an empty state.
 *
 * Grouped by what a rhythm does, never by platform — "GitHub to X" and
 * "Substack to X" are one rhythm with a different source. A family with
 * nothing in it renders nothing, so the grouping shrinks with the list rather
 * than leaving three headings over empty ground.
 *
 * Each card answers three questions in the order a person asks them: what is
 * it called, what does it do for me, and how does it actually work. The third
 * is the one usually missing — a name and four 24px glyphs asks the reader to
 * infer a mechanism, and most will not bother.
 */
export function RhythmGrid({
  lastRun,
  cards,
}: {
  /** Heartbeat's history, which comes from `brain_event` rather than
   *  `rhythm_run` — see plans/016, decision 8. */
  lastRun: string | null
  /** Pre-rendered per-rhythm state, keyed by rhythm id. Formatted on the
   *  server for the reason every other date in this product is: a client
   *  rendering a timestamp produces a different string than the server did. */
  cards: Record<string, RhythmCardState | undefined>
}) {
  return (
    <>
      {/* Counted, not written. The page is short and a reader is owed the
          reason: this is everything, not the first screen of something. */}
      <p className="px-3 text-caption text-muted-foreground">
        {LIVE_RHYTHMS.length} rhythms run today. A new one appears here when the
        code behind it does, never before.
      </p>

      {FAMILY_ORDER.map((family) => {
        const rhythms = LIVE_RHYTHMS.filter((r) => r.family === family)
        if (rhythms.length === 0) return null

        return (
          <section key={family} className="flex flex-col gap-5">
            <div className="flex max-w-2xl flex-col gap-1.5 px-3">
              <h2 className="text-section">{FAMILY_LABEL[family]}</h2>
              <p className="text-body text-pretty text-muted-foreground">
                {FAMILY_NOTE[family]}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rhythms.map((rhythm) => (
                <RhythmCard
                  key={rhythm.id}
                  rhythm={rhythm}
                  card={cards[rhythm.id]}
                  heartbeatLastRun={lastRun}
                />
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}

/**
 * One card's worth of subscription state, already turned into strings.
 *
 * `when` and `receipt` are formatted server-side. The card used to be a client
 * component and this stays true regardless: a timestamp formatted in the
 * browser renders a different string than the server did in the seconds either
 * side of midnight — the same rule `Riff.capturedAt` and `Draft.from.at`
 * follow.
 */
export type RhythmCardState = {
  enabled: boolean
  runnable: boolean
  /** "every day at 14:00", or null when it has never been switched on. */
  when: string | null
  /** The last run, in one line. Null when it has not run. */
  receipt: string | null
  /** True when that last run failed, so the card can say so quietly. */
  failed: boolean
}

function RhythmCard({
  rhythm,
  card,
  heartbeatLastRun,
}: {
  rhythm: Rhythm
  card: RhythmCardState | undefined
  heartbeatLastRun: string | null
}) {
  // Heartbeat is on for everybody and has no per-user row, so its "live" is a
  // fact about the deployment rather than a subscription.
  const locked = rhythm.id === "heartbeat"
  const runnable = card?.runnable ?? false
  const elsewhere = RUNS_ELSEWHERE[rhythm.id]

  /**
   * Brass, and it means what it always means: this is running.
   *
   * An event rhythm is deliberately not live. It runs — that is why it is on
   * this page — but whether its source is connected right now is a question
   * this card cannot ask without a query per card, and a brass dot next to
   * Shipped Work for somebody who never connected GitHub is the one lie the
   * colour must not tell.
   */
  const live = locked || (runnable && (card?.enabled ?? false))

  /**
   * Three states, three sentences, and the difference is what a person came to
   * find out. "on Sources" means the control is elsewhere, "off" means you
   * turned it off here, and a date means it did something.
   */
  const footer = locked
    ? (heartbeatLastRun ?? "not run yet")
    : elsewhere?.kind === "event"
      ? "on Sources"
      : !card?.enabled
        ? "off"
        : (card?.receipt ?? "not run yet")

  return (
    <Card
      data-live={live || undefined}
      className={cn(
        "group/rhythm relative h-full shadow-xs ring-0",
        "transition-[box-shadow,background-color] duration-150 ease-out",
        // Hover confirms an affordance that is real: the whole card opens the
        // rhythm, through the overlay on the title link below.
        "hover:shadow-md",
        // The ring goes on the card, not on the link inside it. The click
        // target is the whole card, so a focus indicator around a short word
        // would tell a keyboard user something different than it tells a mouse.
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50",
        // A ring, not a tint. This was `bg-signal-surface`, which put brass
        // under a control you press — the one thing AGENTS.md says the colour
        // never does. The ring is also what /rhythm/[id] already draws around a
        // live rhythm, so the two surfaces now say "running" the same way.
        "data-live:ring-1 data-live:ring-signal-border"
      )}
    >
      <CardHeader>
        <Flow rhythm={rhythm} live={live} />
        {/* Nothing at all for an event rhythm. It has no hour to choose and
            nothing for the dispatcher to fire, so a disabled switch here would
            be a second control over a fact /sources owns — and a control that
            cannot move is worse than no control.

            z-10 keeps the switch above the title link's full-card overlay.
            Without it, reaching for the toggle navigates instead. */}
        {runnable || locked ? (
          <CardAction className="relative z-10">
            <RhythmSwitch
              rhythmId={rhythm.id}
              name={rhythm.name}
              enabled={live}
              locked={locked}
            />
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {/*
           * The link carries a full-card overlay rather than the card being
           * wrapped in an anchor. Wrapping makes a screen reader announce the
           * whole card as one link; this way the accessible name is just the
           * rhythm's name and the click target is still the whole card.
           */}
          <p className="text-card-title">
            <Link
              href={`/rhythm/${rhythm.id}`}
              className={cn(
                "after:absolute after:inset-0 after:rounded-xl",
                "underline-offset-4 group-hover/rhythm:underline",
                "outline-none"
              )}
            >
              {rhythm.name}
            </Link>
          </p>
        </div>

        <p className="text-caption text-pretty text-foreground">
          {rhythm.promise}
        </p>
        <p className="text-caption text-pretty text-muted-foreground">
          {rhythm.how}
        </p>
      </CardContent>

      <CardContent className="mt-auto flex items-center justify-between gap-3">
        <span className="font-mono text-caption whitespace-nowrap text-muted-foreground tabular-nums">
          {/* The user's own time once they have chosen one, the catalogue's
              default before that. A card claiming "daily 14:00" for somebody
              who moved it to 08:00 is the one lie this row can tell. */}
          {card?.when ?? rhythm.trigger.label}
        </span>
        <span
          className={cn(
            "min-w-0 truncate font-mono text-caption tabular-nums",
            card?.failed ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {footer}
        </span>
      </CardContent>
    </Card>
  )
}
