"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { movePost, unschedulePost } from "@/app/(app)/lineup/actions"
import {
  countQueued,
  rowsForDay,
  type Day,
  type Entry,
  type Slot,
} from "@/lib/lineup"
import { withViewTransition } from "@/lib/view-transition"

import {
  CadenceStrip,
  DayHeading,
  EmptyDay,
  EmptySlotRow,
  EntryRow,
  UnscheduledRow,
  type MoveTarget,
} from "./lineup-parts"

/**
 * The week, and the only thing on this page that holds state.
 *
 * Moving a post changes two things at once — which day holds it, and which
 * slots are free — and only something above both can keep those in agreement.
 *
 * **Optimistic, then confirmed**, matching components/drafts/drafts-inbox.tsx.
 * The local update is what the view transition animates against; waiting for a
 * round trip would leave the row still for 200ms and then jump. A failed write
 * rolls the state back and refreshes, because a schedule that shows a time
 * nothing is actually going out at is worse than a slower one.
 */
export function LineupList({
  initial,
}: {
  initial: { days: Day[]; slots: Slot[] }
}) {
  const router = useRouter()
  const [state, setState] = React.useState(initial)

  /**
   * Server data arriving after mount, which `useState(initial)` alone ignores.
   *
   * Same fix as components/drafts/drafts-inbox.tsx and the same bug: `useState`
   * reads its argument once, so adding or removing a slot wrote to the database,
   * called `router.refresh()`, and left the week on screen unchanged. The only
   * way to see your own slot was a full page reload.
   *
   * Adjusted during render rather than in an effect — React's documented way to
   * react to a changed prop, and it re-renders without painting the stale value
   * first.
   *
   * `receipts` is deliberately not reset. It holds posts you just unscheduled,
   * which are gone from the database by definition and would vanish from the
   * screen the moment the server answered — the receipt is the only thing
   * saying where they went.
   */
  const [fromServer, setFromServer] = React.useState(initial)

  if (initial !== fromServer) {
    setFromServer(initial)
    setState(initial)
  }

  /** The post that just moved, so focus can follow the control that replaced it. */
  const [movedId, setMovedId] = React.useState<string | null>(null)

  /**
   * Unscheduled posts, kept on screen as receipts.
   *
   * The row is gone from the database the moment you press it — unscheduling is
   * a delete, not a state — but a row that simply vanishes reads as deletion.
   * So the entry is held here until the page is reloaded, which is also exactly
   * how long the undo is available.
   */
  const [receipts, setReceipts] = React.useState<Record<string, Entry>>({})

  const commit = React.useCallback(
    (before: typeof state, write: () => Promise<void>) => {
      write().catch((error) => {
        console.error(error)
        setState(before)
        router.refresh()
      })
    },
    [router]
  )

  const move = React.useCallback(
    (entry: Entry, target: MoveTarget) => {
      const before = state
      setMovedId(entry.id)
      commit(before, () => movePost(entry.id, target))

      withViewTransition(() =>
        setState((current) => moveLocally(current, entry.id, target))
      )
    },
    [commit, state]
  )

  const unschedule = React.useCallback(
    (entry: Entry) => {
      const before = state
      setMovedId(entry.id)
      commit(before, () => unschedulePost(entry.id))

      withViewTransition(() => {
        setReceipts((r) => ({ ...r, [entry.id]: entry }))
        setState((current) => removeLocally(current, entry.id))
      })
    },
    [commit, state]
  )

  /**
   * Undo does not re-insert the row here — it refreshes.
   *
   * Putting a deleted `scheduled_post` back means writing a row with the same
   * time and slot, which is a schedule action, not a state flip. Rather than
   * reimplement scheduling in an undo path, this sends you to Drafts where the
   * approved version is waiting; the receipt says as much.
   */
  const { days, slots } = state
  const open = countQueued(days)
  const receiptList = Object.values(receipts)

  return (
    <>
      <div className="flex flex-col gap-3 px-3">
        <CadenceStrip days={days} />
        <p className="text-caption text-muted-foreground">
          <span className="font-mono tabular-nums">{open.entries}</span>{" "}
          {open.entries === 1 ? "post" : "posts"} queued across{" "}
          <span className="font-mono tabular-nums">{open.days}</span>{" "}
          {open.days === 1 ? "day" : "days"}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {days.map((day) => {
          const rows = rowsForDay(day, slots)
          const dayReceipts = receiptList.filter((e) =>
            day.entries.every((x) => x.id !== e.id)
          )

          if (rows.length === 0 && dayReceipts.length === 0) {
            return (
              <section key={day.id} className="flex flex-col gap-2">
                <DayHeading day={day} />
                <EmptyDay />
              </section>
            )
          }

          return (
            <section key={day.id} className="flex flex-col gap-2">
              <DayHeading day={day} />
              <ul className="flex flex-col gap-2">
                {rows.map((row) =>
                  row.kind === "slot" ? (
                    <EmptySlotRow key={row.slot.id} slot={row.slot} />
                  ) : (
                    <EntryRow
                      key={row.entry.id}
                      entry={row.entry}
                      openSlots={slots.filter(
                        (s) => !s.filledBy && s.channel === row.entry.channel
                      )}
                      nextDay={days[days.indexOf(day) + 1]}
                      takeFocus={movedId === row.entry.id}
                      onMove={(target) => move(row.entry, target)}
                      onUnschedule={() => unschedule(row.entry)}
                    />
                  )
                )}
              </ul>
            </section>
          )
        })}
      </div>

      {receiptList.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {receiptList.map((entry) => (
            <UnscheduledRow
              key={entry.id}
              entry={entry}
              takeFocus={movedId === entry.id}
            />
          ))}
        </ul>
      ) : null}
    </>
  )
}

/** Local mirror of what `movePost` does on the server. */
function moveLocally(
  state: { days: Day[]; slots: Slot[] },
  postId: string,
  target: MoveTarget
) {
  const entry = state.days
    .flatMap((d) => d.entries)
    .find((e) => e.id === postId)
  if (!entry) return state

  const dest =
    target.kind === "slot"
      ? state.slots.find((s) => s.id === target.slotId)
      : { dayId: target.dayId, time: target.time }
  if (!dest) return state

  const moved = { ...entry, time: dest.time }

  return {
    days: state.days.map((day) => {
      const without = day.entries.filter((e) => e.id !== postId)
      if (day.id !== dest.dayId) return { ...day, entries: without }
      return {
        ...day,
        entries: [...without, moved].sort((a, b) => (a.time < b.time ? -1 : 1)),
      }
    }),
    slots: state.slots.map((s) => {
      if (s.filledBy === postId) return { ...s, filledBy: null }
      if (target.kind === "slot" && s.id === target.slotId) {
        return { ...s, filledBy: postId }
      }
      return s
    }),
  }
}

/** Local mirror of `unschedulePost`: the row goes, and its slot opens up. */
function removeLocally(state: { days: Day[]; slots: Slot[] }, postId: string) {
  return {
    days: state.days.map((d) => ({
      ...d,
      entries: d.entries.filter((e) => e.id !== postId),
    })),
    slots: state.slots.map((s) =>
      s.filledBy === postId ? { ...s, filledBy: null } : s
    ),
  }
}
