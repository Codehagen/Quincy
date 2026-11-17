"use client"

import * as React from "react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import {
  Button,
  ButtonLink,
  Count,
  EmptyRegion,
  EmptyState,
  FilterMenu,
  FootBar,
  IconButton,
  KeyBar,
  Switch,
  Toolbar,
  ToolbarGroup,
  ToolbarTitle,
  useAnnounce,
  type KeyBarItem,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { starterRhythmLabel } from "@/lib/slots"

import { weekRangeLabel } from "@/components/kit/week-calendar-math"

import { matches, type ChannelFilter, type ShowFilter } from "./lineup-model"
import { CHANNEL_LABELS, SlotComposer } from "./slot-composer"
import type { LineupStore } from "./use-lineup"

/**
 * The page's frame: the toolbar with its one sentence of numbers and the
 * Slots dialog, the filter row, the foot (the keys, or the note after an
 * action in their place), and the first run.
 */

/**
 * The one sentence of numbers: what this week holds, then what still asks
 * something of you. Never a follower count, never a tile.
 *
 * `baseline` is the seam for "you usually post 3" (DECISION.md, proposed 4):
 * the median of the person's weeks with a post. Nothing computes it yet, so
 * the page passes none and the sentence says the week alone.
 */
export function Summary({ store, baseline }: { store: LineupStore; baseline?: number }) {
  const s = store.summary
  if (store.nothingAtAll) return null
  const thisWeek = store.week.week === store.week.thisWeek
  return (
    <p className="hidden truncate text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block">
      <Count value={s.going} /> {s.going === 1 ? "post" : "posts"} {thisWeek ? "this week" : "that week"}
      {baseline != null ? `; you usually post ${baseline}` : ""}.
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
          <Count value={s.failed} /> didn’t go.
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

export function LineupToolbar({ store }: { store: LineupStore }) {
  return (
    <Toolbar label="Lineup" divided={false}>
      <div className="flex min-w-0 items-baseline gap-kit-related">
        <ToolbarTitle>Lineup</ToolbarTitle>
        <Summary store={store} />
      </div>
      {store.nothingAtAll ? null : (
        <ToolbarGroup end>
          <SlotComposer
            existing={store.week.slots}
            connected={store.connected}
            timezone={store.timezone}
            open={store.slotsOpen}
            onOpenChange={store.setSlotsOpen}
            shortcut="S"
          />
        </ToolbarGroup>
      )}
    </Toolbar>
  )
}

/**
 * Quincy’s handwritten notes on the week: on by default, a per-viewer choice
 * kept in this browser. Read as an external store, so the client's answer is
 * there before the workspace is shown (it stays hidden until its first
 * measure); a refused storage (a private window) leaves the notes on.
 */
const NOTES_KEY = "lineup:notes"
const notesListeners = new Set<() => void>()
function readNotes() {
  try {
    return window.localStorage.getItem(NOTES_KEY) !== "off"
  } catch {
    return true
  }
}
function subscribeNotes(listener: () => void) {
  notesListeners.add(listener)
  return () => {
    notesListeners.delete(listener)
  }
}

export function useNotesSetting() {
  const on = React.useSyncExternalStore(subscribeNotes, readNotes, () => true)
  const set = React.useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(NOTES_KEY, next ? "on" : "off")
    } catch {
      // Nothing to keep it in: the choice is lost on reload.
    }
    for (const l of notesListeners) l()
  }, [])
  return [on, set] as const
}

