"use client"

import * as React from "react"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"

import { readBeats } from "@/lib/draft-beats"
import {
  MIN_WEEKS,
  TABLE_FOR,
  againstMedianPost,
  againstUsual,
  dollars,
  fmt,
  formatMultiple,
  roundUsual,
  usualPerWeek,
  type Measure,
  type QuincyWeek,
  type Read,
  type TableState,
  type Tile,
} from "@/lib/numbers-read"
import { Avatar, Button, Menu, MenuPanel, MenuRadioGroup, MenuRadioItem, MenuTrigger, Sparkline, StatTile } from "@/components/kit"

import { MultipleBar, MultipleScale, WeekChart, WeekDots } from "./charts"
import { NumbersPanel } from "./numbers-parts"

/**
 * The Dashboard: four tiles you scan in one glance, then a grid of panels
 * (decisions.md, "Never": Numbers is the one dashboard). Every tile is a
 * sentence against your own usual, Depth (replies, people who came back)
 * before Volume (posts, views per post), no follower count.
 *
 * A tile and a "What worked" row are ways in, not ornaments: each opens
 * Table on the posts behind it (TABLE_FOR), and Esc, the crumb or Back
 * comes back here with focus on what opened it. The trend panel picks its
 * own measure in a quiet menu, so one control does one thing.
 */

/** What a tile opens, said to assistive tech after the tile's own sentence. */
const OPENS: Record<Measure, string> = {
  replies: "Open the posts that got replies.",
  people: "Open the posts someone came back to.",
  posts: "Open the posts.",
  reach: "Open the posts, most views first.",
}

/** How many posts "What worked" ranks. */
const BEST_ROWS = 5

export type NumbersDashboardProps = {
  read: Read
  /** A tile or a "What worked" row asks for Table: what to show, and the `data-return` of what asked. */
  onOpenTable: (next: Partial<TableState>, returnTo: string) => void
  /** The `data-return` of what opened Table, refocused on the way back. */
  returnTo: string | null
}

