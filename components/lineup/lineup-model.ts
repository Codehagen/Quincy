import type { LineupWeek, Unplaced, WeekPost, WeekSlot } from "@/lib/lineup"
import { addDayKeys, occurrenceKey, slotTargetOn, weekDays, weekdayOfKey, type MoveTarget } from "@/lib/lineup-week"

import { hhmm, minutesOf } from "@/components/kit/week-calendar-math"

/**
 * Lineup's reading of a week, with no React in it: the items the page
 * shows (a post, a slot's occurrence that nothing fills, an approved post
 * with no time), the blocks the calendar draws, Quincy's notes on them, and
 * where a drop sends a post. lineup-model.test.ts pins each one.
 */

/** The account's wall clock: today and the time, in its zone. */
export type Clock = { day: string; time: string }

/** At or before now on the account's clock. The server refuses these anyway (`resolveTarget`); this keeps them off the screen as choices. */
export function isPastAt(clock: Clock, dayId: string, time: string) {
  return dayId < clock.day || (dayId === clock.day && time <= clock.time)
}

export type UnplacedReason = Unplaced["reason"] | "slots-full"

export type Item =
  | { kind: "post"; key: string; dayId: string; time: string; channel: string; channelLabel: string; post: WeekPost }
  | { kind: "open"; key: string; dayId: string; time: string; channel: string; channelLabel: string; slot: WeekSlot; passed: boolean }
  | { kind: "unplaced"; key: string; dayId: ""; time: ""; channel: string; channelLabel: string; unplaced: Unplaced; reason: UnplacedReason }

export type PostItem = Extract<Item, { kind: "post" }>
export type OpenItem = Extract<Item, { kind: "open" }>
export type UnplacedItem = Extract<Item, { kind: "unplaced" }>

export const openKey = (slotId: string, dayId: string) => `slot:${slotId}:${dayId}`
export const unplacedKey = (versionId: string) => `st:${versionId}`

const at = (dayId: string, time: string) => `${dayId} ${time}`

/**
 * Every item of the week, the approved posts with no time first, then the
 * week in time order (a post before an open slot at the same minute).
 * `reasons` carries what the session learned about an unplaced post that the
 * read cannot say (`placeApprovedVersion` answered "slots-full").
 */
export function buildItems(week: LineupWeek, clock: Clock, reasons: Readonly<Record<string, UnplacedReason | undefined>> = {}): Item[] {
  const posts: Item[] = week.posts.map((p) => ({ kind: "post", key: p.id, dayId: p.dayId, time: p.time, channel: p.channel, channelLabel: p.channelLabel, post: p }))
  const open: Item[] = []
  for (const dayId of weekDays(week.week)) {
    const wd = weekdayOfKey(dayId)
    for (const slot of week.slots) {
      if (slot.weekday !== wd || week.filled[occurrenceKey(slot.id, dayId)]) continue
      open.push({
        kind: "open",
        key: openKey(slot.id, dayId),
        dayId,
        time: slot.time,
        channel: slot.channel,
        channelLabel: slot.channelLabel,
        slot,
        passed: isPastAt(clock, dayId, slot.time),
      })
    }
  }
  const timed = [...posts, ...open].sort((a, b) => at(a.dayId, a.time).localeCompare(at(b.dayId, b.time)) || (a.kind === "post" ? -1 : 1))
  const waiting: Item[] = week.unplaced.map((u) => ({
    kind: "unplaced",
    key: unplacedKey(u.versionId),
    dayId: "",
    time: "",
    channel: u.channel,
    channelLabel: u.channelLabel,
    unplaced: u,
    reason: reasons[u.versionId] ?? u.reason,
  }))
  return [...waiting, ...timed]
}

export type ChannelFilter = "all" | string
export type ShowFilter = "all" | "ahead"
export type Filters = { channel: ChannelFilter; show: ShowFilter }
export const NO_FILTERS: Filters = { channel: "all", show: "all" }

