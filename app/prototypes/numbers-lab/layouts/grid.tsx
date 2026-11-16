"use client"

import * as React from "react"

import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { readBeats } from "@/lib/draft-beats"
import { Avatar, Button, ICON_DENSE_CHEVRON, Menu, MenuPanel, MenuRadioGroup, MenuRadioItem, MenuTrigger, Tag, WorkspacePage } from "@/components/kit"

import {
  againstMedianPost,
  againstUsual,
  dollars,
  fmt,
  formatMultiple,
  type Measure,
  type QuincyWeek,
  type Tile,
} from "../data"
import { useLabOptions } from "../lab-options"
import { MultipleBar, MultipleScale, Sparkline, WeekColumns, WeekDots, roundUsual } from "../parts/charts"
import { Bars, EmptyNumbers, GridPanel, NumbersToolbar, Proposed, StateLine } from "../parts/chrome"
import { TABLE_FOR, type LayoutProps } from "./types"

/**
 * A · Dashboard grid, picked (2026-11-16: "Så jeg liker Dashboard og
 * table"). A period switch in the toolbar, four tiles you scan in one
 * glance, then a grid of panels. The content stays the vision's: every
 * tile is a sentence against your own usual, Depth (replies, people who
 * came back) before Volume (posts, views per post), no follower count.
 *
 * A tile and a "What worked" row are ways in, not ornaments: each opens
 * Table on the posts behind it (TABLE_FOR), and Esc or the crumb comes back
 * here with focus on what opened it. The trend panel picks its own measure.
 */