export function NumbersDashboard({ read, onOpenTable, returnTo }: NumbersDashboardProps) {
  const [measure, setMeasure] = React.useState<Measure>("replies")
  // The trend draws only what can be read: "Came back" is not, yet.
  const charted = read.tiles.filter((t) => !t.notRead)
  const picked = charted.find((t) => t.measure === measure) ?? charted[0]!
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
    <>
      <div role="group" aria-label={`The last ${read.days} days against your usual`} className="grid grid-cols-2 gap-kit-related @[60rem]/kit-workspace:grid-cols-4">
        {read.tiles.map((t) => (
          <NumberTile key={t.measure} tile={t} inWindow={inWindow} days={read.days} onOpen={() => onOpenTable(TABLE_FOR[t.measure], `tile-${t.measure}`)} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-kit-related @[60rem]/kit-workspace:grid-cols-3">
        <NumbersPanel className="@[60rem]/kit-workspace:col-span-2">
          <NumbersPanel.Header>
            <NumbersPanel.Title>{`${picked.label} per week`}</NumbersPanel.Title>
            <NumbersPanel.Meta>
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
                <MenuRadioGroup value={picked.measure} onValueChange={(v) => setMeasure(v as Measure)}>
                  {charted.map((t) => (
                    <MenuRadioItem key={t.measure} value={t.measure}>
                      {t.label}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuPanel>
              </Menu>
            </NumbersPanel.Meta>
          </NumbersPanel.Header>
          <WeekChart
            key={picked.measure}
            label={`${picked.label} per week`}
            weeks={read.weeks.map((w, i) => ({ label: w.label, inWindow: w.inWindow, value: picked.weekly[i] ?? null }))}
            usual={usualPerWeek(picked, read.days)}
            format={picked.say}
          />
        </NumbersPanel>

        <PeoplePanel read={read} />

        <BestPanel read={read} onOpenPost={(id) => onOpenTable({ post: id, show: "all", order: "best" }, `row-${id}`)} />

        <QuincyPanel now={read.quincy.now} usual={read.quincy.usual} days={read.days} />
      </div>
    </>
  )
}

function NumberTile({ tile, inWindow, days, onOpen }: { tile: Tile; inWindow: boolean[]; days: number; onOpen: () => void }) {
  const group = tile.kind === "depth" ? "Depth" : "Volume"
  // Not read yet: said, never faked, and not a way in (there is nothing behind it).
  if (tile.notRead) {
    return (
      <StatTile>
        <StatTile.Label group={group}>{tile.label}</StatTile.Label>
        <StatTile.Value tone="muted">Not read yet</StatTile.Value>
        <StatTile.Against>{tile.notRead}</StatTile.Against>
        <StatTile.Spark />
      </StatTile>
    )
  }
  const sentence =
    tile.value === null
      ? "Nothing in this period."
      : tile.measure === "reach"
        ? againstMedianPost(tile.value, tile.baseline.usual)
        : againstUsual(tile.value, tile.baseline.usual, tile.unit, days)
  return (
    <StatTile onClick={onOpen} data-return={`tile-${tile.measure}`}>
      <StatTile.Label group={group}>{tile.label}</StatTile.Label>
      <StatTile.Value tone={tile.value === null ? "muted" : "ink"}>{tile.value === null ? "None" : tile.say(tile.value)}</StatTile.Value>
      <StatTile.Against>{sentence}</StatTile.Against>
      <StatTile.Spark>
        <Sparkline values={tile.weekly} emphasis={inWindow} usual={usualPerWeek(tile, days)} />
      </StatTile.Spark>
      <StatTile.Opens>{OPENS[tile.measure]}</StatTile.Opens>
    </StatTile>
  )
}

function PeoplePanel({ read }: { read: Read }) {
  const people = read.people
  return (
    <NumbersPanel>
      <NumbersPanel.Header>
        <NumbersPanel.Title>People who keep showing up</NumbersPanel.Title>
        {people ? <NumbersPanel.Meta>{`${people.length} replied`}</NumbersPanel.Meta> : null}
      </NumbersPanel.Header>
      {people === null ? (
        <p className="text-kit-dense text-pretty text-kit-ink-muted">
          Not read yet. I count the replies under each post, but I don&apos;t read who wrote them, so I can&apos;t tell you who keeps coming back.
        </p>
      ) : people.length === 0 ? (
        <p className="text-kit-dense text-kit-ink-muted">Nobody replied in this period.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {people.slice(0, 6).map(({ person, inWindow, before, weeks }) => (
            <li key={person.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-kit-chip px-2 py-1.5">
              <Avatar
                initials={person.name
                  .split(" ")
                  .map((s) => s[0])
                  .join("")}
              />
              <span className="min-w-0">
                <span className="block truncate text-kit-dense text-kit-ink">
                  {person.name} <span className="text-kit-ink-muted">@{person.handle}</span>
                </span>
                <span className="block text-kit-meta text-pretty text-kit-ink-muted tabular-nums">
                  {inWindow} {inWindow === 1 ? "reply" : "replies"} now{before ? `, ${before} before` : ", new"}
                  {person.answered ? "" : ". Not answered"}
                </span>
              </span>
              <span>
                <WeekDots weeks={weeks} />
                <span className="sr-only">Replied in {weeks.filter(Boolean).length} of the last 8 weeks.</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </NumbersPanel>
  )
}

function BestPanel({ read, onOpenPost }: { read: Read; onOpenPost: (id: string) => void }) {
  const rows = [...read.scored].sort((a, b) => b.post.views - a.post.views).slice(0, BEST_ROWS)
  return (
    <NumbersPanel className="@[60rem]/kit-workspace:col-span-2">
      <NumbersPanel.Header>
        <NumbersPanel.Title>What worked</NumbersPanel.Title>
        <NumbersPanel.Meta>{read.medianViews === null ? "No median yet" : `Your median post: ${fmt(read.medianViews)} views`}</NumbersPanel.Meta>
      </NumbersPanel.Header>
      {rows.length === 0 ? (
        <p className="text-kit-dense text-kit-ink-muted">Nothing went out in the last {read.days} days.</p>
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,9rem)_4rem] gap-x-kit-related pb-1 @[40rem]/kit-workspace:grid-cols-[minmax(0,1fr)_minmax(7rem,12rem)_4rem_4rem]">
            <span className="text-kit-meta text-kit-ink-muted">Post</span>
            <MultipleScale />
            <span className="text-end text-kit-meta whitespace-nowrap text-kit-ink-muted">{read.medianViews === null ? "Views" : "× median"}</span>
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
                    onClick={() => onOpenPost(post.id)}
                    aria-label={`${post.hook}. ${fmt(post.views)} views${multiple ? `, ${formatMultiple(multiple)} your median` : ""}, ${post.replies} ${post.replies === 1 ? "reply" : "replies"}. Open it.`}
                    className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_minmax(5rem,9rem)_4rem] items-center pointer-coarse:min-h-11 gap-x-kit-related rounded-kit-chip px-2 py-1.5 text-start outline-hidden transition-[background-color] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-kit-focus motion-reduce:transition-none @[40rem]/kit-workspace:grid-cols-[minmax(0,1fr)_minmax(7rem,12rem)_4rem_4rem]"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-kit-dense text-kit-ink">{post.hook}</span>
                      {beats ? <span className="shrink-0 text-kit-meta text-kit-ink-muted">3 beats</span> : null}
                    </span>
                    <MultipleBar multiple={multiple} />
                    <span className="text-end font-kit-mono text-kit-mono-sm text-kit-ink tabular-nums">{multiple === null ? fmt(post.views) : formatMultiple(multiple)}</span>
                    <span className="hidden text-end font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums @[40rem]/kit-workspace:block">{post.replies}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </NumbersPanel>
  )
}

function QuincyPanel({ now, usual, days }: { now: QuincyWeek; usual: QuincyWeek | null; days: number }) {
  const rows: { term: string; value: string; usual: string | null }[] = [
    { term: "Read", value: `${fmt(now.read)} saved posts`, usual: usual ? roundUsual(usual.read) : null },
    { term: "Drafted", value: fmt(now.drafted), usual: usual ? roundUsual(usual.drafted) : null },
    { term: "You approved", value: fmt(now.approved), usual: usual ? roundUsual(usual.approved) : null },
    { term: "Went out", value: fmt(now.posted), usual: usual ? roundUsual(usual.posted) : null },
    { term: "Cost", value: dollars(now.costMicros), usual: usual ? dollars(usual.costMicros) : null },
  ]
  return (
    <NumbersPanel>
      <NumbersPanel.Header>
        <NumbersPanel.Title>What I did</NumbersPanel.Title>
        <NumbersPanel.Meta>{`Last ${days} days`}</NumbersPanel.Meta>
      </NumbersPanel.Header>
      <dl className="flex flex-col">
        {rows.map((r) => (
          <div key={r.term} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-kit-related border-b border-kit-hairline py-1.5 last:border-b-0">
            <dt className="text-kit-dense text-kit-ink-muted">{r.term}</dt>
            <dd className="text-end text-kit-dense text-kit-ink tabular-nums">
              {r.value}
              <span className="ms-2 text-kit-meta text-kit-ink-muted">{r.usual === null ? `needs ${MIN_WEEKS} wk` : `usually ${r.usual}`}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-kit-meta text-pretty text-kit-ink-muted">
        {now.drafted > 0 ? `You approved ${now.approved} of ${now.drafted} drafts. ` : ""}I draft, you send: nothing went out without you.
      </p>
    </NumbersPanel>
  )
}
