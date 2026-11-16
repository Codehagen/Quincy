"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  movePost,
  reorderLineup,
  unschedulePost,
  type MoveResult,
} from "@/app/(app)/lineup/actions"
import {
  ButtonLink,
  Card,
  Count,
  EmptyState,
  KitPage,
  Stage,
  Text,
} from "@/components/kit"
import type { SlotTiming } from "@/components/quincy"
import { Friend } from "@/components/mascot"
import { countQueued, type Day, type Entry, type Slot } from "@/lib/lineup"
import { dayKeyIn, hhmmIn } from "@/lib/timezone"

import {
  NoLineup,
  OpenSlots,
  PostDetail,
  Settled,
  WeekOrder,
  type MoveTarget,
  type Position,
} from "./lineup-parts"
import { SlotComposer } from "./slot-composer"

type Lineup = { days: Day[]; slots: Slot[] }

/**
 * The Lineup screen, and the only thing on this page that holds state.
 *
 * It renders KitPage itself because the summary counts what is queued, and
 * that count changes with every move (docs/design/page.md, "Where KitPage
 * renders").
 *
 * **Optimistic, then confirmed.** Moving a post changes two things at once —
 * which day holds it, and which slots are free — and only something above both
 * can keep those in agreement. The local update is what the rows animate
 * against; a failed write rolls the state back to the server's last word,
 * says why in the notice, and refreshes, because a schedule that shows a time
 * nothing is going out at is worse than a slower one.
 *
 * **One write at a time.** While a move is in flight the running order is
 * disabled and further moves are refused, and server snapshots that arrive in
 * the meantime wait until it settles. Without that, a second drag landed on
 * top of the first, a failure rolled back over both, and a refresh for the
 * first replaced the optimistic order of the second.
 *
 * Back to Drafts waits for the server and is a plain control: it deletes the
 * `scheduled_post` row only, and the version stays approved on Drafts
 * (`unschedulePost`). Nothing written is lost, so it is not a hold.
 */
