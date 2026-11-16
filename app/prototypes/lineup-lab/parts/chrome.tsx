"use client"

import * as React from "react"
import { Calendar03Icon, Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"

import {
  Button,
  ButtonLink,
  Count,
  Dialog,
  DialogPanel,
  EmptyRegion,
  EmptyState,
  Field,
  FilterMenu,
  FootBar,
  IconButton,
  KeyBar,
  Select,
  TimeInput,
  Toolbar,
  ToolbarGroup,
  ToolbarTitle,
  useAnnounce,
  type KeyBarItem,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

import { BASELINE, CHANNEL_LABEL, WEEKDAY_LONG, type Channel } from "../data"
import { slotLabel, sortedSlots, type ChannelFilter, type LineupStore, type ShowFilter } from "../use-lineup"

/** The keys every layout binds (parts/keys.ts). Board adds h / l. */
export const KEYS: readonly KeyBarItem[] = [
  { keys: ["j", "k"], label: "Move" },
  { keys: ["⇧J", "⇧K"], label: "Later, earlier" },
  { keys: ["M"], label: "Move to…" },
  { keys: ["P"], label: "Post now" },
  { keys: ["B"], label: "Back to Drafts" },
  { keys: ["U"], label: "Undo" },
  { keys: ["S"], label: "Slots" },
]

export const BOARD_KEYS: readonly KeyBarItem[] = [
  { keys: ["j", "k"], label: "Move" },
  { keys: ["h", "l"], label: "Day" },
  { keys: ["⇧H", "⇧L"], label: "Post a day" },
  { keys: ["⇧J", "⇧K"], label: "Later, earlier" },
  { keys: ["P"], label: "Post now" },
  { keys: ["B"], label: "Back to Drafts" },
  { keys: ["U"], label: "Undo" },
  { keys: ["S"], label: "Slots" },
]

/**
 * The page's one sentence of numbers: what goes out this week, against the
 * person's own usual week (BASELINE: the median of the weeks they posted),
 * then what still asks something of them. Never a follower count, never a
 * tile.
 */
export function Summary({ store }: { store: LineupStore }) {
  const s = store.summary
  if (store.nothingAtAll || store.phase === "loading") return null
  return (
    <p className="hidden truncate text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block">
      <Count value={s.goingThisWeek} /> {s.goingThisWeek === 1 ? "post" : "posts"} this week; you usually post {s.baseline}.
      {s.openAhead > 0 ? (
        <>
          {" "}
          <Count value={s.openAhead} /> {s.openAhead === 1 ? "slot is" : "slots are"} open.
        </>
      ) : s.slots > 0 ? (
        " Every slot is taken."
      ) : null}
      {s.failed > 0 ? (
        <>
          {" "}
          <Count value={s.failed} /> didn&apos;t go.
        </>
      ) : null}
      {s.waiting > 0 ? (
        <>
          {" "}
          <Count value={s.waiting} /> approved with no time.
        </>
      ) : null}
    </p>
  )
}

export function LineupToolbar({ store, children }: { store: LineupStore; children?: React.ReactNode }) {
  return (
    <Toolbar label="Lineup" divided={false}>
      <div className="flex min-w-0 items-baseline gap-kit-related">
        <ToolbarTitle>Lineup</ToolbarTitle>
        <Summary store={store} />
      </div>
      {store.nothingAtAll ? null : (
        <ToolbarGroup end>
          {children}
          <Button size="sm" variant="ghost" icon={Calendar03Icon} shortcut="S" onClick={() => store.setRhythmOpen(true)}>
            Slots
          </Button>
        </ToolbarGroup>
      )}
      <RhythmDialog store={store} />
    </Toolbar>
  )
}

export function LineupFilters({ store, end, channel = true }: { store: LineupStore; end?: React.ReactNode; channel?: boolean }) {
  const f = store.filters
  const count = (c: ChannelFilter, s: ShowFilter) =>
    store.items.length === 0 && store.posts.length === 0
      ? 0
      : [...store.posts.map((p) => ({ ch: p.channel, settled: p.state === "published" })), ...store.openSlots.map((o) => ({ ch: o.slot.channel, settled: o.passed })), ...store.stranded.map((x) => ({ ch: x.channel, settled: false }))].filter(
          (r) => (c === "all" || r.ch === c) && (s === "all" || !r.settled)
        ).length
  return (
    <Toolbar label="Filters" size="filter">
      <ToolbarGroup>
        {channel ? (
          <FilterMenu<ChannelFilter>
            label="Channel"
            value={f.channel}
            options={[
              { value: "all", label: "Every channel", count: count("all", f.show) },
              ...store.connected.map((c) => ({ value: c, label: CHANNEL_LABEL[c], count: count(c, f.show) })),
            ]}
            onValueChange={(v) => store.setFilter("channel", v)}
          />
        ) : null}
        <FilterMenu<ShowFilter>
          label="Show"
          value={f.show}
          options={[
            { value: "all", label: "The whole week", count: count(f.channel, "all") },
            { value: "ahead", label: "Still to go", count: count(f.channel, "ahead") },
          ]}
          onValueChange={(v) => store.setFilter("show", v)}
        />
        {f.channel !== "all" || f.show !== "all" ? (
          <Button size="xs" variant="ghost" onClick={store.clearFilters}>
            Clear
          </Button>
        ) : null}
      </ToolbarGroup>
      <ToolbarGroup end>{end}</ToolbarGroup>
    </Toolbar>
  )
}

/** The KeyBar, or the note after an action in its place: the same 36px, so nothing moves. */
export function LineupFoot({ store, keys = KEYS }: { store: LineupStore; keys?: readonly KeyBarItem[] }) {
  const n = store.notice
  const { dismissNotice } = store
  const announce = useAnnounce()
  React.useEffect(() => {
    if (!n) return
    announce(n.undo ? `${n.text} Press U to undo.` : n.text)
    const t = setTimeout(dismissNotice, 7000)
    return () => clearTimeout(t)
  }, [n, announce, dismissNotice])
  if (!n) return <KeyBar keys={keys} />
  return (
    <FootBar>
      <p className="min-w-0 flex-1 truncate text-kit-meta text-kit-ink-muted">{n.text}</p>
      {n.undo && store.canUndo ? (
        <Button size="xs" variant="ghost" shortcut="U" onClick={() => store.undo()}>
          Undo
        </Button>
      ) : null}
    </FootBar>
  )
}

/**
 * The rhythm: every standing slot, and a row to add one (`createSlot`,
 * `deleteSlot`). A weekday and a time, never a date: a commitment that
 * recurs is what lets an empty Wednesday read as a slot going to waste.
 * Removing one keeps whatever is in it at its time, as a one-off, so it is
 * a plain control, not a hold.
 */
export function RhythmDialog({ store }: { store: LineupStore }) {
  const [channel, setChannel] = React.useState<Channel>(store.connected[0] ?? "x")
  const [weekday, setWeekday] = React.useState("3")
  const [time, setTime] = React.useState("08:00")
  const slots = sortedSlots(store.slots)
  const dupe = store.slots.some((s) => s.channel === channel && s.weekday === Number(weekday) && s.time === time)
  return (
    <Dialog open={store.rhythmOpen} onOpenChange={store.setRhythmOpen}>
      <DialogPanel
        title="Your slots"
        description={`A slot is a time you publish every week. Approve a draft and it takes the next free one. You usually post ${BASELINE.perWeek} a week.`}
      >
        <div className="flex flex-col gap-kit-group">
          {slots.length > 0 ? (
            <ul className="flex flex-col gap-px">
              {slots.map((s) => (
                <li key={s.id} className="flex min-h-9 items-center gap-3 rounded-kit-control px-3">
                  <span className="w-28 text-kit-dense text-kit-ink">{`${WEEKDAY_LONG[s.weekday - 1]}`}</span>
                  <span className="font-kit-mono text-kit-mono-sm text-kit-ink tabular-nums">{s.time}</span>
                  <span className="flex-1 text-kit-meta text-kit-ink-muted">{CHANNEL_LABEL[s.channel]}</span>
                  <IconButton icon={Delete02Icon} aria-label={`Remove ${slotLabel(s)} on ${CHANNEL_LABEL[s.channel]}`} onClick={() => store.deleteSlot(s.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-kit-dense text-kit-ink-muted">No slots yet.</p>
          )}
          <form
            className="flex flex-col gap-kit-related"
            onSubmit={(e) => {
              e.preventDefault()
              if (!dupe) store.addSlot(channel, Number(weekday), time)
            }}
          >
            <div className="flex flex-col gap-kit-related">
              <Field label="Day">
                <Select value={weekday} onValueChange={(v) => v && setWeekday(v)} options={WEEKDAY_LONG.map((d, i) => ({ value: String(i + 1), label: d }))} />
              </Field>
              <Field label="Time">
                <TimeInput value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <Field label="Channel">
                <Select value={channel} onValueChange={(v) => v && setChannel(v)} options={store.connected.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />
              </Field>
            </div>
            <div className="flex items-center gap-kit-controls">
              <Button type="submit" size="sm" icon={PlusSignIcon} disabled={dupe}>
                Add the slot
              </Button>
              {dupe ? <span className="text-kit-meta text-kit-ink-muted">You already have that one.</span> : null}
            </div>
          </form>
        </div>
      </DialogPanel>
    </Dialog>
  )
}

/** No slots and nothing scheduled: the first run. The rhythm is proposed in words, then taken in one press. */
export function FirstRun({ store }: { store: LineupStore }) {
  return (
    <EmptyRegion edge="rule">
      <EmptyState
        frame="none"
        media={<Friend size={48} state="resting" className="text-kit-ink" />}
        bold="No rhythm yet."
        rest={`A slot is a time you publish every week. Approve a draft and it takes the next free slot, then goes out on its own. I'd start you on Tuesday and Thursday at 08:00 on ${store.connected.map((c) => CHANNEL_LABEL[c]).join(" and ")}.`}
        baseline={`You usually post ${BASELINE.perWeek} a week.`}
      >
        <Button variant="action" onClick={store.takeStarter}>
          Start with this rhythm
        </Button>
        <Button onClick={() => store.setRhythmOpen(true)}>Pick your own</Button>
      </EmptyState>
    </EmptyRegion>
  )
}

/** A rhythm, and nothing queued in it this week. Said where the list would be. */
export function NothingQueued() {
  return (
    <EmptyState
      frame="none"
      media={<Friend size={40} state="waiting" className="text-kit-ink" />}
      bold="Nothing queued this week."
      rest="Approve a draft and it takes the next open slot."
    >
      <ButtonLink href="/drafts" size="sm">
        Open Drafts
      </ButtonLink>
    </EmptyState>
  )
}

/** A filter left nothing. */
export function FilteredEmpty({ store }: { store: LineupStore }) {
  return (
    <EmptyState frame="none" media={<Friend size={40} state="reading" className="text-kit-ink" />} bold="Nothing here with these filters." rest="Clear them to see the whole week.">
      <Button size="xs" onClick={store.clearFilters}>
        Clear filters
      </Button>
    </EmptyState>
  )
}

/** The pane with nothing open in it. */
export function NothingOpen() {
  return (
    <div className="flex flex-col gap-kit-tight">
      <p className="text-kit-dense font-kit-strong text-kit-ink">Nothing open.</p>
      <p className="text-kit-dense text-pretty text-kit-ink-muted">Pick a post or a slot, or press j.</p>
    </div>
  )
}

export function Loading({ label = "Loading the week" }: { label?: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  )
}
