"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Button,
  ButtonLink,
  Card,
  DateTimePicker,
  EmptyState,
  List,
  ListHeading,
  Reorderable,
  SourceMark,
  Text,
  type DateTimeValue,
} from "@/components/kit"
import { ScheduledPost, SlotCell, type SlotTiming } from "@/components/quincy"
import { Friend } from "@/components/mascot"

import { applyStarterRhythm } from "@/app/(app)/lineup/actions"
import { starterRhythmLabel } from "@/lib/slots"

import { CHANNEL_LABELS, SlotComposer } from "./slot-composer"

import type { Day, Entry, Slot } from "@/lib/lineup"

/** Where a move can land: a standing slot, or a bare day-and-time. */
export type MoveTarget =
  | { kind: "slot"; slotId: string }
  | { kind: "day"; dayId: string; time: string }

/**
 * The pieces the Lineup is built from, on the kit (plans/029, 2026-11-16).
 *
 * The rules that shaped them survive from the version before the kit:
 *
 * - **Time is the anchor.** Tabular, so a column of times reads as one.
 * - **The opening line, not the post.** You come here to judge timing and
 *   order, not to re-read writing you already approved on Drafts.
 * - **Published recedes and stays.** It is history, and a queue whose items
 *   vanish once they happen gives you no way to see what actually went out.
 *
 * What is new is the week as one running order (`WeekOrder`): the posts that
 * are still yours to move, in the order they go out. The day and time belong
 * to the position, not the post — drag the Thursday post above the Tuesday one
 * and it takes Tuesday's day and time, and Tuesday's post takes Thursday's.
 */

/** Where a post sits in the week: the day, the time, and the slot it fills. */
export type Position = {
  dayId: string
  dayLabel: string
  time: string
  slotId: string | null
}

/**
 * The week's queued posts, in the order they go out.
 *
 * Rows hold no control: a Reorderable row is a sortable option, and a button
 * inside it would fight the row for Space and Enter. So the row is picked by
 * focus — click it, or arrow to it — and the post's own controls (a new time,
 * Back to Drafts) open under the list, the way a list and its detail share a
 * Stage on every kit page (docs/design/page.md).
 */
export function WeekOrder({
  entries,
  positions,
  pickedId,
  onPick,
  onReorder,
  disabled = false,
}: {
  entries: Entry[]
  positions: Position[]
  pickedId: string | null
  onPick: (id: string) => void
  onReorder: (next: Entry[]) => void
  /** A move is being saved: no second drag until it settles. */
  disabled?: boolean
}) {
  return (
    <List width="full">
      <Reorderable
        aria-label="This week's posts, in the order they go out"
        items={entries}
        itemKey={(e) => e.id}
        itemLabel={(e) => `${e.opening}, ${e.channelLabel}`}
        onReorder={onReorder}
        disabled={disabled}
        // Focus is the pick: a click or the arrow keys. The picked row takes
        // the selected grey, and its controls open under the list.
        activeKey={pickedId}
        onActiveChange={onPick}
        // The day and time belong to the position, so a move is announced
        // with where the post now goes out, not just its number.
        describePosition={(position) => {
          const at = positions[position - 1]
          return at ? `${at.dayLabel} ${at.time}` : undefined
        }}
      >
        {(entry, { position }) => {
          const at = positions[position - 1]
          return (
            <>
              <span className="flex min-w-0 flex-1 cursor-pointer flex-col">
                <span className="truncate font-kit-strong">
                  {entry.opening}
                </span>
                {/* The slot mark: it belongs to the position, so it stands
                    still while the posts slide under it. */}
                <span
                  data-reorder-slot=""
                  className="text-kit-small text-kit-ink-muted tabular-nums"
                >
                  {at ? `${at.dayLabel} · ${at.time}` : null}
                </span>
              </span>
              <span className="hidden shrink-0 sm:inline-flex">
                <SourceMark id={entry.channel} label={entry.channelLabel} />
              </span>
            </>
          )
        }}
      </Reorderable>
    </List>
  )
}

/**
 * The picked post: when it goes out, and the way back to Drafts.
 *
 * `ScheduledPost` heads it, so the quick moves (an open slot on its channel,
 * the same time tomorrow) stay one menu away on the time itself. The picker
 * under it is for any other day and time — the "Pick a time…" that the old
 * menu carried disabled, marked "not built".
 */
