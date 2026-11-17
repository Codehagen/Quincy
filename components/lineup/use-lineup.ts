"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { placeApprovedVersion, postNow as postNowAction } from "@/app/(app)/drafts/actions"
import {
  applyStarterRhythm,
  createSlot,
  movePost,
  reorderLineup,
  unschedulePost,
  type MoveResult,
} from "@/app/(app)/lineup/actions"
import type { LineupWeek } from "@/lib/lineup"
import { addDayKeys, weekDays, type MoveTarget } from "@/lib/lineup-week"
import { dayKeyIn, hhmmIn } from "@/lib/timezone"

import { CHANNEL_LABELS } from "./slot-composer"

import {
  NO_FILTERS,
  buildItems,
  dropTarget,
  isPastAt,
  matches,
  moveLocally,
  quoted,
  removeLocally,
  stepOnChannel,
  summaryOf,
  targetOf,
  whenLabel,
  type Clock,
  type Drop,
  type Filters,
  type Item,
  type UnplacedReason,
} from "./lineup-model"

/**
 * /lineup's state: the week the server read, the filters, the open item,
 * the note after an action, and the verbs. Every write is an existing server
 * action, with its guards unchanged:
 *
 *   movePost              a drop, Enter on a held block, the Move menu (M), ⇧J ⇧K into a slot, Undo
 *   reorderLineup         ⇧J ⇧K: two queued posts trade places, both or neither; Undo of that
 *   unschedulePost        Back to Drafts (B)
 *   placeApprovedVersion  Give it a time (G): the next free slot, or no-slot / slots-full
 *   postNow               Post now and Try again now (P), only from the confirmed dialog
 *   createSlot            Make it a slot (empty time), and the Slots dialog
 *   applyStarterRhythm    the first run's one press
 *
 * - **Moves are optimistic, one at a time.** The calendar moves the block at
 *   once; a refusal from the server (a time that passed, a post the sweep
 *   took) puts the week back to the server's last word, says why in the foot
 *   and refreshes. While a move is in flight a second one is refused, and
 *   server snapshots wait, so a refresh for the first cannot overwrite the
 *   second.
 * - **Everything else waits for the server**: Back to Drafts, Give it a time,
 *   Post now, a new slot. Their honest sentence is the server's.
 * - **Undo (U) is a move back**, through the same actions. Back to Drafts has
 *   no undo: the server has no restore (DECISION.md, proposed 3), so the foot
 *   offers Drafts instead, where the version waits still approved.
 *
 * Nothing here spends on its own: Post now is the only verb that reaches a
 * platform, and it runs from its confirmation dialog alone.
 */

export type Notice = { id: number; text: string; undo: boolean; drafts: boolean }

type Undo = { label: string; restore: { postId: string; target: MoveTarget; was: Drop }[] }

export type LineupStore = ReturnType<typeof useLineup>

const FAILED = "That didn’t go through. Nothing changed. The page shows what the server has."

/** The account's wall clock, read now. */
function clockIn(zone: string): Clock {
  const now = new Date()
  return { day: dayKeyIn(now, zone), time: hhmmIn(now, zone) }
}

/**
 * The account's clock, starting from the one the server read (so the first
 * render agrees with it), then read again every half minute: the now line
 * moves and a slot that passes while the tab is open reads as passed.
 */
