import { notFound, redirect } from "next/navigation"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import { getSession } from "@/lib/session"
import { formatConversationDate } from "@/lib/format-date"
import { formatSlotTime } from "@/lib/slots"
import { resolveTimeZone } from "@/lib/timezone"
import {
  defaultRhythmState,
  describeCadence,
  FAMILY_LABEL,
  getHeartbeatRuns,
  getRhythm,
  getRhythmRuns,
  getRhythmStates,
  isRunnable,
  MAKES_LABEL,
  NODE_LABEL,
  type Node,
} from "@/lib/rhythms"
import { RUNS_ELSEWHERE, runsToday } from "@/lib/rhythm-handlers"
import { RhythmSettings } from "@/components/rhythm/rhythm-settings"
import { RhythmSwitch } from "@/components/rhythm/rhythm-switch"
import {
  ButtonLink,
  Card,
  EmptyState,
  KitPage,
  LiveDot,
  Mono,
  Rule,
  Stage,
  Text,
} from "@/components/kit"
import { NodeChip } from "@/components/rhythm/node-chip"
import { Friend } from "@/components/mascot"
import { constructMetadata } from "@/lib/metadata"

/**
 * One rhythm, on exactly what terms.
 *
 * Laid out as the same four fields the whole model is built on — when, reads,
 * makes, lands in — because a detail page that invents a different vocabulary
 * than the list it opened from makes the user learn the product twice.
 *
 * **404 for a rhythm that does not run.** The index renders only what has code
 * behind it (plans/027, 4a), so a detail page for one of the twenty in the
 * catalogue would be a URL nothing links to, describing a thing that cannot
 * happen. `getRhythm` still finds all twenty-seven, because the catalogue is
 * what a card comes back from.
 *
 * Run history is real and comes from two tables: `rhythm_run` for
 * subscriptions, `brain_event` for Heartbeat, which has no subscription row
 * (plans/016, decision 8). An event rhythm has neither — nothing schedules it
 * — so it gets the control it actually has instead of an empty list, which is
 * a link to the source that starts it.
 *
 * This is where the time is set, not the card. See components/rhythm/
 * rhythm-settings.tsx, which reuses the slot composer's control rather than
 * inventing a second way to say "this weekday, this time".
 *
 * A kit page since 2026-11-16 (plans/029): the rhythm's name is the page's
 * `h1`, its promise the summary. One Stage holds the switch, how it works and
 * the four fields; the next holds the runs, or the empty state that says why
 * there are none.
 */
export const metadata = constructMetadata({
  title: "Rhythm",
  noIndex: true,
})