export function PostDetail({
  entry,
  dayId,
  openSlots,
  nextDay,
  times,
  taken,
  today,
  timeZone,
  onMove,
  onUnschedule,
}: {
  entry: Entry
  /** The day the post sits on now, `YYYY-MM-DD`. */
  dayId: string
  openSlots: Slot[]
  nextDay?: Day
  /** Every time the person posts at, for the picker. */
  times: string[]
  taken: Record<string, string[]>
  /** Today in the account's zone, `YYYY-MM-DD`. */
  today: string
  /** The account's zone: a time today has passed by its clock, not the browser's. */
  timeZone: string
  onMove: (target: MoveTarget) => void
  onUnschedule: () => Promise<void>
}) {
  const hintId = React.useId()
  const value: DateTimeValue = { date: dayId, time: entry.time }
  const [sending, setSending] = React.useState(false)
  const [refused, setRefused] = React.useState<string | null>(null)

  async function sendBack() {
    setSending(true)
    setRefused(null)
    try {
      await onUnschedule()
    } catch (error) {
      console.error(error)
      setRefused("Could not send it back to Drafts. Nothing changed. Try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <Card width="full">
      <div className="flex flex-col gap-kit-group">
        <div className="-mx-3 -my-2">
          <ScheduledPost
            entry={entry}
            openSlots={openSlots}
            nextDay={nextDay}
            onMove={onMove}
          />
        </div>

        <DateTimePicker
          label="Give it a time"
          times={times}
          taken={taken}
          min={today}
          today={today}
          timeZone={timeZone}
          value={value}
          onValueChange={(next) => {
            if (!next) return
            if (next.date === value.date && next.time === value.time) return
            onMove({ kind: "day", dayId: next.date, time: next.time })
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-kit-related">
          <Text id={hintId} variant="small" tone="muted">
            Back to Drafts keeps it approved. It waits there for a new time.
          </Text>
          {/* A plain control, not a hold: only the time is given up. The
              version stays approved on Drafts (`unschedulePost`), the same
              reasoning the time's own menu uses (ScheduledPost). */}
          <Button
            aria-describedby={hintId}
            pending={sending}
            pendingLabel="Sending it back…"
            onClick={() => void sendBack()}
          >
            Back to Drafts
          </Button>
        </div>
        {/* Ink, not red: a refusal is not destruction (docs/design/states.md). */}
        {refused ? (
          <Text role="alert" variant="small">
            {refused}
          </Text>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * The open slots this week, and the one that is picked.
 *
 * "Nothing goes out Wednesday" is a fact you can do nothing with; "your
 * Wednesday 12:00 LinkedIn slot is open" is the same week with an obvious next
 * step. What fills a slot is approving a draft, so the detail says that and
 * links there — and offers the posts already queued on that channel, which can
 * move in now.
 */
export function OpenSlots({
  slots,
  timingOf,
  pickedId,
  onPick,
  movable,
  onMove,
}: {
  slots: Slot[]
  timingOf: (slot: Slot) => SlotTiming
  pickedId: string | null
  onPick: (id: string) => void
  /** Queued posts, so a picked slot can offer the ones on its channel. */
  movable: Entry[]
  onMove: (entry: Entry, target: MoveTarget) => void
}) {
  const picked = slots.find((s) => s.id === pickedId) ?? null
  // A slot whose time has passed today offers no moves: a post moved into it
  // would go out at once, inside the sweep's catch-up window.
  const candidates =
    picked && timingOf(picked) !== "past"
      ? movable.filter((e) => e.channel === picked.channel).slice(0, 3)
      : []

  return (
    <>
      <List width="full">
        {slots.map((slot) => (
          <SlotCell
            key={slot.id}
            slot={slot}
            timing={timingOf(slot)}
            selected={slot.id === pickedId}
            onSelect={() => onPick(slot.id)}
          />
        ))}
      </List>

      {picked ? (
        <Card key={picked.id} width="full">
          <div className="flex flex-col gap-kit-group">
            <div className="flex flex-col gap-kit-tight">
              <Text weight="strong">
                {picked.label} on {picked.channelLabel} is open.
              </Text>
              <Text tone="muted">
                Approve a {picked.channelLabel} draft and it takes this slot.
                {candidates.length > 0
                  ? " Or move a post you already queued."
                  : null}
              </Text>
            </div>
            <div className="flex flex-wrap gap-kit-controls">
              <ButtonLink href="/drafts">Approve a draft</ButtonLink>
              {candidates.map((entry) => (
                // The visible words are the name (WCAG 2.5.3, label in
                // name); which post it is rides along as the description.
                <React.Fragment key={entry.id}>
                  <span id={`move-${picked.id}-${entry.id}`} hidden>
                    {`"${entry.opening}", ${entry.channelLabel}`}
                  </span>
                  <Button
                    aria-describedby={`move-${picked.id}-${entry.id}`}
                    onClick={() =>
                      onMove(entry, { kind: "slot", slotId: picked.id })
                    }
                  >
                    {`Move the ${entry.time} post here`}
                  </Button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  )
}

/**
 * What the sweep has already taken: sent, sending, or not sent.
 *
 * Its time is a record now, not a plan, so `ScheduledPost` shows it as plain
 * Mono. A post that did not go out gets one way back, Back to Drafts, on its
 * time: moving it would not help, because the sweep only ever looks at
 * `queued`. A `sending` post says its own caution under the row
 * (ScheduledPost's `note`).
 */
export function Settled({
  days,
  onUnschedule,
}: {
  days: Day[]
  onUnschedule: (entry: Entry) => Promise<void>
}) {
  const [refused, setRefused] = React.useState<string | null>(null)
  const withRows = days
    .map((day) => ({
      day,
      entries: day.entries.filter((e) => e.state !== "queued"),
    }))
    .filter((d) => d.entries.length > 0)

  return (
    <>
      <List width="full">
        {withRows.map(({ day, entries }) => (
          <React.Fragment key={day.id}>
            <ListHeading>{day.label}</ListHeading>
            {entries.map((entry) =>
              entry.state === "failed" ? (
                <ScheduledPost
                  key={entry.id}
                  entry={entry}
                  note="Open its time to send it back to Drafts. It stays approved."
                  onUnschedule={async () => {
                    setRefused(null)
                    try {
                      await onUnschedule(entry)
                    } catch (error) {
                      console.error(error)
                      setRefused(
                        `Could not send "${entry.opening}" back to Drafts. Nothing changed. Try again.`
                      )
                    }
                  }}
                />
              ) : (
                <ScheduledPost key={entry.id} entry={entry} />
              )
            )}
          </React.Fragment>
        ))}
      </List>

      {/* Ink, not red: a refusal is not destruction (docs/design/states.md). */}
      {refused ? (
        <Text role="alert" variant="small">
          {refused}
        </Text>
      ) : null}
    </>
  )
}

/**
 * The first-run screen: no slots and nothing scheduled.
 *
 * Three sentences in the order the product runs, each naming a thing you can
 * see on screen. The one-press rhythm comes first when there is a channel to
 * put it on; with nothing connected there is no honest default to offer, so
 * the form is all there is.
 */
export function NoLineup({
  timezone,
  connected = [],
}: {
  timezone: string
  connected?: string[]
}) {
  const labels = connected.map((c) => CHANNEL_LABELS[c] ?? c)
  const on =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
      : labels[0]

  return (
    <EmptyState
      media={<Friend size={40} state="idle" className="text-kit-ink" />}
      bold="No rhythm yet."
      rest={
        connected.length > 0
          ? `A slot is a time you publish every week. Approve a draft and it takes the next free slot, then goes out on its own. I'd start you on ${starterRhythmLabel()} on ${on}.`
          : "A slot is a time you publish every week, like Monday at 08:00 on LinkedIn. Approve a draft and it takes the next free slot, then goes out on its own."
      }
    >
      {connected.length > 0 ? (
        <>
          <StarterRhythm connected={connected} />
          <SlotComposer
            existing={[]}
            timezone={timezone}
            connected={connected}
            label="Pick your own"
          />
        </>
      ) : (
        <SlotComposer
          timezone={timezone}
          connected={connected}
          label="Add your first slot"
          primary
        />
      )}
    </EmptyState>
  )
}

/**
 * Take the starting rhythm.
 *
 * **The proposal is on the screen, not behind the button.** The days, the
 * time and the channels are spelled out in the sentence above the press, and
 * every row it writes is listed and removable in the Slots dialog.
 *
 * Not optimistic: these rows change which days have anything in them at all,
 * and a week that appears and then vanishes on a failed write is a worse first
 * impression than one that takes a moment.
 */
function StarterRhythm({ connected }: { connected: string[] }) {
  const router = useRouter()
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function take() {
    setSaving(true)
    setError(null)

    try {
      // Sequential: each call reads "does this channel have a rhythm" before
      // it writes, and two channels is the whole range.
      for (const channel of connected) {
        await applyStarterRhythm(channel)
      }
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set it up")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        variant="action"
        pending={saving}
        pendingLabel="Setting it up…"
        onClick={take}
      >
        Start with this rhythm
      </Button>
      {error ? (
        <Text variant="small" role="alert">
          {error}
        </Text>
      ) : null}
    </>
  )
}
