"use client"

import * as React from "react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { readBeats } from "@/lib/draft-beats"
import { Button, ButtonLink, IconButton, TextButton, WorkspacePage } from "@/components/kit"

import { againstUsual, dollars, fmt, formatMultiple, readNumbers, shiftData, weekLabel } from "../data"
import { useLabOptions } from "../lab-options"
import { MultipleBar, Sparkline, WeekDots } from "../parts/charts"
import { Bars, EmptyNumbers, NumbersToolbar, Proposed, StateLine } from "../parts/chrome"
import type { LayoutProps } from "./types"

/**
 * C · The weekly read. One week as a report Quincy writes: four short
 * paragraphs in the three-beat voice, numbers inline and always against
 * your usual, and a small chart in the margin beside the paragraph it
 * proves. Depth opens the report; it ends on a choice, never a summary.
 * The period is a week, stepped back and forth; the dashboard is the
 * margin. Under ~56rem the margin drops under each paragraph.
 */
export function WeeklyLayout({ data, phase, openPost }: LayoutProps) {
  const opts = useLabOptions()
  const [back, setBack] = React.useState(0)
  const maxBack = Math.max(0, data.historyWeeks - 1)
  const shifted = React.useMemo(() => shiftData(data, back), [data, back])
  const read = React.useMemo(() => readNumbers(shifted, "7", opts.minWeeks), [shifted, opts.minWeeks])
  const loading = phase === "loading"
  const label = weekLabel(data.today, back)

  const stepper = (
    <div className="flex items-center gap-kit-controls" role="group" aria-label="Week">
      <IconButton icon={ArrowLeft01Icon} aria-label="Previous week" disabled={back >= maxBack} onClick={() => setBack(back + 1)} />
      <span className="min-w-28 text-center text-kit-dense text-kit-ink tabular-nums" aria-live="polite">
        {back === 0 ? "This week" : label}
      </span>
      <IconButton icon={ArrowRight01Icon} aria-label="Next week" disabled={back === 0} onClick={() => setBack(back - 1)} />
    </div>
  )

  const tile = (m: string) => read.tiles.find((t) => t.measure === m)!
  const replies = tile("replies")
  const posts = tile("posts")
  const best = [...read.scored.filter((s) => s.post.day !== null && s.post.day < 7)].sort((a, b) => b.post.views - a.post.views)
  const top = best[0]
  const people = read.people
  const back2 = people?.filter((p) => p.before > 0) ?? []
  const loyal = people?.[0]
  const q = read.quincy

  return (
    <WorkspacePage>
      <NumbersToolbar data={data} phase={phase} period="7" setPeriod={() => {}} control={stepper} />
      {phase === "empty" || phase === "disconnected" ? (
        <EmptyNumbers kind={phase} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <article
            className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-kit-group py-10"
            style={{ ["--nl-margin" as string]: `${opts.margin}px` }}
            aria-label={`Your week, ${label}`}
          >
            <header className="flex flex-col gap-kit-tight">
              <h2 className="text-kit-heading text-kit-ink">The week of {label}</h2>
              <p className="text-kit-meta text-kit-ink-muted">Written by me this morning, from your own numbers. Every number is against your usual.</p>
            </header>
            <StateLine phase={phase} minWeeks={opts.minWeeks} notes={data.notes} />

            {loading ? (
              <Bars widths={["96%", "88%", "92%", "70%", "94%", "80%", "60%"]} />
            ) : (
              <>
                <Para
                  heading="Who showed up"
                  margin={
                    people === null ? (
                      <Proposed why="who replied" />
                    ) : people.length === 0 ? null : (
                      <div className="flex flex-col gap-1.5">
                        {(people ?? []).slice(0, 4).map((p) => (
                          <div key={p.person.id} className="flex items-center justify-between gap-2">
                            <span className="truncate text-kit-meta text-kit-ink-muted">{p.person.name.split(" ")[0]}</span>
                            <WeekDots weeks={p.weeks} />
                          </div>
                        ))}
                        <span className="text-kit-mono-sm font-kit-mono text-kit-ink-muted">last 8 weeks</span>
                      </div>
                    )
                  }
                >
                  {replies.value === 0 ? (
                    <>Nobody replied this week. </>
                  ) : (
                    <>
                      You got <N>{replies.say(replies.value ?? 0)}</N>. {againstUsual(replies.value ?? 0, replies.baseline.usual, "replies", 7, opts.minWeeks)}{" "}
                    </>
                  )}
                  {people === null ? (
                    <>I can&apos;t tell you yet who wrote them: I count replies, I don&apos;t read them.</>
                  ) : people.length === 0 ? (
                    replies.value ? <>None of them had replied to you before.</> : null
                  ) : people.length > 0 ? (
                    <>
                      <N>{people.length}</N> {people.length === 1 ? "person" : "people"} replied, <N>{back2.length}</N> of them not for the first time.
                      {loyal ? (
                        <>
                          {" "}
                          {loyal.person.name} has replied in <N>{loyal.weeks.filter(Boolean).length}</N> of the last 8 weeks
                          {loyal.person.answered ? "." : <>, and you haven&apos;t answered the latest one.</>}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </Para>

                <Para
                  heading="What worked"
                  margin={
                    best.length ? (
                      <div className="flex flex-col gap-1.5" aria-hidden>
                        {best.slice(0, 5).map((s, i) => (
                          <MultipleBar key={s.post.id} multiple={s.multiple} scale={opts.scale} emphasis={i === 0} />
                        ))}
                        <span className="text-kit-mono-sm font-kit-mono text-kit-ink-muted">each post against your median</span>
                      </div>
                    ) : null
                  }
                >
                  {top ? (
                    <>
                      Your best post was “{top.post.hook.replace(/[.!?]$/, "")}”: <N>{fmt(top.post.views)} views</N>
                      {top.multiple !== null ? (
                        <>
                          , <N>{formatMultiple(top.multiple)}</N> your median post
                        </>
                      ) : null}
                      , and <N>{top.post.replies}</N> {top.post.replies === 1 ? "reply" : "replies"}.{" "}
                      {top.post.body && readBeats(top.post.body)
                        ? "It had all three beats: what you did, a number on its own line, and what it meant."
                        : "It had no number on its own line, so it reads as an opinion, not a story."}{" "}
                      <TextButton onClick={() => openPost(top.post.id)}>Open it</TextButton>
                    </>
                  ) : (
                    <>Nothing went out this week, so there is nothing to rank.</>
                  )}
                </Para>

                <Para
                  heading="How much"
                  margin={
                    <div className="flex flex-col gap-1">
                      <Sparkline
                        values={posts.weekly.slice(-8)}
                        inWindow={read.weeks.slice(-8).map((w) => w.inWindow)}
                        usual={posts.baseline.usual}
                        kind="columns"
                      />
                      <span className="text-kit-mono-sm font-kit-mono text-kit-ink-muted">posts a week, 8 weeks</span>
                    </div>
                  }
                >
                  You posted <N>{posts.value === 1 ? "once" : `${posts.value} times`}</N>. {againstUsual(posts.value ?? 0, posts.baseline.usual, "posts", 7, opts.minWeeks)}
                  {read.tiles[3]!.value !== null ? (
                    <>
                      {" "}
                      The middle post did <N>{fmt(read.tiles[3]!.value)} views</N>
                      {read.medianViews !== null ? <>, against your median post of {fmt(read.medianViews)}</> : null}.
                    </>
                  ) : null}
                </Para>

                <Para
                  heading="What I did"
                  margin={
                    <dl className="grid grid-cols-[auto_auto] justify-between gap-x-3 gap-y-0.5 text-kit-meta tabular-nums">
                      <dt className="text-kit-ink-muted">Read</dt>
                      <dd className="text-end text-kit-ink">{q.now.read}</dd>
                      <dt className="text-kit-ink-muted">Drafted</dt>
                      <dd className="text-end text-kit-ink">{q.now.drafted}</dd>
                      <dt className="text-kit-ink-muted">Approved</dt>
                      <dd className="text-end text-kit-ink">{q.now.approved}</dd>
                      <dt className="text-kit-ink-muted">Cost</dt>
                      <dd className="text-end text-kit-ink">{dollars(q.now.costMicros)}</dd>
                    </dl>
                  }
                >
                  I read <N>{q.now.read}</N> saved posts and drafted <N>{q.now.drafted}</N>. You approved <N>{q.now.approved}</N>, and <N>{q.now.posted}</N> went out. It
                  cost <N>{dollars(q.now.costMicros)}</N>
                  {q.usual ? <>, against a usual {dollars(q.usual.costMicros)}</> : null}.
                </Para>

                <div className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group @[56rem]/kit-workspace:max-w-[34rem]">
                  <p className="text-kit-body text-kit-ink">
                    {top && top.post.body && readBeats(top.post.body)
                      ? "Shall I draft another post in the shape of your best one?"
                      : people && people.some((p) => !p.person.answered)
                        ? "Shall I draft replies to the people you haven't answered?"
                        : "Shall I draft next week's posts from what you saved?"}
                  </p>
                  <div className="flex flex-wrap gap-kit-controls">
                    <ButtonLink href="/ideas" variant="action" size="sm">
                      Draft it
                    </ButtonLink>
                    <Button size="sm" variant="ghost">
                      Not this week
                    </Button>
                  </div>
                </div>
              </>
            )}
          </article>
        </div>
      )}
    </WorkspacePage>
  )
}

function N({ children }: { children: React.ReactNode }) {
  return <strong className="font-kit-strong text-kit-ink tabular-nums">{children}</strong>
}

function Para({ heading, children, margin }: { heading: string; children: React.ReactNode; margin: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-kit-related @[56rem]/kit-workspace:grid-cols-[minmax(0,34rem)_var(--nl-margin)] @[56rem]/kit-workspace:gap-x-10">
      <div className="flex flex-col gap-kit-tight">
        <h3 className="text-kit-meta font-kit-strong text-kit-ink-muted">{heading}</h3>
        <p className="text-kit-body leading-6 text-pretty text-kit-ink">{children}</p>
      </div>
      {margin ? <aside className="self-start rounded-kit-control bg-kit-well p-kit-related @[56rem]/kit-workspace:mt-5">{margin}</aside> : null}
    </section>
  )
}
