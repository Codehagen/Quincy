import {
  FAMILY_LABEL,
  FAMILY_NOTE,
  FAMILY_ORDER,
  LIVE_RHYTHMS,
  type Rhythm,
} from "@/lib/rhythms"
import { RUNS_ELSEWHERE } from "@/lib/rhythm-handlers"
import { Card, Mono, Stage, Text, TextLink } from "@/components/kit"
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
 * **On the kit since 2026-11-16** (plans/029): a Stage per family (the
 * family's name as the lead, its note as the grey rest), one Card of rows
 * under it. The card grid went: tile grids were discarded, and a row reads
 * at speed down one edge where a grid makes the eye zigzag. Each row answers
 * what it is called (a link to its page), what it does for you, and when it
 * runs; how it works in detail lives on /rhythm/[id]. A running rhythm says
 * so in words (its switch, and its time in ink), never with a green dot.
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
      {FAMILY_ORDER.map((family) => {
        const rhythms = LIVE_RHYTHMS.filter((r) => r.family === family)
        if (rhythms.length === 0) return null

        return (
          <Stage
            key={family}
            lead={`${FAMILY_LABEL[family]}.`}
            rest={FAMILY_NOTE[family]}
          >
            <Card>
              <ul role="list" className="flex flex-col gap-kit-group">
                {rhythms.map((rhythm) => (
                  <RhythmRow
                    key={rhythm.id}
                    rhythm={rhythm}
                    card={cards[rhythm.id]}
                    heartbeatLastRun={lastRun}
                  />
                ))}
              </ul>
            </Card>
          </Stage>
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

/** "Today" → "today" inside a sentence; a date ("12 Nov") keeps its month's capital. */
function inSentence(when: string) {
  return when === "Today" || when === "Yesterday" ? when.toLowerCase() : when
}

function RhythmRow({
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
   * Live, and it means what it always means: this is running.
   *
   * An event rhythm is deliberately not live. It runs — that is why it is on
   * this page — but whether its source is connected right now is a question
   * this row cannot ask without a query per row, and an ink time next to
   * Shipped Work for somebody who never connected GitHub is the one lie the
   * row must not tell.
   */
  const live = locked || (runnable && (card?.enabled ?? false))

  /**
   * Three states, three phrases, and the difference is what a person came to
   * find out. "on Sources" means the control is elsewhere, "off" means you
   * turned it off here, and a date means it did something.
   */
  const footer = locked
    ? (heartbeatLastRun ? `last ran ${inSentence(heartbeatLastRun)}` : "not run yet")
    : elsewhere?.kind === "event"
      ? "switched on Sources"
      : !card?.enabled
        ? "off"
        : card?.receipt
          ? `last ran ${inSentence(card.receipt)}`
          : "not run yet"

  // The user's own time once they have chosen one, the catalogue's default
  // before that. A row claiming "daily 14:00" for somebody who moved it to
  // 08:00 is the one lie this row can tell.
  const when = card?.when ?? rhythm.trigger.label
  const nameId = `rhythm-${rhythm.id}-name`

  return (
    <li className="flex items-start gap-kit-related">
      <div className="flex min-w-0 flex-1 flex-col gap-kit-tight">
        <Text id={nameId} weight="strong">
          <TextLink href={`/rhythm/${rhythm.id}`}>{rhythm.name}</TextLink>
        </Text>
        <Text as="div" variant="small" tone="muted">
          {rhythm.promise}
        </Text>
        <Text as="div" variant="small" tone="muted">
          <span className="flex flex-wrap items-center gap-x-kit-related gap-y-kit-tight">
            {/* On is said by the switch beside it and "off" by the footer;
                the time is ink while it runs. No dot: green is not a status
                colour (docs/design/states.md, "Working"). */}
            {live ? <Mono tone="ink">{when}</Mono> : <Mono>{when}</Mono>}
            {/* A failed last run is said in ink, not red: nothing was
                destroyed (docs/design/states.md). */}
            <span className={card?.failed ? "text-kit-ink" : undefined}>
              {card?.failed ? `${footer}, and failed` : footer}
            </span>
          </span>
        </Text>
      </div>

      {/* Nothing at all for an event rhythm. It has no hour to choose and
          nothing for the dispatcher to fire, so a disabled switch here would
          be a second control over a fact /sources owns. */}
      {runnable || locked ? (
        <div className="flex shrink-0 items-center pt-0.5">
          <RhythmSwitch
            rhythmId={rhythm.id}
            name={rhythm.name}
            enabled={live}
            locked={locked}
          />
        </div>
      ) : null}
    </li>
  )
}