function useClock(zone: string, initial: Clock) {
  const [clock, setClock] = React.useState(initial)
  React.useEffect(() => {
    const tick = () =>
      setClock((c) => {
        const next = clockIn(zone)
        return next.day === c.day && next.time === c.time ? c : next
      })
    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [zone])
  return clock
}

export function useLineup({ initial, connected, timezone, clock: initialClock }: { initial: LineupWeek; connected: string[]; timezone: string; clock: Clock }) {
  const router = useRouter()
  const clock = useClock(timezone, initialClock)

  const [week, setWeek] = React.useState(initial)
  const [fromServer, setFromServer] = React.useState(initial)
  const [inFlight, setInFlight] = React.useState(false)
  const inFlightRef = React.useRef(false)
  // Server data arriving after mount (a revalidate, a refresh, a week change),
  // adopted during render, as React documents for a changed prop, unless a
  // move is still being written.
  if (initial !== fromServer && !inFlight) {
    setFromServer(initial)
    setWeek(initial)
  }
  const latestServer = React.useRef(initial)
  React.useEffect(() => {
    latestServer.current = initial
  }, [initial])

  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS)
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const noticeId = React.useRef(0)
  const [undoable, setUndoable] = React.useState<Undo | null>(null)
  /** The post whose Move menu is open (M), and the item whose Post now is asking (P). */
  const [menu, setMenu] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<string | null>(null)
  const [slotsOpen, setSlotsOpen] = React.useState(false)
  /** What `placeApprovedVersion` answered, by version: "every slot is full" is only known by asking. */
  const [reasons, setReasons] = React.useState<Record<string, UnplacedReason | undefined>>({})
  const [posting, setPosting] = React.useState<string | null>(null)
  const [placing, setPlacing] = React.useState<string | null>(null)
  const [sendingBack, setSendingBack] = React.useState<string | null>(null)
  const [weekPending, startWeek] = React.useTransition()

  const days = React.useMemo(() => weekDays(week.week), [week.week])
  const allItems = React.useMemo(() => buildItems(week, clock, reasons), [week, clock, reasons])
  const items = React.useMemo(() => allItems.filter((i) => matches(i, filters)), [allItems, filters])
  const waiting = React.useMemo(() => items.filter((i): i is Extract<Item, { kind: "unplaced" }> => i.kind === "unplaced"), [items])
  const timeline = React.useMemo(() => items.filter((i) => i.kind !== "unplaced"), [items])

  // What the pane opens on: the first queued post, else what asks something
  // of you (an approved post with no time, an open slot ahead), so an empty
  // week opens on its gap rather than on "Nothing open".
  const firstQueued =
    items.find((i) => i.kind === "post" && i.post.state === "queued")?.key ??
    items.find((i) => i.kind === "unplaced" || (i.kind === "open" && !i.passed))?.key ??
    null
  /** The open item: what was picked, while it is on the page; with nothing picked, the first queued post. */
  const selected: Item | null = selectedKey === null ? (allItems.find((i) => i.key === firstQueued) ?? null) : (allItems.find((i) => i.key === selectedKey) ?? null)

  const isPast = React.useCallback((dayId: string, time: string) => isPastAt(clock, dayId, time), [clock])

  const say = React.useCallback((text: string, { undo = false, drafts = false }: { undo?: boolean; drafts?: boolean } = {}) => {
    setNotice({ id: ++noticeId.current, text, undo, drafts })
  }, [])
  const dismissNotice = React.useCallback(() => setNotice(null), [])

  /** Show `next` at once, write, and settle. False when another write is still in flight and nothing started. */
  const commit = (next: LineupWeek, write: () => Promise<MoveResult>, onRefused?: () => void) => {
    if (inFlightRef.current) {
      say("The last move is still being saved. Try again in a moment.")
      return false
    }
    inFlightRef.current = true
    setInFlight(true)
    setWeek(next)
    const rollBack = (text: string) => {
      setWeek(latestServer.current)
      setUndoable(null)
      onRefused?.()
      say(text)
      router.refresh()
    }
    write()
      .then((result) => {
        if (!result.ok) rollBack(result.message)
      })
      .catch((error: unknown) => {
        console.error(error)
        rollBack("That move did not go through. Nothing changed. Try again.")
      })
      .finally(() => {
        inFlightRef.current = false
        setInFlight(false)
      })
    return true
  }

  const postOf = (id: string) => week.posts.find((p) => p.id === id)

  /**
   * Move a queued post to a day and minute (a drop, Enter on a held block):
   * into the open slot of its channel at exactly that time, else a one-off.
   * False puts the block back.
   */
  const moveTo = (postId: string, dayId: string, minute: number) => {
    const p = postOf(postId)
    if (!p || p.state !== "queued") {
      say("Only a queued post moves. Nothing moved.")
      return false
    }
    const drop = dropTarget(p, dayId, minute, week, clock.day)
    if (isPast(drop.dayId, drop.time)) {
      say("That time has already passed. Pick a later one: a post moved there would go out straight away.")
      return false
    }
    return apply(p.id, drop)
  }

  /** One move through `movePost`, said with where it went and offered back with U. */
  const apply = (postId: string, drop: Drop) => {
    const p = postOf(postId)
    if (!p) return false
    const was: Drop = { target: targetOf(p, week, clock.day), slotted: !!p.slotId, dayId: p.dayId, time: p.time }
    const ok = commit(moveLocally(week, postId, drop), () => movePost(postId, drop.target))
    if (!ok) return false
    const inWeek = days.includes(drop.dayId)
    setUndoable({ label: p.opening, restore: [{ postId, target: was.target, was }] })
    setSelectedKey(inWeek ? postId : null)
    const when = whenLabel(drop.dayId, drop.time, clock.day)
    say(`Moved ${quoted(p.opening)} to ${when}${drop.slotted ? ", in your slot" : ""}.${inWeek ? "" : " That is another week, so it leaves this one."}`, { undo: true })
    return true
  }

  /** M: a slot occurrence or a day and time from the Move menu. */
  const moveToTarget = (postId: string, dayId: string, time: string) => {
    const [h, m] = time.split(":").map(Number)
    return moveTo(postId, dayId, h! * 60 + m!)
  }

  /** ⇧J ⇧K: one place later or earlier on its channel. */
  const shift = (postId: string, dir: 1 | -1) => {
    const p = postOf(postId)
    if (!p || p.state !== "queued") {
      say("Only a queued post moves. Nothing moved.")
      return
    }
    const step = stepOnChannel(p, allItems, dir, clock)
    if (!step) {
      say(`Nothing ${dir > 0 ? "later" : "earlier"} on ${p.channelLabel} this week. Nothing moved.`)
      return
    }
    if (step.kind === "slot") {
      moveToTarget(p.id, step.open.dayId, step.open.time)
      return
    }
    const q = step.with
    const toQ: Drop = { target: targetOf(q, week, clock.day), slotted: !!q.slotId, dayId: q.dayId, time: q.time }
    const toP: Drop = { target: targetOf(p, week, clock.day), slotted: !!p.slotId, dayId: p.dayId, time: p.time }
    const next = moveLocally(moveLocally(week, p.id, toQ), q.id, toP)
    const ok = commit(next, () =>
      reorderLineup([
        { postId: p.id, target: toQ.target },
        { postId: q.id, target: toP.target },
      ])
    )
    if (!ok) return
    setUndoable({
      label: p.opening,
      restore: [
        { postId: p.id, target: toP.target, was: toP },
        { postId: q.id, target: toQ.target, was: toQ },
      ],
    })
    setSelectedKey(p.id)
    say(`${quoted(p.opening)} now goes ${whenLabel(q.dayId, q.time, clock.day)}, and ${quoted(q.opening)} takes ${whenLabel(p.dayId, p.time, clock.day)}.`, { undo: true })
  }

  /** U: put the last move back, through the same actions. */
  const undo = () => {
    const u = undoable
    if (!u) return
    if (u.restore.some((r) => isPast(r.was.dayId, r.was.time))) {
      setUndoable(null)
      say("Its old time has passed, so it stays where it is.")
      return
    }
    const next = u.restore.reduce((w, r) => moveLocally(w, r.postId, r.was), week)
    const ok = commit(next, () =>
      u.restore.length === 1 ? movePost(u.restore[0]!.postId, u.restore[0]!.target) : reorderLineup(u.restore.map((r) => ({ postId: r.postId, target: r.target })))
    )
    if (!ok) return
    setUndoable(null)
    setSelectedKey(u.restore[0]!.postId)
    say(`Put ${quoted(u.label)} back.`)
  }

  /** B: the row goes, the version stays approved and waits on Drafts. Waits for the server. */
  const unschedule = (postId: string) => {
    const p = postOf(postId)
    if (!p || (p.state !== "queued" && p.state !== "failed") || sendingBack) return
    setSendingBack(postId)
    unschedulePost(postId)
      .then(() => {
        setWeek((w) => removeLocally(w, postId))
        setUndoable(null)
        setSelectedKey(null)
        say(`Sent ${quoted(p.opening)} back to Drafts. It is still approved and waits there for a time.`, { drafts: true })
        router.refresh()
      })
      .catch((error: unknown) => {
        console.error(error)
        say(FAILED)
        router.refresh()
      })
      .finally(() => setSendingBack(null))
  }

  /** G: the next free slot on the channel. The honest sentence is the server's. */
  const place = (versionId: string) => {
    const u = week.unplaced.find((x) => x.versionId === versionId)
    if (!u || placing) return
    setPlacing(versionId)
    placeApprovedVersion(versionId)
      .then((placement) => {
        if (placement.scheduled) {
          const when = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(placement.at)
          say(`${quoted(u.opening)} goes out ${when}.${placement.beyondThisWeek ? " That is past this week." : ""}`)
        } else {
          setReasons((r) => ({ ...r, [versionId]: placement.reason }))
          say(
            placement.reason === "slots-full"
              ? `Every ${u.channelLabel} slot is taken for the next two weeks. Free one, add one with S, or send it now.`
              : `No ${u.channelLabel} slot yet, so it has no time. Add one with S, or send it now.`
          )
        }
      })
      .catch((error: unknown) => {
        console.error(error)
        say(FAILED)
      })
      .finally(() => {
        setPlacing(null)
        router.refresh()
      })
  }

  /**
   * P, from the confirmed dialog only: send one approved version now. Never
   * optimistic: it is a request to somebody else's platform, which can
   * refuse it, take it and say nothing, or take twenty seconds.
   */
  const postNow = (key: string) => {
    setConfirm(null)
    const item = allItems.find((i) => i.key === key)
    const versionId = item?.kind === "post" ? item.post.versionId : item?.kind === "unplaced" ? item.unplaced.versionId : null
    if (!item || !versionId || posting) return
    const opening = item.kind === "post" ? item.post.opening : item.kind === "unplaced" ? item.unplaced.opening : ""
    setPosting(key)
    say(`Posting ${quoted(opening)} now.`)
    postNowAction(versionId)
      .then((result) => say(result.ok ? `Posted ${quoted(opening)}. Quincy can’t unsend it.` : result.message))
      .catch((error: unknown) => {
        console.error(error)
        say("Quincy could not reach the platform. Nothing went out. Try again.")
      })
      .finally(() => {
        setPosting(null)
        setUndoable(null)
        router.refresh()
      })
  }

  /** An empty quarter hour made a slot, or the Slots dialog's Add. A duplicate is a no-op on the server. */
  const addSlot = async (channel: string, weekday: number, time: string) => {
    await createSlot({ channel, weekday, time })
    say(`Added a ${CHANNEL_LABELS[channel] ?? channel} slot. It is a time you publish every week.`)
    router.refresh()
  }

  const takeStarter = async () => {
    // Sequential: each call reads "does this channel have a rhythm" before it writes.
    for (const channel of connected) await applyStarterRhythm(channel)
    router.refresh()
  }

  /** The week before or after, or this one (`0`): a new read on the server (`?week=`). */
  const goWeek = (by: -1 | 0 | 1) => {
    const next = by === 0 ? week.thisWeek : addDayKeys(week.week, by * 7)
    if (next === week.week) return
    setSelectedKey(null)
    startWeek(() => {
      router.replace(next === week.thisWeek ? "/lineup" : `/lineup?week=${next}`, { scroll: false })
    })
  }

  /** j / k: the next or previous item, in the order the page lists them. */
  const step = (by: 1 | -1, within?: (i: Item) => boolean) => {
    const list = within ? items.filter(within) : items
    if (list.length === 0) return null
    const i = selected ? list.findIndex((x) => x.key === selected.key) : -1
    const next = list[Math.min(list.length - 1, Math.max(0, i < 0 ? 0 : i + by))]!
    setSelectedKey(next.key)
    return next.key
  }

  return {
    week,
    days,
    clock,
    timezone,
    connected,
    isPast,
    items,
    allItems,
    waiting,
    timeline,
    filters,
    setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v })),
    clearFilters: () => setFilters(NO_FILTERS),
    selectedKey,
    selected,
    select: setSelectedKey,
    step,
    moveTo,
    moveToTarget,
    shift,
    undo,
    canUndo: undoable != null,
    unschedule,
    place,
    postNow,
    addSlot,
    takeStarter,
    goWeek,
    weekPending,
    inFlight,
    posting,
    placing,
    sendingBack,
    notice,
    say,
    dismissNotice,
    menu,
    setMenu,
    confirm,
    setConfirm,
    slotsOpen,
    setSlotsOpen,
    summary: summaryOf(allItems, week.slots.length),
    nothingAtAll: week.slots.length === 0 && week.posts.length === 0 && week.unplaced.length === 0,
  }
}
