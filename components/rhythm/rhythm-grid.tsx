"use client"

import Link from "next/link"
import { useQueryState } from "nuqs"

import { cn } from "@/lib/utils"
import {
  FAMILY_LABEL,
  FAMILY_NOTE,
  FAMILY_ORDER,
  RHYTHMS,
  type Rhythm,
} from "@/lib/rhythms"
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Flow } from "./node-chip"
import { platformParser, PlatformFilter } from "./platform-filter"
import { RhythmSwitch } from "./rhythm-switch"

/**
 * Grouped by what the rhythm does, never by platform.
 *
 * Each card answers three questions in the order a person asks them: what is it
 * called, what does it do for me, and how does it actually work. The third is
 * the one usually missing — a name and four 24px glyphs asks the reader to
 * infer a mechanism, and most will not bother.
 *
 * Three run today. Heartbeat's switch stays checked and disabled because it is
 * maintenance rather than a choice; the two subscription rhythms have a real
 * switch; everything else is still inert, because a toggle that toggles nothing
 * is worse than no toggle.
 *
 * The card carries the switch and the receipt and nothing else. Time is set on
 * the detail page — the grid is a surface for glancing and toggling, and a time
 * control per card would put three of them in a row on a page whose whole job
 * is to be readable at a glance.
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
  const [platform] = useQueryState("platform", platformParser)

  const visible = platform
    ? RHYTHMS.filter(
        (r) => r.from.includes(platform) || r.to.includes(platform)
      )
    : RHYTHMS

  return (
    <>
      <PlatformFilter showing={visible.length} total={RHYTHMS.length} />

      {visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing touches that channel yet</EmptyTitle>
            <EmptyDescription>
              No rhythm reads from or writes to it. Clear the filter to see
              everything Quincy can do.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {FAMILY_ORDER.map((family) => {
        const rhythms = visible.filter((r) => r.family === family)
        if (rhythms.length === 0) return null

        return (
          <section key={family} className="flex flex-col gap-5">
            <div className="flex max-w-2xl flex-col gap-1.5 px-3">
              <h2 className="text-section">{FAMILY_LABEL[family]}</h2>
              <p className="text-body text-muted-foreground text-pretty">
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
 * `when` and `receipt` are formatted server-side. The card is a client
 * component and formatting a timestamp here would render a different string
 * than the server did in the seconds either side of midnight — the same rule
 * `Riff.capturedAt` and `Draft.from.at` follow.
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
  // Heartbeat is on for everybody and has no per-user row, so its "live" is
  // the catalogue's claim rather than a subscription. Everything else is live
  // only when the user switched it on.
  const locked = rhythm.id === "heartbeat"
  const runnable = card?.runnable ?? false
  const live = locked ? rhythm.available : (card?.enabled ?? false)

  // Three different sentences for three different states, and the difference
  // matters: "soon" means we have not built it, "not run yet" means you turned
  // it on and it has not fired, and a receipt means it did something.
  const footer = locked
    ? (heartbeatLastRun ?? "not run yet")
    : !runnable
      ? "soon"
      : !live
        ? "off"
        : (card?.receipt ?? "not run yet")

  return (
    <Card
      data-live={live || undefined}
      className={cn(
        "group/rhythm relative h-full ring-0 shadow-xs",
        "transition-[box-shadow,background-color] duration-150 ease-out",
        // Hover confirms an affordance that is real: the whole card opens the
        // rhythm, through the overlay on the title link below.
        "hover:shadow-md",
        // The ring goes on the card, not on the link inside it. The click
        // target is the whole card, so a focus indicator around a short word
        // would tell a keyboard user something different than it tells a mouse.
        "has-[a:focus-visible]:ring-ring/50 has-[a:focus-visible]:ring-2",
        "data-live:bg-signal-surface"
      )}
    >
      <CardHeader>
        <Flow rhythm={rhythm} live={live} />
        {/* z-10 keeps the switch above the title link's full-card overlay.
            Without it, reaching for the toggle navigates instead. */}
        <CardAction className="relative z-10">
          <RhythmSwitch
            rhythmId={rhythm.id}
            name={rhythm.name}
            enabled={live}
            runnable={runnable}
            locked={locked}
          />
        </CardAction>
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

        <p className="text-caption text-foreground text-pretty">
          {rhythm.promise}
        </p>
        <p className="text-caption text-muted-foreground text-pretty">
          {rhythm.how}
        </p>
      </CardContent>

      <CardContent className="mt-auto flex items-center justify-between gap-3">
        <span className="text-caption text-muted-foreground font-mono whitespace-nowrap tabular-nums">
          {/* The user's own time once they have chosen one, the catalogue's
              default before that. A card claiming "daily 14:00" for somebody
              who moved it to 08:00 is the one lie this row can tell. */}
          {card?.when ?? rhythm.trigger.label}
        </span>
        <span
          className={cn(
            "text-caption min-w-0 truncate font-mono tabular-nums",
            card?.failed ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {footer}
        </span>
      </CardContent>
    </Card>
  )
}