export function GridLayout({ data, read, phase, period, setPeriod, openTable, returnTo }: LayoutProps) {
  const opts = useLabOptions()
  const [measure, setMeasure] = React.useState<Measure>("replies")
  const loading = phase === "loading"
  const tiles = opts.order === "depth" ? read.tiles : [...read.tiles.slice(2), ...read.tiles.slice(0, 2)]
  const picked = read.tiles.find((t) => t.measure === measure) ?? read.tiles[0]!
  const inWindow = read.weeks.map((w) => w.inWindow)

  // Back from Table: focus lands on the tile or row that opened it.
  React.useEffect(() => {
    if (!returnTo) return
    const id = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-return="${CSS.escape(returnTo)}"]`)
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: "nearest" })
    })
    return () => cancelAnimationFrame(id)
  }, [returnTo])

  return (
    <WorkspacePage>
      <NumbersToolbar data={data} phase={phase} period={period} setPeriod={setPeriod} />
      {phase === "empty" || phase === "disconnected" ? (
        <EmptyNumbers kind={phase} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-kit-group px-kit-group py-kit-group">
            <StateLine phase={phase} minWeeks={opts.minWeeks} notes={data.notes} />

            <div role="group" aria-label={`The last ${read.days} days against your usual`} className="grid grid-cols-2 gap-kit-related @[60rem]/kit-workspace:grid-cols-4">
              {tiles.map((t) => (
                <StatTile
                  key={t.measure}
                  tile={t}
                  inWindow={inWindow}
                  days={read.days}
                  minWeeks={opts.minWeeks}
                  loading={loading}
                  onOpen={() => openTable(TABLE_FOR[t.measure], `tile-${t.measure}`)}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-kit-related @[60rem]/kit-workspace:grid-cols-3">
              <GridPanel
                title={`${picked.label} per week`}
                meta={
                  loading ? null : (
                    <Menu>
                      <MenuTrigger
                        aria-label={`Chart: ${picked.label}. Change what it shows`}
                        render={
                          <Button size="xs" variant="ghost" iconEnd={ArrowDown01Icon}>
                            {picked.label}
                          </Button>
                        }
                      />
                      <MenuPanel align="end">
                        <MenuRadioGroup value={measure} onValueChange={(v) => setMeasure(v as Measure)}>
                          {read.tiles.map((t) => (
                            <MenuRadioItem key={t.measure} value={t.measure}>
                              {t.label}
                            </MenuRadioItem>
                          ))}
                        </MenuRadioGroup>
                      </MenuPanel>
                    </Menu>
                  )
                }
                className="@[60rem]/kit-workspace:col-span-2"
              >
                {loading ? (
                  <Bars widths={["100%", "92%", "96%", "88%"]} />
                ) : picked.proposed ? (
                  <Proposed why={picked.proposed} />
                ) : (
                  <WeekColumns
                    key={picked.measure}
                    label={`${picked.label} per week`}
                    weeks={read.weeks.map((w, i) => ({ label: w.label, inWindow: w.inWindow, value: picked.weekly[i] ?? null }))}
                    usual={perWeek(picked, read.days)}
                    say={picked.say}
                  />
                )}
              </GridPanel>

              <PeoplePanel read={read} loading={loading} />

              <BestPanel read={read} loading={loading} openPost={(id) => openTable({ post: id, show: "all", order: "best" }, `row-${id}`)} />

              <QuincyPanel now={read.quincy.now} usual={read.quincy.usual} loading={loading} days={read.days} minWeeks={opts.minWeeks} />
            </div>
          </div>
        </div>
      )}
    </WorkspacePage>
  )
}

/** A tile's usual, per week, for its sparkline and the trend's line. Reach is already per post. */
function perWeek(t: Tile, days: number) {
  if (t.baseline.usual === null) return null
  return t.measure === "reach" ? t.baseline.usual : t.baseline.usual / (days / 7)
}

/** What a tile opens, said to assistive tech after the tile's own sentence. */
const OPENS: Record<Measure, string> = {
  replies: "Open the posts that got replies.",
  people: "Open the posts someone came back to.",
  posts: "Open the posts.",
  reach: "Open the posts, most views first.",
}

function StatTile({
  tile,
  inWindow,
  days,
  minWeeks,
  loading,
  onOpen,
}: {
  tile: Tile
  inWindow: boolean[]
  days: number
  minWeeks: number
  loading: boolean
  onOpen: () => void
}) {
  const opts = useLabOptions()
  const sentence =
    tile.value === null
      ? tile.proposed ?? "Nothing in this period."
      : tile.measure === "reach"
        ? againstMedianPost(tile.value, tile.baseline.usual, minWeeks)
        : againstUsual(tile.value, tile.baseline.usual, tile.unit, days, minWeeks)
  return (
    <button
      type="button"
      data-return={`tile-${tile.measure}`}
      onClick={onOpen}
      disabled={loading}
      className="group/tile relative flex min-w-0 cursor-pointer flex-col gap-kit-tight rounded-kit-control bg-kit-object px-kit-group py-kit-related text-start shadow-kit-object outline-hidden transition-[background-color,scale] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus active:scale-(--kit-press-scale) disabled:cursor-default disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <span className="flex items-baseline justify-between gap-2 text-kit-meta">
        <span className="font-kit-strong text-kit-ink">{tile.label}</span>
        <span className="flex items-center gap-1 text-kit-ink-muted">
          {tile.kind === "depth" ? "Depth" : "Volume"}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            {...ICON_DENSE_CHEVRON}
            aria-hidden
            className="-me-1 transition-[translate] duration-(--kit-duration-state) ease-kit-out group-hover/tile:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </span>
      {loading ? (
        <span className="flex flex-col gap-2 py-1">
          <span className="block h-5 w-16 rounded-kit-chip bg-kit-skeleton" />
          <span className="block h-kit-skeleton w-4/5 rounded-full bg-kit-skeleton" />
          <span className="mt-1 block h-7 w-full rounded-kit-chip bg-kit-skeleton opacity-50" />
        </span>
      ) : tile.value === null && tile.proposed ? (
        <>
          <span className="text-kit-figure text-kit-ink-muted">Not read yet</span>
          <span className="line-clamp-2 min-h-8 text-kit-meta text-kit-ink-muted">
            <Tag look="text">Proposed</Tag> {tile.proposed}.
          </span>
          <span className="block h-7" />
        </>
      ) : (
        <>
          <span className="text-kit-figure text-kit-ink">{tile.value === null ? "None" : tile.say(tile.value)}</span>
          <span className="line-clamp-2 min-h-8 text-kit-meta text-kit-ink-muted">{sentence}</span>
          <Sparkline values={tile.weekly} inWindow={inWindow} usual={perWeek(tile, days)} kind={opts.spark} />
        </>
      )}
      <span className="sr-only">{OPENS[tile.measure]}</span>
    </button>
  )
}

function PeoplePanel({ read, loading }: { read: LayoutProps["read"]; loading: boolean }) {
  const people = read.people
  const unanswered = people?.filter((p) => !p.person.answered).length ?? 0
  return (
    <GridPanel title="People who keep showing up" meta={people && !loading ? `${people.length} replied` : null}>
      {loading ? (
        <Bars widths={["90%", "75%", "84%", "70%", "80%"]} />
      ) : people === null ? (
        <div className="flex flex-col gap-kit-related">
          <Proposed why="who replied, not just how many" />
          <p className="text-kit-dense text-pretty text-kit-ink-muted">
            The count of replies is real. Who wrote them is not stored yet, so I can&apos;t tell you who keeps coming back. Reading the replies under each post every morning would fill this, inside the read that already runs.
          </p>
        </div>
      ) : people.length === 0 ? (
        <p className="text-kit-dense text-kit-ink-muted">Nobody replied in this period.</p>
      ) : (
        <>
          <ul className="-mx-2 flex flex-col">
            {people.slice(0, 6).map(({ person, inWindow, before, weeks }) => (
              <li key={person.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-kit-chip px-2 py-1.5">
                <Avatar initials={person.name.split(" ").map((s) => s[0]).join("")} />
                <span className="min-w-0">
                  <span className="block truncate text-kit-dense text-kit-ink">
                    {person.name} <span className="text-kit-ink-muted">@{person.handle}</span>
                  </span>
                  <span className="block text-kit-meta text-pretty text-kit-ink-muted tabular-nums">
                    {inWindow} {inWindow === 1 ? "reply" : "replies"} now{before ? `, ${before} before` : ", new"}
                    {person.answered ? "" : ". Not answered"}
                  </span>
                </span>
                <span title="The last eight weeks, a dot for each week they replied">
                  <WeekDots weeks={weeks} />
                  <span className="sr-only">Replied in {weeks.filter(Boolean).length} of the last 8 weeks.</span>
                </span>
              </li>
            ))}
          </ul>
          {unanswered > 0 ? (
            <div className="flex flex-wrap items-center gap-x-kit-related gap-y-kit-tight border-t border-kit-hairline pt-kit-related">
              <Button size="sm" variant="action">
                Draft {unanswered === 1 ? "a reply" : `${unanswered} replies`}
              </Button>
              <span className="text-kit-meta text-kit-ink-muted">I draft, you send.</span>
            </div>
          ) : null}
        </>
      )}
    </GridPanel>
  )
}

function BestPanel({ read, loading, openPost }: { read: LayoutProps["read"]; loading: boolean; openPost: (id: string) => void }) {
  const opts = useLabOptions()
  const rows = read.scored
    .filter((s) => s.post.day !== null && s.post.day < read.days)
    .sort((a, b) => b.post.views - a.post.views)
    .slice(0, opts.best)
  return (
    <GridPanel
      title="What worked"
      meta={loading ? null : read.medianViews === null ? "No median yet" : `Your median post: ${fmt(read.medianViews)} views`}
      className="@[60rem]/kit-workspace:col-span-2"
    >
      {loading ? (
        <Bars widths={["96%", "90%", "94%", "86%", "92%"]} />
      ) : rows.length === 0 ? (
        <p className="text-kit-dense text-kit-ink-muted">Nothing went out in the last {read.days} days.</p>
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,9rem)_4rem] gap-x-kit-related pb-1 @[40rem]/kit-workspace:grid-cols-[minmax(0,1fr)_minmax(7rem,12rem)_4rem_4rem]">
            <span className="text-kit-meta text-kit-ink-muted">Post</span>
            <MultipleScale scale={opts.scale} />
            <span className="text-end text-kit-meta whitespace-nowrap text-kit-ink-muted">× median</span>
            <span className="hidden text-end text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block">Replies</span>
          </div>
          <ul className="-mx-2 flex flex-col">
            {rows.map(({ post, multiple }) => {
              const beats = post.body ? readBeats(post.body) : null
              return (
                <li key={post.id}>
                  <button
                    type="button"
                    data-return={`row-${post.id}`}
                    onClick={() => openPost(post.id)}
                    aria-label={`${post.hook}. ${fmt(post.views)} views${multiple ? `, ${formatMultiple(multiple)} your median` : ""}, ${post.replies} replies. Open it.`}
                    className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_minmax(5rem,9rem)_4rem] items-center gap-x-kit-related rounded-kit-chip px-2 py-1.5 text-start outline-hidden transition-[background-color] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-kit-focus motion-reduce:transition-none @[40rem]/kit-workspace:grid-cols-[minmax(0,1fr)_minmax(7rem,12rem)_4rem_4rem]"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-kit-dense text-kit-ink">{post.hook}</span>
                      {beats ? <span className="shrink-0 text-kit-meta text-kit-ink-muted">3 beats</span> : null}
                    </span>
                    <MultipleBar multiple={multiple} scale={opts.scale} />
                    <span className="text-end font-kit-mono text-kit-mono-sm text-kit-ink tabular-nums">{multiple === null ? fmt(post.views) : formatMultiple(multiple)}</span>
                    <span className="hidden text-end font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums @[40rem]/kit-workspace:block">{post.replies}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </GridPanel>
  )
}

function QuincyPanel({ now, usual, loading, days, minWeeks }: { now: QuincyWeek; usual: QuincyWeek | null; loading: boolean; days: number; minWeeks: number }) {
  const rows: { term: string; value: string; usual: string | null }[] = [
    { term: "Read", value: `${fmt(now.read)} saved posts`, usual: usual ? roundUsual(usual.read) : null },
    { term: "Drafted", value: fmt(now.drafted), usual: usual ? roundUsual(usual.drafted) : null },
    { term: "You approved", value: fmt(now.approved), usual: usual ? roundUsual(usual.approved) : null },
    { term: "Went out", value: fmt(now.posted), usual: usual ? roundUsual(usual.posted) : null },
    { term: "Cost", value: dollars(now.costMicros), usual: usual ? dollars(usual.costMicros) : null },
  ]
  return (
    <GridPanel title="What I did" meta={loading ? null : `Last ${days} days`}>
      {loading ? (
        <Bars widths={["80%", "70%", "76%", "60%", "66%"]} />
      ) : (
        <>
          <dl className="flex flex-col">
            {rows.map((r) => (
              <div key={r.term} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-kit-related border-b border-kit-hairline py-1.5 last:border-b-0">
                <dt className="text-kit-dense text-kit-ink-muted">{r.term}</dt>
                <dd className="text-end text-kit-dense text-kit-ink tabular-nums">
                  {r.value}
                  <span className="ms-2 text-kit-meta text-kit-ink-muted">{r.usual === null ? `needs ${minWeeks} wk` : `usually ${r.usual}`}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-kit-meta text-pretty text-kit-ink-muted">
            {now.drafted > 0 ? `You approved ${now.approved} of ${now.drafted} drafts. ` : ""}I draft, you send: nothing went out without you.
          </p>
        </>
      )}
    </GridPanel>
  )
}