export function LineupScreen({
  initial,
  connected,
  timezone,
  today,
  clock,
}: {
  initial: Lineup
  connected: string[]
  /** The account's zone. Every time on the page is drawn in it. */
  timezone: string
  /** Today in the account's zone, `YYYY-MM-DD`. */
  today: string
  /** The account's wall clock when the page was read, `HH:MM`. */
  clock: string
}) {
  const router = useRouter()
  const [state, setState] = React.useState(initial)

  /**
   * Server data arriving after mount, which `useState(initial)` alone
   * ignores: adding or removing a slot wrote, refreshed, and left the week
   * unchanged. Adjusted during render rather than in an effect — React's
   * documented way to react to a changed prop.
   */
  const [fromServer, setFromServer] = React.useState(initial)
  /** A move is being written. Snapshots wait; the order is not draggable. */
  const [inFlight, setInFlight] = React.useState(false)
  // Read synchronously by handlers, so two presses inside one render cannot
  // both start a write.
  const inFlightRef = React.useRef(false)
  if (initial !== fromServer && !inFlight) {
    setFromServer(initial)
    setState(initial)
  }
  /** The server's latest word, for rolling back a failed move. */
  const latestServer = React.useRef(initial)
  React.useEffect(() => {
    latestServer.current = initial
  }, [initial])

  const [pickedPost, setPickedPost] = React.useState<string | null>(null)
  const [pickedSlot, setPickedSlot] = React.useState<string | null>(null)

  /**
   * What the last removal or move out of the week left behind. One at a
   * time, like an UndoBar, but with no Undo: putting a deleted
   * `scheduled_post` back is a schedule action, and the honest way back is
   * Drafts, where the version waits still approved.
   */
  const [notice, setNotice] = React.useState<{
    text: string
    /** Offer Open Drafts: true when the post went there or left the week. */
    drafts: boolean
  } | null>(null)
  const noticeLink = React.useRef<HTMLAnchorElement>(null)
  React.useEffect(() => {
    if (notice?.drafts) noticeLink.current?.focus({ preventScroll: true })
  }, [notice])

  /**
   * Whether a day and time has passed, by the account's clock *now* — not the
   * clock the page was read at, which goes stale while the tab stays open.
   * The server refuses these anyway (`resolveTarget`); this keeps them off
   * the screen as choices.
   */
  const isPast = React.useCallback(
    (dayId: string, time: string) => {
      const now = new Date()
      const day = dayKeyIn(now, timezone)
      return dayId < day || (dayId === day && time <= hhmmIn(now, timezone))
    },
    [timezone]
  )

  const { days, slots } = state
  const hasAnything =
    days.some((d) => d.entries.length > 0) || slots.length > 0

  // ── The week as one running order ─────────────────────────────────────
  const dayOf = React.useMemo(() => {
    const map = new Map<string, Day>()
    for (const day of days) for (const e of day.entries) map.set(e.id, day)
    return map
  }, [days])

  const queued = React.useMemo(
    () => days.flatMap((d) => d.entries.filter((e) => e.state === "queued")),
    [days]
  )

  const slotOf = React.useMemo(() => {
    const map = new Map<string, Slot>()
    for (const s of slots) if (s.filledBy) map.set(s.filledBy, s)
    return map
  }, [slots])

  /** Each position keeps its day, time and slot; the posts move between them. */
  const positions: Position[] = queued.map((e) => {
    const day = dayOf.get(e.id)!
    return {
      dayId: day.id,
      dayLabel: day.label,
      time: e.time,
      slotId: slotOf.get(e.id)?.id ?? null,
    }
  })

  /**
   * Show `next` at once, write, and settle. Returns false when another write
   * is still in flight and nothing was started.
   */
  const commit = React.useCallback(
    (next: Lineup, write: () => Promise<MoveResult>) => {
      if (inFlightRef.current) return false
      inFlightRef.current = true
      setInFlight(true)
      setNotice(null)
      setState(next)

      const rollBack = (text: string) => {
        setState(latestServer.current)
        setNotice({ text, drafts: false })
        router.refresh()
      }

      write()
        .then((result) => {
          if (!result.ok) rollBack(result.message)
        })
        .catch((error) => {
          console.error(error)
          rollBack("That move did not go through. Nothing changed. Try again.")
        })
        .finally(() => {
          inFlightRef.current = false
          setInFlight(false)
        })
      return true
    },
    [router]
  )

  const move = React.useCallback(
    (entry: Entry, target: MoveTarget) => {
      const dest =
        target.kind === "slot"
          ? slots.find((s) => s.id === target.slotId)
          : target
      if (dest && isPast(dest.dayId, dest.time)) {
        setNotice({
          text: "That time has already passed. Pick a later one: a post moved there would go out straight away.",
          drafts: false,
        })
        return
      }

      const next = moveLocally(state, entry.id, target)
      if (!commit(next, () => movePost(entry.id, target))) {
        setNotice({
          text: "The last move is still being saved. Try again in a moment.",
          drafts: false,
        })
        return
      }

      // Moved past the week: it is still scheduled, just not this question.
      const stillHere = next.days.some((d) =>
        d.entries.some((e) => e.id === entry.id)
      )
      if (!stillHere && target.kind === "day") {
        setPickedPost(null)
        setNotice({
          text: `Moved "${entry.opening}" to ${dayName(target.dayId)} at ${target.time}. That is past this week, so it leaves this list until then.`,
          drafts: true,
        })
      }
    },
    [commit, isPast, slots, state]
  )

  /**
   * A drop in the running order. Every post whose position changed takes that
   * position's day and time — and its slot, when the slot is on the post's
   * own channel. A LinkedIn post dropped into an X slot's place becomes a
   * one-off at that time and leaves the slot to X.
   *
   * One `reorderLineup` for the whole drop: the server applies every move or
   * none, so the screen never shows an order the server does not hold.
   *
   * **A position whose time has passed is not a place to move to.** An
   * overdue post still sits in the order until the sweep takes it, and a post
   * dragged into its place would inherit a time inside the sweep's catch-up
   * window — published within minutes. The whole drop is refused rather than
   * skipping that one position, because skipping would leave two posts
   * claiming the same place in the order.
   */
  const reorder = React.useCallback(
    (next: Entry[]) => {
      if (inFlightRef.current) return
      let intoPast = false
      const moves = next.flatMap((entry, i) => {
        if (queued[i]?.id === entry.id) return []
        const at = positions[i]
        if (!at) return []
        if (isPast(at.dayId, at.time)) intoPast = true
        const slot = at.slotId
          ? slots.find((s) => s.id === at.slotId)
          : undefined
        const target: MoveTarget =
          slot && slot.channel === entry.channel
            ? { kind: "slot", slotId: slot.id }
            : { kind: "day", dayId: at.dayId, time: at.time }
        return [{ entry, target }]
      })
      if (moves.length === 0) return
      if (intoPast) {
        setNotice({
          text: "A place in that order has already passed, so nothing moved. A post moved there would go out straight away.",
          drafts: false,
        })
        return
      }

      commit(
        moves.reduce((s, m) => moveLocally(s, m.entry.id, m.target), state),
        () =>
          reorderLineup(
            moves.map((m) => ({ postId: m.entry.id, target: m.target }))
          )
      )
    },
    [commit, isPast, positions, queued, slots, state]
  )

  const unschedule = React.useCallback(async (entry: Entry) => {
    // Waits for the server. A throw reaches the caller, which says so beside
    // the control (PostDetail, Settled).
    await unschedulePost(entry.id)
    setState((current) => removeLocally(current, entry.id))
    setPickedPost((id) => (id === entry.id ? null : id))
    setNotice({
      text: `Sent "${entry.opening}" back to Drafts. It is still approved and waits there for a new time.`,
      drafts: true,
    })
  }, [])

  // ── The picked post's detail ─────────────────────────────────────────
  const post = queued.find((e) => e.id === pickedPost) ?? null
  const postDay = post ? dayOf.get(post.id) : undefined
  const nextDay = postDay ? days[days.indexOf(postDay) + 1] : undefined

  /** Every time the person posts at: their slots, and anything queued. */
  const times = React.useMemo(
    () =>
      [
        ...new Set([
          ...slots.map((s) => s.time),
          ...days.flatMap((d) => d.entries.map((e) => e.time)),
        ]),
      ].sort(),
    [days, slots]
  )

  /** Times already holding a post on the same channel, per day. */
  const taken = React.useMemo(() => {
    const out: Record<string, string[]> = {}
    if (!post) return out
    for (const day of days) {
      const here = day.entries
        .filter((e) => e.id !== post.id && e.channel === post.channel)
        .map((e) => e.time)
      if (here.length > 0) out[day.id] = here
    }
    return out
  }, [days, post])

  // ── Open slots ───────────────────────────────────────────────────────
  const open = slots
    .filter((s) => !s.filledBy)
    .sort((a, b) => {
      const da = days.findIndex((d) => d.id === a.dayId)
      const db = days.findIndex((d) => d.id === b.dayId)
      return da - db || a.time.localeCompare(b.time)
    })
  const firstUpcoming = open.find(
    (s) => !(s.dayId === today && s.time <= clock)
  )
  const timingOf = (s: Slot): SlotTiming =>
    s.dayId === today && s.time <= clock
      ? "past"
      : s.id === firstUpcoming?.id
        ? "next"
        : "upcoming"

  const settledCount = days.reduce(
    (n, d) => n + d.entries.filter((e) => e.state !== "queued").length,
    0
  )

  const count = countQueued(days)
  const summary = !hasAnything ? (
    "When approved writing goes out. Drafts decides what; this decides when."
  ) : (
    <>
      <Count value={count.entries} /> {count.entries === 1 ? "post" : "posts"}{" "}
      going out this week
      {slots.length > 0 ? (
        <>
          . Your rhythm has <Count value={slots.length} />{" "}
          {slots.length === 1 ? "slot" : "slots"}.
        </>
      ) : (
        "."
      )}
    </>
  )

  return (
    <KitPage
      title="Lineup"
      summary={summary}
      actions={
        // Only once there is a week worth looking at: on an empty account
        // the same action is the whole of NoLineup.
        hasAnything ? (
          <SlotComposer
            existing={slots}
            connected={connected}
            timezone={timezone}
          />
        ) : null
      }
    >
      {!hasAnything ? (
        <Stage>
          <NoLineup timezone={timezone} connected={connected} />
        </Stage>
      ) : (
        <>
          <Stage
            lead="The week, in order."
            rest={
              queued.length > 1
                ? "Drag a post to give it another one's day and time. Pick one to change it."
                : undefined
            }
          >
            {queued.length > 0 ? (
              <WeekOrder
                entries={queued}
                positions={positions}
                pickedId={post?.id ?? null}
                onPick={(id) => {
                  setPickedPost(id)
                }}
                onReorder={reorder}
                disabled={inFlight}
              />
            ) : (
              <EmptyState
                media={<Friend size={40} state="idle" className="text-kit-ink" />}
                bold="Nothing queued this week."
                rest="Approve a draft and it takes the next open slot."
              >
                <ButtonLink href="/drafts">Open Drafts</ButtonLink>
              </EmptyState>
            )}

            {post && postDay ? (
              <PostDetail
                key={post.id}
                entry={post}
                dayId={postDay.id}
                openSlots={slots.filter(
                  (s) =>
                    !s.filledBy &&
                    s.channel === post.channel &&
                    !isPast(s.dayId, s.time)
                )}
                nextDay={nextDay}
                times={times}
                taken={taken}
                today={today}
                timeZone={timezone}
                onMove={(target) => move(post, target)}
                onUnschedule={() => unschedule(post)}
              />
            ) : null}

            {notice ? (
              <Card width="full">
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-kit-related"
                >
                  <Text tone="muted">{notice.text}</Text>
                  {notice.drafts ? (
                    <ButtonLink ref={noticeLink} href="/drafts">
                      Open Drafts
                    </ButtonLink>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </Stage>

          {open.length > 0 ? (
            <Stage
              lead={
                open.length === 1
                  ? "One slot is still open."
                  : `${open.length} slots are still open.`
              }
              rest="Pick one to fill it."
            >
              <OpenSlots
                slots={open}
                timingOf={timingOf}
                pickedId={pickedSlot}
                onPick={setPickedSlot}
                movable={queued}
                onMove={(entry, target) => {
                  setPickedSlot(null)
                  move(entry, target)
                }}
              />
            </Stage>
          ) : null}

          {settledCount > 0 ? (
            <Stage lead="Already out." rest="What went, and what did not.">
              <Settled days={days} onUnschedule={unschedule} />
            </Stage>
          ) : null}
        </>
      )}
    </KitPage>
  )
}

// en-GB and UTC, as the DateTimePicker reads a day: "Thu 26 Nov", the same
// string on the server and the client.
const DAY_NAME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
})

function dayName(dayId: string) {
  return DAY_NAME.format(new Date(`${dayId}T00:00:00Z`))
}

/** Local mirror of what `movePost` does on the server. */
function moveLocally(state: Lineup, postId: string, target: MoveTarget): Lineup {
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
function removeLocally(state: Lineup, postId: string): Lineup {
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