/** Settled items recede, and "Still to go" hides them: a sent post, a slot that passed empty. */
export function isSettled(item: Item) {
  return (item.kind === "post" && item.post.state === "published") || (item.kind === "open" && item.passed)
}

export function matches(item: Item, f: Filters) {
  if (f.channel !== "all" && item.channel !== f.channel) return false
  if (f.show === "ahead" && isSettled(item)) return false
  return true
}

/* ── The calendar's blocks ──────────────────────────────────────────── */

/** How tall a block is drawn: a visual length, not a duration (a post has none). */
export const VISUAL_MINUTES = 45

export type CalBlock = {
  id: string
  track: string
  start: number
  end: number
  variant: "post" | "slot" | "passed"
  channel: string
  state?: WeekPost["state"]
}

export function blocksOf(items: readonly Item[]): CalBlock[] {
  return items.flatMap((i): CalBlock[] => {
    if (i.kind === "unplaced") return []
    const start = minutesOf(i.time)
    if (Number.isNaN(start)) return []
    const end = Math.min(24 * 60, start + VISUAL_MINUTES)
    if (i.kind === "post") return [{ id: i.key, track: i.dayId, start, end, variant: "post", channel: i.channel, state: i.post.state }]
    return [{ id: i.key, track: i.dayId, start, end, variant: i.passed ? "passed" : "slot", channel: i.channel }]
  })
}

/** Only a queued post still ahead moves. */
export function isMovable(item: Item | undefined, clock: Clock) {
  return item?.kind === "post" && item.post.state === "queued" && !isPastAt(clock, item.dayId, item.time)
}

/* ── Quincy's notes on the week ─────────────────────────────────────── */

/**
 * A post within this long after another on its channel, the same day, is
 * "close behind" it. A fact, never a warning: two in a day is common for
 * the person this was measured on.
 */
export const CLOSE_BEHIND_MINUTES = 4 * 60

/** Each queued post that follows another on its channel the same day within `CLOSE_BEHIND_MINUTES`, and the time of the one before. */
export function closeBehind(posts: readonly WeekPost[]): Map<string, string> {
  const out = new Map<string, string>()
  const queued = posts.filter((p) => p.state === "queued").sort((a, b) => at(a.dayId, a.time).localeCompare(at(b.dayId, b.time)))
  // The one before on the same channel, not the one before in the week: a
  // LinkedIn post between two X posts does not separate them.
  const last = new Map<string, WeekPost>()
  for (const b of queued) {
    const a = last.get(b.channel)
    if (a && a.dayId === b.dayId && minutesOf(b.time) - minutesOf(a.time) < CLOSE_BEHIND_MINUTES) out.set(b.id, a.time)
    last.set(b.channel, b)
  }
  return out
}

export type WeekNote = { id: string; day: string; minute: number; text: string }

/**
 * Quincy's notes written on the grid: a few lower-case words, never a
 * number of anything and never a verdict.
 *
 * - "quiet day" at 09:00 on a day ahead with nothing on it (a passed slot
 *   does not count as something);
 * - "next open slot" under the first open slot still ahead, on this week
 *   only (a later week cannot know the slots before it are full);
 * - "close behind 09:00" under a queued post that follows another on its
 *   channel the same morning.
 */
export function weekNotes({ blocks, days, today, posts, thisWeek }: { blocks: readonly CalBlock[]; days: readonly string[]; today: string; posts: readonly WeekPost[]; thisWeek: boolean }): WeekNote[] {
  const out: WeekNote[] = []
  for (const day of days) {
    if (day <= today) continue
    if (!blocks.some((b) => b.track === day && b.variant !== "passed")) out.push({ id: `quiet-${day}`, day, minute: 9 * 60, text: "quiet day" })
  }
  if (thisWeek) {
    const next = blocks.filter((b) => b.variant === "slot").sort((a, b) => a.track.localeCompare(b.track) || a.start - b.start)[0]
    if (next) out.push({ id: `next-${next.id}`, day: next.track, minute: next.end + 4, text: "next open slot" })
  }
  const behind = closeBehind(posts)
  for (const b of blocks) {
    const before = b.variant === "post" ? behind.get(b.id) : undefined
    if (before) out.push({ id: `behind-${b.id}`, day: b.track, minute: b.end + 4, text: `close behind ${before}` })
  }
  return out
}

