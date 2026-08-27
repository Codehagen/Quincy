import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
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
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { NodeChip } from "@/components/rhythm/node-chip"
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
   * Brass means running, and it has to mean it here too.
   *
   * This used to read `rhythm.available`, a catalogue boolean that said "this
   * has been built" — so a rhythm you had switched off still wore the signal
   * ring. Heartbeat runs for everyone; a subscription runs when you turned it
   * on; an event rhythm is not claimed either way, because whether its source
   * is connected is a question this page would have to go and ask, and a brass
   * ring around Shipped Work for somebody with no GitHub connection is the one
   * lie the colour must not tell.
   */
  const live = locked || (runnable && state.enabled)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5 self-start"
        nativeButton={false}
        render={<Link href="/rhythm" />}
      >
        <HugeiconsIcon
          aria-hidden="true"
          data-icon="inline-start"
          icon={ArrowLeft01Icon}
        />
        Rhythm
      </Button>

      <header className="flex items-start justify-between gap-4 px-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-display text-balance">{rhythm.name}</h1>
          <p className="text-body-lg text-pretty text-muted-foreground">
            {rhythm.promise}
          </p>
        </div>
        {/* The same switch as the card, so a rhythm can be turned off from
            wherever you noticed it should be — and nothing at all for an event
            rhythm, whose control is on /sources. `mt-2` optically centres it
            against the display-size heading rather than its box. */}
        {runnable || locked ? (
          <div className="mt-2 shrink-0">
            <RhythmSwitch
              rhythmId={rhythm.id}
              name={rhythm.name}
              enabled={live}
              locked={locked}
            />
          </div>
        ) : null}
      </header>

      <section
        className={cn(
          "flex flex-col gap-4 rounded-2xl p-5",
          // Ring, not fill, and the card on /rhythm now draws the same one.
          // Brass is never a surface: a tint here would colour the block the
          // page exists to have you read, and on the index it sat under a
          // control you press.
          live ? "bg-card ring-1 ring-signal-border" : "bg-card shadow-xs"
        )}
      >
        <p className="text-body text-pretty">{rhythm.how}</p>

        <Separator />

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[7rem_1fr]">
          <Field term="When">
            <span className="font-mono tabular-nums">
              {/* The user's own time once they have one. `trigger.label` is
                  prose for the catalogue and stops being true the moment
                  somebody moves it. */}
              {runnable && state.subscriptionId
                ? describeCadence(state)
                : rhythm.trigger.label}
            </span>
          </Field>

          {rhythm.from.length > 0 ? (
            <Field term="Reads">
              <NodeList nodes={rhythm.from} />
            </Field>
          ) : null}

          <Field term="Makes">{MAKES_LABEL[rhythm.makes]}</Field>

          <Field term="Lands in">
            <NodeList nodes={rhythm.to} live={live} />
          </Field>

          <Field term="Family">{FAMILY_LABEL[rhythm.family]}</Field>
        </dl>

        {/* Only for a subscription. Heartbeat has no time to set — it runs for
            everyone on a system cron — and an event rhythm has no clock at
            all. */}
        {runnable && !locked ? (
          <>
            <Separator />
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
      </section>

      {/* An event rhythm gets this instead of a run list, not beside it.
          Nothing schedules it, so `rhythm_run` has no rows for it and "Recent
          runs" would be a heading over a permanent empty state — the section
          that exists only to explain why it is empty. */}
      {eventControl ? (
        <section className="flex flex-col gap-3">
          <h2 className="px-3 text-section">Turning it on and off</h2>

          <Empty className="rounded-xl bg-card shadow-xs">
            <EmptyHeader>
              <EmptyTitle>There is no switch here</EmptyTitle>
              <EmptyDescription>
                It fires {rhythm.trigger.label} and stops when you disconnect
                the source, so Sources is where it goes on and off.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                nativeButton={false}
                render={<Link href={eventControl.switchedAt} />}
              >
                Open sources
                <HugeiconsIcon
                  aria-hidden="true"
                  data-icon="inline-end"
                  icon={ArrowRight01Icon}
                />
              </Button>
            </EmptyContent>
          </Empty>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 px-3">
            <h2 className="text-section">Recent runs</h2>
            <p className="text-caption text-pretty text-muted-foreground">
              The only honest reason to leave a rhythm on.
            </p>
          </div>

          {locked ? (
            heartbeatRuns.length === 0 ? (
              <Empty className="rounded-xl bg-card shadow-xs">
                <EmptyHeader>
                  <EmptyTitle>Has not run yet</EmptyTitle>
                  <EmptyDescription>
                    It fires {rhythm.trigger.label}. The first run will show up
                    here with the pages it wrote.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul
                role="list"
                className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs"
              >
                {heartbeatRuns.map((run) => (
                  <li
                    key={run.at.toISOString()}
                    className="flex items-center gap-4 px-4 py-3"
                  >
                    <span className="w-24 shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                      {formatConversationDate(run.at, zone, now)}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-body">
                      Compiled the inbox
                    </p>
                    <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                      {run.pages} {run.pages === 1 ? "page" : "pages"}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : rhythmRuns.length === 0 ? (
            <Empty className="rounded-xl bg-card shadow-xs">
              <EmptyHeader>
                <EmptyTitle>
                  {state.enabled ? "Has not run yet" : "Switched off"}
                </EmptyTitle>
                <EmptyDescription>
                  {state.enabled
                    ? `It fires ${describeCadence(state)}. Press Run now if you would rather not wait.`
                    : "Turn it on and every run will show up here with what it left behind."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul
              role="list"
              className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs"
            >
              {rhythmRuns.map((run) => (
                <li
                  key={run.at.toISOString()}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <span className="w-24 shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                    {formatConversationDate(run.at, zone, now)}
                  </span>
                  {/* Not truncated. A summary is the whole content of the row and
                    the one thing a person came here to read — the heartbeat
                    list above can truncate because its rows all say the same
                    thing. */}
                  <p
                    className={cn(
                      "min-w-0 flex-1 text-body text-pretty",
                      run.state === "failed" && "text-destructive"
                    )}
                  >
                    {run.summary || "Nothing to report."}
                  </p>
                  {/* Only the states worth a badge. Labelling every `ok` run
                    "ok" is noise on a list where ok is the default. */}
                  {run.state !== "ok" || run.manual ? (
                    <span className="shrink-0 font-mono text-caption text-muted-foreground">
                      {run.state === "ok" ? "by hand" : run.state}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function Field({
  term,
  children,
}: {
  term: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="text-caption text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-body">{children}</dd>
    </>
  )
}

function NodeList({ nodes, live = false }: { nodes: Node[]; live?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {nodes.map((n) => (
        <span key={n} className="flex items-center gap-1.5">
          <NodeChip node={n} live={live} labelled />
          {NODE_LABEL[n] ?? n}
        </span>
      ))}
    </span>
  )
}
