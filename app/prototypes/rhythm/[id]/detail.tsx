"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

import {
  FAMILY_LABEL,
  MAKES_LABEL,
  NODE_LABEL,
  RHYTHMS,
  type Node,
} from "../data"
import { NodeChip, NovelBadge } from "../parts"

/**
 * What is behind the card. The index answers "what does this do"; this answers
 * "and on exactly what terms".
 *
 * Laid out as the same four fields the whole model is built on — when, from,
 * makes, where — because a detail page that invents a different vocabulary
 * than the list it opened from makes the user learn the product twice.
 *
 * Two things live here that cannot fit on a card: the per-channel shape (X
 * takes a thread, LinkedIn takes a carousel, and those are different
 * decisions), and the run history, which is the only honest evidence that the
 * rhythm is worth leaving on.
 */

const CHANNEL_FORM: Partial<Record<Node, string>> = {
  x: "Thread, plus 4 standalone posts",
  linkedin: "One long post and a carousel",
  threads: "3 openers, posted apart",
  instagram: "Carousel and 2 reels",
  tiktok: "2 vertical cuts, different hooks",
  youtube: "Short, titled for search",
  substack: "A Note linking back",
}

type Run = { date: string; source: string; made: number; published: number }

/**
 * Runs belong to a rhythm, not to the page.
 *
 * This was one module-level array shared by every rhythm, so Repurpose Winners
 * — which fires on a post beating your reach and makes four pieces — showed
 * three Sunday essays and "23 made". The index card said four. Two screens,
 * two numbers, same rhythm.
 *
 * Keyed by id and scaled off the rhythm's own yield, so the detail can never
 * again contradict the card that opened it.
 */
const RUNS_BY_RHYTHM: Record<string, Run[]> = {
  atomize: [
    { date: "Sun 2 Aug", source: "The quiet months", made: 17, published: 9 },
    {
      date: "Sun 26 Jul",
      source: "What a year of posting taught me",
      made: 19,
      published: 11,
    },
    {
      date: "Sun 19 Jul",
      source: "The three-opinion rule",
      made: 21,
      published: 9,
    },
  ],
  repurpose: [
    {
      date: "Thu 31 Jul",
      source: "Why I stopped batching my content",
      made: 4,
      published: 3,
    },
    {
      date: "Fri 25 Jul",
      source: "The hire I got wrong",
      made: 4,
      published: 2,
    },
    {
      date: "Mon 14 Jul",
      source: "Three miles and my mind is clear",
      made: 3,
      published: 3,
    },
  ],
  "voice-capture": [
    { date: "Today 08:12", source: "Voice note, 0:41", made: 2, published: 0 },
    { date: "Yesterday", source: "Voice note, 1:20", made: 3, published: 1 },
  ],
  meetings: [
    { date: "Yesterday", source: "Call with Nadia", made: 2, published: 1 },
    {
      date: "Tue 28 Jul",
      source: "Investor update call",
      made: 1,
      published: 0,
    },
  ],
  shipped: [
    { date: "12m ago", source: "feat: rhythm index", made: 1, published: 0 },
    {
      date: "Fri 1 Aug",
      source: "fix: reset token expiry",
      made: 1,
      published: 1,
    },
  ],
  "week-plan": [
    { date: "Sun 2 Aug", source: "Week of 3 August", made: 11, published: 6 },
    { date: "Sun 26 Jul", source: "Week of 27 July", made: 9, published: 9 },
  ],
  momentum: [
    { date: "5h ago", source: "The hire I got wrong", made: 1, published: 1 },
    {
      date: "Wed 30 Jul",
      source: "Why I stopped batching",
      made: 1,
      published: 1,
    },
  ],
  opportunity: [
    {
      date: "20m ago",
      source: "DM from a Series A founder",
      made: 1,
      published: 0,
    },
  ],
  people: [
    { date: "4h ago", source: "14 recurring repliers", made: 1, published: 0 },
  ],
  outliers: [
    { date: "2d ago", source: "The three-opinion rule", made: 1, published: 0 },
  ],
  morning: [
    { date: "3h ago", source: "Monday briefing", made: 1, published: 1 },
    { date: "Yesterday", source: "Sunday briefing", made: 1, published: 1 },
  ],
  evening: [
    { date: "Yesterday", source: "Evening report", made: 1, published: 1 },
  ],
}