/* ── Where a drop sends a post ──────────────────────────────────────── */

export type Drop = { target: MoveTarget; slotted: boolean; dayId: string; time: string }

/**
 * A post dropped at a day and minute: into the slot of its channel standing
 * open at exactly that time (a `movePost` slot target, when that is the
 * slot's next occurrence, see `slotTargetOn`), else a one-off at that day
 * and time.
 */
export function dropTarget(post: { id: string; channel: string }, dayId: string, minute: number, week: Pick<LineupWeek, "slots" | "filled">, today: string): Drop {
  const time = hhmm(minute)
  const wd = weekdayOfKey(dayId)
  const slot = week.slots.find((s) => {
    if (s.channel !== post.channel || s.weekday !== wd || s.time !== time) return false
    const holder = week.filled[occurrenceKey(s.id, dayId)]
    return !holder || holder === post.id
  })
  if (!slot) return { target: { kind: "day", dayId, time }, slotted: false, dayId, time }
  return { ...slotTargetOn(slot, dayId, today), dayId, time }
}

/** The target that puts a post back where it was: its slot occurrence, or its day and time. */
export function targetOf(post: Pick<WeekPost, "id" | "channel" | "dayId" | "time" | "slotId">, week: Pick<LineupWeek, "slots" | "filled">, today: string): MoveTarget {
  if (post.slotId && week.slots.some((s) => s.id === post.slotId)) {
    return slotTargetOn({ id: post.slotId, time: post.time }, post.dayId, today).target
  }
  return { kind: "day", dayId: post.dayId, time: post.time }
}

/**
 * The local mirror of `movePost`: the post takes the day and time (and the
 * slot, when the target is one), and the slot occurrences it fills follow.
 */
export function moveLocally(week: LineupWeek, postId: string, drop: Drop): LineupWeek {
  const filled = Object.fromEntries(Object.entries(week.filled).filter(([, id]) => id !== postId))
  const slotId = drop.target.kind === "slot" ? drop.target.slotId : null
  if (slotId) filled[occurrenceKey(slotId, drop.dayId)] = postId
  const inWeek = weekDays(week.week).includes(drop.dayId)
  return {
    ...week,
    filled,
    posts: week.posts.flatMap((p) => (p.id !== postId ? [p] : inWeek ? [{ ...p, dayId: drop.dayId, time: drop.time, slotId }] : [])),
  }
}

/** The local mirror of `unschedulePost`: the row goes, its slot opens, and the version waits with no time. */
export function removeLocally(week: LineupWeek, postId: string): LineupWeek {
  const p = week.posts.find((x) => x.id === postId)
  return {
    ...week,
    filled: Object.fromEntries(Object.entries(week.filled).filter(([, id]) => id !== postId)),
    posts: week.posts.filter((x) => x.id !== postId),
    unplaced: p
      ? [
          ...week.unplaced,
          {
            versionId: p.versionId,
            channel: p.channel,
            channelLabel: p.channelLabel,
            body: p.body,
            opening: p.opening,
            reason: week.slots.some((s) => s.channel === p.channel) ? "slot-came-later" : "no-slot",
          },
        ]
      : week.unplaced,
  }
}

/**
 * Where ⇧J / ⇧K takes a queued post on its own channel: the next queued
 * post (they trade places, one `reorderLineup`) or the next open slot ahead
 * (`movePost`), later or earlier, never to a time that has passed.
 */