export default async function RhythmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/login?next=/rhythm/${id}`)
  }

  const rhythm = getRhythm(id)
  if (!rhythm || !runsToday(rhythm.id)) {
    notFound()
  }

  // "Today" has to mean the reader's today, not the server's. See lib/timezone.
  const zone = resolveTimeZone(session.user.timezone)
  const now = new Date()

  /**
   * Heartbeat is the exception on this page and it is worth naming rather than
   * hiding: it has no subscription row, so its history comes from `brain_event`
   * via `getHeartbeatRuns` while every other rhythm reads `rhythm_run`. Two
   * sources for one list, which is the accepted cost of plans/016's decision
   * not to migrate the one rhythm that already worked.
   */
  const locked = rhythm.id === "heartbeat"
  const runnable = isRunnable(rhythm)
  /**
   * Set for the three rhythms that fire on an event rather than on a clock.
   * Carries the path the user actually controls them from, which is never this
   * page — a merge, a transcript and a recording all start where the source is
   * connected.
   */
  const elsewhere = RUNS_ELSEWHERE[rhythm.id]
  const eventControl = elsewhere?.kind === "event" ? elsewhere : null

  // The branches that do not apply resolve immediately, so whichever of these
  // reads this rhythm needs run concurrently instead of queueing behind each
  // other's round trips.
  const [states, heartbeatRuns, rhythmRuns] = await Promise.all([
    runnable ? getRhythmStates(session.user.id) : new Map(),
    locked ? getHeartbeatRuns(session.user.id) : [],
    runnable ? getRhythmRuns(session.user.id, rhythm.id) : [],
  ])
  const state = states.get(rhythm.id) ?? defaultRhythmState(rhythm.id)

  /**
   * `formatSlotTime`, not `formatConversationDate`.
   *
   * The two answer different questions and only one of them fits a future
   * instant: `formatConversationDate` buckets a *past* event ("Today",
   * "Yesterday", "3 days ago") and drops the clock entirely, so "Next run
   * Today." told you nothing you did not already know. `formatSlotTime` is
   * what /lineup already uses for "when this goes out" — "today at 14:00",
   * "Sun at 20:00" — which is exactly this question asked about a rhythm.
   */
  const nextRun =
    state.enabled && state.nextRunAt
      ? formatSlotTime(state.nextRunAt, zone, now)
      : null

  /**
   * Live means running, and it has to mean it here too.
   *
   * Heartbeat runs for everyone; a subscription runs when you turned it on;
   * an event rhythm is not claimed either way, because whether its source is
   * connected is a question this page would have to go and ask, and a live
   * dot beside Shipped Work for somebody with no GitHub connection is the one
   * lie it must not tell.
   */
  const live = locked || (runnable && state.enabled)

  // The user's own time once they have one. `trigger.label` is prose for the
  // catalogue and stops being true the moment somebody moves it.
  const when =
    runnable && state.subscriptionId
      ? describeCadence(state)
      : rhythm.trigger.label

  return (
    <KitPage
      title={rhythm.name}
      summary={rhythm.promise}
      actions={
        <ButtonLink href="/rhythm" icon={ArrowLeft01Icon}>
          Rhythm
        </ButtonLink>
      }
    >
      <Stage lead="How it works.">
        <Card>
          <div className="flex flex-col gap-kit-related">
            {/* The same switch as the row on /rhythm, so a rhythm can be
                turned off from wherever you noticed it should be — and
                nothing at all for an event rhythm, whose control is on
                /sources. */}
            <div className="flex items-center gap-kit-related">
              <div className="min-w-0 flex-1">
                {live ? (
                  <LiveDot>
                    <Text as="span" weight="strong">
                      {locked ? "Always on" : "On"}
                    </Text>
                  </LiveDot>
                ) : (
                  <Text weight="strong">
                    {eventControl ? "Runs when its source sends something" : "Off"}
                  </Text>
                )}
              </div>
              {runnable || locked ? (
                <RhythmSwitch
                  rhythmId={rhythm.id}
                  name={rhythm.name}
                  enabled={live}
                  locked={locked}
                />
              ) : null}
            </div>

            <Rule />

            <Text>{rhythm.how}</Text>

            <dl className="grid gap-x-kit-group gap-y-kit-related sm:grid-cols-[7rem_1fr]">
              <Term term="When">
                <Mono tone="ink">{when}</Mono>
              </Term>

              {rhythm.from.length > 0 ? (
                <Term term="Reads">
                  <NodeList nodes={rhythm.from} />
                </Term>
              ) : null}

              <Term term="Makes">{MAKES_LABEL[rhythm.makes]}</Term>

              <Term term="Lands in">
                <NodeList nodes={rhythm.to} live={live} />
              </Term>

              <Term term="Family">{FAMILY_LABEL[rhythm.family]}</Term>
            </dl>

            {/* Only for a subscription. Heartbeat has no time to set — it runs
                for everyone on a system cron — and an event rhythm has no
                clock at all. */}
            {runnable && !locked ? (
              <>
                <Rule />
                <RhythmSettings
                  rhythmId={rhythm.id}
                  enabled={state.enabled}
                  hour={state.hour}
                  minute={state.minute}
                  weekday={state.weekday}
                  nextRun={nextRun}
                  canRun={state.subscriptionId !== null && state.enabled}
                />
              </>
            ) : null}
          </div>
        </Card>
      </Stage>

      {/* An event rhythm gets this instead of a run list, not beside it.
          Nothing schedules it, so `rhythm_run` has no rows for it and "Recent
          runs" would be a heading over a permanent empty state. No lead: the
          empty state opens with its own bold sentence. */}
      {eventControl ? (
        <Stage>
          <EmptyState
            bold="There is no switch here."
            rest={`It fires ${rhythm.trigger.label} and stops when you disconnect the source, so Sources is where it goes on and off.`}
          >
            <ButtonLink href={eventControl.switchedAt}>Open Sources</ButtonLink>
          </EmptyState>
        </Stage>
      ) : locked ? (
        heartbeatRuns.length === 0 ? (
          <Stage>
            <EmptyState
              media={<Friend size={40} state="idle" className="text-kit-ink" />}
              bold="It hasn't run yet."
              rest={`It fires ${rhythm.trigger.label}. The first run shows up here with the pages it wrote.`}
            />
          </Stage>
        ) : (
          <Stage
            lead="Recent runs."
            rest="The only honest reason to leave a rhythm on."
          >
            <Card>
              <ul role="list" className="flex flex-col gap-kit-related">
                {heartbeatRuns.map((run) => (
                  <RunRow
                    key={run.at.toISOString()}
                    when={formatConversationDate(run.at, zone, now)}
                    meta={`${run.pages} ${run.pages === 1 ? "page" : "pages"}`}
                  >
                    Compiled the inbox
                  </RunRow>
                ))}
              </ul>
            </Card>
          </Stage>
        )
      ) : rhythmRuns.length === 0 ? (
        <Stage>
          <EmptyState
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold={state.enabled ? "It hasn't run yet." : "It's switched off."}
            rest={
              state.enabled
                ? `It fires ${describeCadence(state)}. Press Run now if you'd rather not wait.`
                : "Turn it on and every run shows up here with what it left behind."
            }
          />
        </Stage>
      ) : (
        <Stage
          lead="Recent runs."
          rest="The only honest reason to leave a rhythm on."
        >
          <Card>
            <ul role="list" className="flex flex-col gap-kit-related">
              {rhythmRuns.map((run) => (
                <RunRow
                  key={run.at.toISOString()}
                  when={formatConversationDate(run.at, zone, now)}
                  // Only the states worth a word. Labelling every `ok` run
                  // "ok" is noise on a list where ok is the default. A failed
                  // run is in ink, not red (docs/design/states.md).
                  meta={
                    run.state !== "ok" || run.manual
                      ? run.state === "ok"
                        ? "by hand"
                        : run.state
                      : undefined
                  }
                >
                  {run.summary || "Nothing to report."}
                </RunRow>
              ))}
            </ul>
          </Card>
        </Stage>
      )}
    </KitPage>
  )
}

/**
 * One run: when, then what it did. The summary is not truncated: it is the
 * whole content of the row and the one thing a person came here to read.
 */
function RunRow({
  when,
  meta,
  children,
}: {
  when: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-kit-tight sm:flex-row sm:items-baseline sm:gap-kit-group">
      <span className="shrink-0 sm:w-24">
        <Mono>{when}</Mono>
      </span>
      <Text as="div">
        <span className="text-pretty">{children}</span>
      </Text>
      {meta ? (
        <span className="shrink-0 sm:ml-auto">
          <Mono>{meta}</Mono>
        </span>
      ) : null}
    </li>
  )
}

function Term({
  term,
  children,
}: {
  term: string
  children: React.ReactNode
}) {
  return (
    <>
      <Text as="dt" tone="muted">
        {term}
      </Text>
      <Text as="dd">{children}</Text>
    </>
  )
}

function NodeList({ nodes, live = false }: { nodes: Node[]; live?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-kit-related gap-y-kit-tight">
      {nodes.map((n) => (
        <span key={n} className="flex items-center gap-kit-controls">
          <NodeChip node={n} live={live} labelled />
          {NODE_LABEL[n] ?? n}
        </span>
      ))}
    </span>
  )
}