export function RhythmDetail({ id }: { id: string }) {
  const rhythm = RHYTHMS.find((r) => r.id === id)

  if (!rhythm) {
    return (
      <div className="mx-auto flex w-full max-w-3xl px-8 py-10">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No such rhythm</EmptyTitle>
            <EmptyDescription>
              Nothing is set up under that name.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return <Detail rhythm={rhythm} />
}

function Detail({ rhythm }: { rhythm: (typeof RHYTHMS)[number] }) {
  const [on, setOn] = React.useState(rhythm.enabled)
  const runs = RUNS_BY_RHYTHM[rhythm.id] ?? []

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5 self-start"
        nativeButton={false}
        render={<Link href="/prototypes/rhythm" />}
      >
        <HugeiconsIcon
          aria-hidden="true"
          data-icon="inline-start"
          icon={ArrowLeft01Icon}
        />
        Rhythm
      </Button>

      <header className="flex items-start gap-6 px-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-display text-balance">{rhythm.name}</h1>
            {rhythm.novel ? <NovelBadge /> : null}
          </div>
          <p className="text-body-lg text-pretty text-muted-foreground">
            {rhythm.promise}
          </p>
        </div>
        {/* The one control that matters, at the top, where the eye lands. */}
        <Switch
          checked={on}
          onCheckedChange={setOn}
          aria-label={`${rhythm.name} — ${on ? "on" : "off"}`}
          className="mt-3 ml-auto shrink-0"
        />
      </header>

      <section
        className={cn(
          "flex flex-col gap-4 rounded-2xl p-5",
          "transition-[background-color] duration-150 ease-out",
          // 24px radius with 20px padding derives a 4px inner chip.
          // Ring, not fill. On the index brass separates on-cards from
          // off-cards; here there is one object and a switch six lines above,
          // so a tinted surface adds no information and tints the block the
          // page exists to have you read.
          on ? "bg-card ring-1 ring-signal-border" : "bg-card shadow-xs"
        )}
      >
        <p className="text-body text-pretty">{rhythm.how}</p>

        <Separator />

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[7rem_1fr]">
          <Field term="When">
            <span className="font-mono tabular-nums">
              {rhythm.trigger.label}
            </span>
          </Field>

          {rhythm.from.length > 0 ? (
            <Field term="Reads">
              <NodeList nodes={rhythm.from} />
            </Field>
          ) : null}

          <Field term="Makes">
            <span>{MAKES_LABEL[rhythm.makes]}</span>
          </Field>

          <Field term="Lands in">
            <NodeList nodes={rhythm.to} live={on} />
          </Field>

          <Field term="Family">
            <span>{FAMILY_LABEL[rhythm.family]}</span>
          </Field>
        </dl>
      </section>

      {rhythm.to.some((n) => CHANNEL_FORM[n]) ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 px-3">
            <h2 className="text-section">Shape per channel</h2>
            <p className="text-caption text-pretty text-muted-foreground">
              Each channel gets its own shape. Turn one off and {rhythm.name}{" "}
              skips it without stopping.
            </p>
          </div>

          <ul
            role="list"
            className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs"
          >
            {rhythm.to.map((node) => (
              <ChannelRow key={node} node={node} parentOn={on} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-3">
          <h2 className="text-section">Recent runs</h2>
          <p className="text-caption text-pretty text-muted-foreground">
            The only honest reason to leave a rhythm on.
          </p>
        </div>

        {/* A rhythm that has never run has no history, and showing three rows
            of invented numbers under it is the one thing a prototype used for
            decisions must not do. `lastRun` is the marker. */}
        {runs.length === 0 ? (
          <Empty className="rounded-xl bg-card shadow-xs">
            <EmptyHeader>
              <EmptyTitle>Has not run yet</EmptyTitle>
              <EmptyDescription>
                Turn it on and the first run will show up here, with what it
                made and how much of it you published.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul
            role="list"
            className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs [&>li]:has-[a:focus-visible]:ring-2 [&>li]:has-[a:focus-visible]:ring-ring/50 [&>li]:has-[a:focus-visible]:ring-inset"
          >
            {runs.map((run) => (
              <li
                key={run.date}
                className="group/run relative flex items-center gap-4 px-4 py-3"
              >
                <span className="w-24 shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                  {run.date}
                </span>
                {/* A row that reads like a link now is one. The overlay covers
                  the row; the accessible name is the source, not the whole
                  line of numbers. */}
                <p className="min-w-0 flex-1 truncate text-body">
                  <Link
                    href="/prototypes/run"
                    className={cn(
                      "after:absolute after:inset-0",
                      "underline-offset-4 group-hover/run:underline",
                      "outline-none"
                    )}
                  >
                    {run.source}
                  </Link>
                </p>
                <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                  {run.made} made · {run.published} published
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
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

function ChannelRow({ node, parentOn }: { node: Node; parentOn: boolean }) {
  const [on, setOn] = React.useState(true)
  const active = on && parentOn

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <NodeChip node={node} live={active} />

      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-card-title">{NODE_LABEL[node] ?? node}</p>
        <p className="truncate text-caption text-muted-foreground">
          {CHANNEL_FORM[node] ?? "Adapted for this channel"}
        </p>
      </div>

      <Switch
        checked={on}
        onCheckedChange={setOn}
        disabled={!parentOn}
        aria-label={`${NODE_LABEL[node] ?? node} — ${on ? "on" : "off"}`}
        className="ml-auto shrink-0"
      />
    </li>
  )
}