export function stepOnChannel(post: WeekPost, items: readonly Item[], dir: 1 | -1, clock: Clock): { kind: "swap"; with: WeekPost } | { kind: "slot"; open: OpenItem } | null {
  const here = at(post.dayId, post.time)
  const places = items
    .flatMap((i): { at: string; item: PostItem | OpenItem }[] => {
      if (i.channel !== post.channel) return []
      if (i.kind === "post" && i.post.id !== post.id && i.post.state === "queued") return [{ at: at(i.dayId, i.time), item: i }]
      if (i.kind === "open" && !i.passed) return [{ at: at(i.dayId, i.time), item: i }]
      return []
    })
    .filter((p) => !isPastAt(clock, p.item.dayId, p.item.time))
    .sort((a, b) => a.at.localeCompare(b.at))
  const next = dir > 0 ? places.find((p) => p.at > here) : places.filter((p) => p.at < here).pop()
  if (!next) return null
  return next.item.kind === "post" ? { kind: "swap", with: next.item.post } : { kind: "slot", open: next.item }
}

/* ── Saying it ──────────────────────────────────────────────────────── */

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Today 12:30", "Tomorrow 08:00", "Thu 08:00" inside the week from today, else "Thu 26 Nov 08:00". */
export function whenLabel(dayId: string, time: string, today: string) {
  if (dayId === today) return `Today ${time}`
  if (dayId === addDayKeys(today, 1)) return `Tomorrow ${time}`
  const d = new Date(`${dayId}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return time
  const short = WEEKDAY_SHORT[(d.getUTCDay() + 6) % 7]
  if (dayId > today && dayId < addDayKeys(today, 7)) return `${short} ${time}`
  return `${short} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${time}`
}

/** "today", "tomorrow", "on Thu", "on Thu 26 Nov": a day inside a sentence. */
export function onDay(dayId: string, today: string) {
  if (dayId === today) return "today"
  if (dayId === addDayKeys(today, 1)) return "tomorrow"
  return `on ${whenLabel(dayId, "", today).trim()}`
}

/** "Tue 08:00": a slot said by its weekday and time. */
export function slotLabel(slot: Pick<WeekSlot, "weekday" | "time">) {
  return `${WEEKDAY_SHORT[slot.weekday - 1]} ${slot.time}`
}

/** A quoted opening line, its trailing stop dropped so it reads as a quote. */
export const quoted = (t: string) => `“${t.replace(/[.!?:]+$/, "")}”`

/** A short opening for a button: cut at a word, with an ellipsis. */
export function clip(t: string, n = 28) {
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t.replace(/[.!?]+$/, "")
}

/** What a row or a block is called by: the post's opening, or the slot it stands for. */
export function titleOf(item: Item) {
  if (item.kind === "post") return item.post.opening
  if (item.kind === "unplaced") return item.unplaced.opening
  return item.passed ? `${item.channelLabel} slot, passed with nothing in it` : `Open ${item.channelLabel} slot`
}

/** The pane's strip over the picture: when, and what stands behind the time. */
export function stripOf(item: Item, today: string) {
  if (item.kind === "unplaced") return "Approved, waiting for a time"
  if (item.kind === "open") return `${whenLabel(item.dayId, item.time, today)} · your ${item.channelLabel} slot`
  const p = item.post
  const when = whenLabel(p.dayId, p.time, today)
  if (p.state === "published") return `Went out ${when}`
  if (p.state === "failed") return `Was due ${when}`
  if (p.state === "sending") return `Sending since ${p.time}`
  return `${when} · ${p.slotId ? "your slot" : "a one-off"}`
}

/** The one sentence of numbers for the toolbar: what this week holds and what still asks something of you. */
export function summaryOf(items: readonly Item[], slots: number) {
  let going = 0
  let failed = 0
  let openAhead = 0
  let waiting = 0
  for (const i of items) {
    if (i.kind === "post") {
      if (i.post.state === "failed") failed++
      else going++
    } else if (i.kind === "open") {
      if (!i.passed) openAhead++
    } else waiting++
  }
  return { going, failed, openAhead, waiting, slots }
}