export function LineupFilters({ store, end, channel = true, notes }: { store: LineupStore; end?: React.ReactNode; channel?: boolean; notes?: { on: boolean; set: (on: boolean) => void } }) {
  const f = store.filters
  const count = (c: ChannelFilter, s: ShowFilter) => store.allItems.filter((i) => matches(i, { channel: c, show: s })).length
  const channels = [...new Set([...store.connected, ...store.week.slots.map((s) => s.channel), ...store.week.posts.map((p) => p.channel)])]
  return (
    <Toolbar label="Filters" size="filter">
      <ToolbarGroup>
        {channel && channels.length > 1 ? (
          <FilterMenu<ChannelFilter>
            label="Channel"
            value={f.channel}
            options={[{ value: "all", label: "Every channel", count: count("all", f.show) }, ...channels.map((c) => ({ value: c, label: CHANNEL_LABELS[c] ?? c, count: count(c, f.show) }))]}
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
        {notes ? <NotesSwitch on={notes.on} set={notes.set} /> : null}
      </ToolbarGroup>
      <ToolbarGroup end>{end}</ToolbarGroup>
    </Toolbar>
  )
}

/** The notes control, set in the filter row's meta size so it does not outweigh the chips beside it. */
function NotesSwitch({ on, set }: { on: boolean; set: (on: boolean) => void }) {
  const id = React.useId()
  return (
    <span className="flex items-center gap-2">
      <span id={id} className="text-kit-meta text-kit-ink-muted">
        Quincy’s notes
      </span>
      <Switch aria-labelledby={id} checked={on} onCheckedChange={set} />
    </span>
  )
}

/** The KeyBar, or the note after an action in its place: the same height, so nothing moves. */
export function LineupFoot({ store, keys }: { store: LineupStore; keys: readonly KeyBarItem[] }) {
  const n = store.notice
  const { dismissNotice } = store
  const announce = useAnnounce()
  React.useEffect(() => {
    if (!n) return
    // A note that offers undo arrives with the move it undoes.
    announce(n.undo ? `${n.text} Press U to undo.` : n.text)
    const t = setTimeout(dismissNotice, 8000)
    return () => clearTimeout(t)
  }, [n, announce, dismissNotice])
  if (!n) return <KeyBar keys={keys} />
  return (
    <FootBar>
      <p className="min-w-0 flex-1 truncate text-kit-meta text-kit-ink-muted">{n.text}</p>
      {n.undo && store.canUndo ? (
        <Button size="xs" variant="ghost" shortcut="U" onClick={store.undo}>
          Undo
        </Button>
      ) : null}
      {n.drafts ? (
        <ButtonLink href="/drafts" size="xs">
          Open Drafts
        </ButtonLink>
      ) : null}
    </FootBar>
  )
}

/**
 * No slots and nothing scheduled: the first run. The rhythm is proposed in
 * words, then taken in one press (`applyStarterRhythm`). With nothing
 * connected there is no honest default, so the dialog is all there is.
 */
export function FirstRun({ store }: { store: LineupStore }) {
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const labels = store.connected.map((c) => CHANNEL_LABELS[c] ?? c)
  const on = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : labels[0]
  const take = async () => {
    setSaving(true)
    setError(null)
    try {
      await store.takeStarter()
    } catch (cause) {
      console.error(cause)
      setError("Could not set it up. Nothing changed. Try again.")
    } finally {
      setSaving(false)
    }
  }
  return (
    <EmptyRegion edge="rule">
      <EmptyState
        frame="none"
        media={<Friend size={48} state="resting" className="text-kit-ink" />}
        bold="No rhythm yet."
        rest={
          store.connected.length > 0
            ? `A slot is a time you publish every week. Approve a draft and it takes the next free slot, then goes out on its own. I’d start you on ${starterRhythmLabel()} on ${on}.`
            : "A slot is a time you publish every week, like Monday at 08:00 on LinkedIn. Approve a draft and it takes the next free slot, then goes out on its own."
        }
      >
        {store.connected.length > 0 ? (
          <Button variant="action" pending={saving} pendingLabel="Setting it up…" onClick={() => void take()}>
            Start with this rhythm
          </Button>
        ) : null}
        <SlotComposer
          existing={[]}
          connected={store.connected}
          timezone={store.timezone}
          label={store.connected.length > 0 ? "Pick your own" : "Add your first slot"}
          primary={store.connected.length === 0}
          open={store.slotsOpen}
          onOpenChange={store.setSlotsOpen}
        />
        {error ? (
          <p role="alert" className="text-kit-meta text-kit-ink">
            {error}
          </p>
        ) : null}
      </EmptyState>
    </EmptyRegion>
  )
}

/** The pane with nothing open in it. */
export function NothingOpen() {
  return (
    <div className="flex flex-col gap-kit-tight">
      <p className="text-kit-dense font-kit-strong text-kit-ink">Nothing open.</p>
      <p className="text-kit-dense text-pretty text-kit-ink-muted">Pick a post or a slot on the week, or press j.</p>
    </div>
  )
}

/**
 * The week switcher: the range, the week before, back to this week, the
 * week after. Each is a new read on the server (`?week=`); the calendar
 * slides from the side the week came from once it arrives.
 */
export function WeekSwitch({ store }: { store: LineupStore }) {
  const announce = useAnnounce()
  const thisWeek = store.week.week === store.week.thisWeek
  const go = (by: -1 | 0 | 1) => {
    store.goWeek(by)
    announce(by === 0 ? "This week." : by < 0 ? "The week before." : "The week after.")
  }
  return (
    <div className="flex items-center gap-1" aria-busy={store.weekPending || undefined}>
      <span className="me-1 hidden font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums @[52rem]/kit-workspace:inline">{weekRangeLabel(store.days)}</span>
      <IconButton icon={ArrowLeft01Icon} aria-label="The week before" onClick={() => go(-1)} />
      <Button size="xs" variant="ghost" disabled={thisWeek} onClick={() => go(0)}>
        This week
      </Button>
      <IconButton icon={ArrowRight01Icon} aria-label="The week after" onClick={() => go(1)} />
    </div>
  )
}
