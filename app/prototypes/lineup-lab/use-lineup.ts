"use client"

import * as React from "react"

import {
  BASELINE,
  CHANNEL_LABEL,
  DAYS,
  NOW,
  STARTER,
  WEEKDAY_SHORT,
  connectedFor,
  dayOf,
  weekFor,
  type Channel,
  type Day,
  type LabPost,
  type LabSlot,
  type LabWeek,
  type Scenario,
  type Stranded,
} from "./data"

/**
 * One local store for every layout, so a move in one shows in the next.
 * Each verb answers the way its server action does (app/(app)/lineup/
 * actions.ts, app/(app)/drafts/actions.ts) and calls none:
 *
 * - `move` is `movePost`: a queued post only, never to a time that has
 *   passed, a slot or a bare day and time.
 * - `shift` (⇧J / ⇧K) is `reorderLineup`: two posts trade places in one
 *   write, all or nothing; or `movePost` into the next open slot.
 * - `unschedule` is `unschedulePost`: the row goes, the version stays
 *   approved and waits on Drafts for a time.
 * - `place` is `placeApprovedVersion`: the next free slot for the channel.
 * - `postNow` is `postNow` (sendNow): now, after a confirmation; a failed
 *   post goes back to queued and is sent again.
 * - `addSlot`, `deleteSlot`, `takeStarter` are `createSlot`, `deleteSlot`,
 *   `applyStarterRhythm`.
 *
 * What none of them does today is marked "proposed" in DECISION.md: undo
 * of Back to Drafts, placing an approved post into a chosen slot, the
 * stranded tray on this page, the margin notes.
 */

export type Phase = "live" | "loading"

/** A slot target names the slot; `dayId` picks its occurrence in another week (the calendar), else this week's. */
export type Target = { kind: "slot"; slotId: string; dayId?: string } | { kind: "day"; dayId: string; time: string }

export type OpenSlot = { slot: LabSlot; day: Day; passed: boolean }

export type Item =
  | { kind: "post"; key: string; dayId: string; time: string; channel: Channel; post: LabPost }
  | { kind: "open"; key: string; dayId: string; time: string; channel: Channel; slot: LabSlot; passed: boolean }
  | { kind: "stranded"; key: string; dayId: ""; time: ""; channel: Channel; s: Stranded }

export type ChannelFilter = "all" | Channel
export type ShowFilter = "all" | "ahead"
export type Filters = { channel: ChannelFilter; show: ShowFilter }

export type Notice = { text: string; undo: boolean }

type Undo =
  | { kind: "move"; label: string; restore: { id: string; dayId: string; time: string; slotId: string | null }[] }
  | { kind: "unschedule"; label: string; post: LabPost }
  | { kind: "place"; label: string; postId: string; s: Stranded }

const at = (dayId: string, time: string) => `${dayId} ${time}`
export const isPast = (dayId: string, time: string) => at(dayId, time) <= at(NOW.dayId, NOW.time)

/** Strip a trailing stop so a quoted opening reads as a quote. */
export const quoted = (t: string) => `“${t.replace(/[.!?:]+$/, "")}”`

export const openingOf = (body: string) => body.split("\n")[0] ?? ""

export function slotDay(slot: LabSlot): Day {
  return DAYS.find((d) => d.weekday === slot.weekday)!
}

export function slotLabel(slot: LabSlot) {
  return `${WEEKDAY_SHORT[slot.weekday - 1]} ${slot.time}`
}

/** "Tue 08:00", or "Today 12:30" / "Tomorrow 08:00" while relative is shorter. */
export function whenLabel(dayId: string, time: string) {
  const d = dayOf(dayId)
  if (!d) {
    const date = new Date(`${dayId}T12:00:00Z`)
    if (Number.isNaN(date.getTime())) return time
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${WEEKDAY_SHORT[(date.getUTCDay() + 6) % 7]} ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${time}`
  }
  return `${d.label === "Today" || d.label === "Tomorrow" ? d.label : d.short} ${time}`
}

export function useLineup({ scenario, phase }: { scenario: Scenario; phase: Phase }) {
  const [week, setWeek] = React.useState<LabWeek>(() => weekFor(scenario))
  const [forScenario, setForScenario] = React.useState(scenario)
  if (forScenario !== scenario) {
    setForScenario(scenario)
    setWeek(weekFor(scenario))
  }
  const [filters, setFilters] = React.useState<Filters>({ channel: "all", show: "all" })
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const [undoable, setUndoable] = React.useState<Undo | null>(null)
  /** The post whose Move menu is open (M), and the one whose Post now is asking (P). */
  const [menu, setMenu] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<string | null>(null)
  const [rhythmOpen, setRhythmOpen] = React.useState(false)

  const { slots, posts, stranded } = week
  const connected = connectedFor(scenario)

  /* ── Derived: the week as items ───────────────────────────────────── */

  const filledBy = React.useMemo(() => {
    const m = new Map<string, string>()
    // This week's occurrence only: a slot is weekly, so last week's post does not fill it.
    for (const p of posts) if (p.slotId && dayOf(p.dayId)) m.set(p.slotId, p.id)
    return m
  }, [posts])

  const openSlots = React.useMemo<OpenSlot[]>(
    () =>
      slots
        .filter((s) => !filledBy.has(s.id))
        .map((s) => {
          const day = slotDay(s)
          return { slot: s, day, passed: isPast(day.id, s.time) }
        })
        .sort((a, b) => at(a.day.id, a.slot.time).localeCompare(at(b.day.id, b.slot.time))),
    [slots, filledBy]
  )

  const allItems = React.useMemo<Item[]>(() => {
    const timed: Item[] = [
      ...posts.filter((p) => dayOf(p.dayId)).map((p) => ({ kind: "post" as const, key: p.id, dayId: p.dayId, time: p.time, channel: p.channel, post: p })),
      ...openSlots.map((o) => ({ kind: "open" as const, key: `slot:${o.slot.id}`, dayId: o.day.id, time: o.slot.time, channel: o.slot.channel, slot: o.slot, passed: o.passed })),
    ].sort((a, b) => at(a.dayId, a.time).localeCompare(at(b.dayId, b.time)) || (a.kind === "post" ? -1 : 1))
    const waiting: Item[] = stranded.map((s) => ({ kind: "stranded" as const, key: `st:${s.versionId}`, dayId: "" as const, time: "" as const, channel: s.channel, s }))
    return [...waiting, ...timed]
  }, [posts, openSlots, stranded])

  const items = React.useMemo(
    () =>
      allItems.filter((i) => {
        if (filters.channel !== "all" && i.channel !== filters.channel) return false
        if (filters.show === "ahead") {
          if (i.kind === "post" && i.post.state === "published") return false
          if (i.kind === "open" && i.passed) return false
        }
        return true
      }),
    [allItems, filters]
  )

  const timeline = React.useMemo(() => items.filter((i) => i.kind !== "stranded"), [items])
  const waiting = React.useMemo(() => items.filter((i): i is Extract<Item, { kind: "stranded" }> => i.kind === "stranded"), [items])

  const byDay = React.useMemo(() => DAYS.map((day) => ({ day, items: timeline.filter((i) => i.dayId === day.id) })), [timeline])

  const firstQueued = items.find((i) => i.kind === "post" && i.post.state === "queued")?.key ?? items[0]?.key ?? null
  // A post outside this week (the calendar's other weeks) is still a post the keys act on.
  const outside = selectedKey ? posts.find((p) => p.id === selectedKey && !dayOf(p.dayId)) : undefined
  const selected: Item | null =
    items.find((i) => i.key === selectedKey) ??
    (outside ? { kind: "post", key: outside.id, dayId: outside.dayId, time: outside.time, channel: outside.channel, post: outside } : null)

  /* ── Quincy's notes (proposed): facts about the week, never a verdict ── */

  const notes = React.useMemo(() => {
    const out: Record<string, string> = {}
    const queued = posts.filter((p) => p.state === "queued").sort((a, b) => at(a.dayId, a.time).localeCompare(at(b.dayId, b.time)))
    for (let i = 1; i < queued.length; i++) {
      const a = queued[i - 1]!
      const b = queued[i]!
      if (a.dayId !== b.dayId || a.channel !== b.channel) continue
      const gap = minutes(b.time) - minutes(a.time)
      if (gap < 4 * 60) out[b.id] = `${hours(gap)} after the ${a.time} ${CHANNEL_LABEL[a.channel]} post.`
    }
    const nextOpen = openSlots.find((o) => !o.passed)
    for (const o of openSlots) {
      out[`slot:${o.slot.id}`] = o.passed
        ? `Passed empty at ${o.slot.time}.`
        : o === nextOpen
          ? "The next open slot. An approval lands here."
          : "Open. An approval lands here after the slots before it."
    }
    for (const s of stranded) {
      out[`st:${s.versionId}`] =
        s.reason === "slots-full"
          ? `Every ${CHANNEL_LABEL[s.channel]} slot is taken for two weeks.`
          : s.reason === "no-slot"
            ? `No ${CHANNEL_LABEL[s.channel]} slot yet.`
            : s.reason === "sent-back"
              ? "Sent back from this week. Still approved."
              : "Approved before the slot existed."
    }
    return out
  }, [posts, openSlots, stranded])

  /** The days ahead with nothing going out on any channel and no open slot: the gaps. */
  const quietDays = React.useMemo(
    () => DAYS.filter((d) => d.id > NOW.dayId && !posts.some((p) => p.dayId === d.id) && !openSlots.some((o) => o.day.id === d.id)).map((d) => d.id),
    [posts, openSlots]
  )

  /* ── Verbs ────────────────────────────────────────────────────────── */

  const say = React.useCallback((text: string, undo = false) => setNotice({ text, undo }), [])
  const dismissNotice = React.useCallback(() => setNotice(null), [])

  const refuseMove = (p: LabPost | undefined, target: Target): string | null => {
    if (!p || p.state !== "queued") return "That post has changed since the page loaded. Nothing moved."
    if (target.kind === "slot") {
      const s = slots.find((x) => x.id === target.slotId)
      if (!s) return "That slot is gone. Nothing moved."
      if (s.channel !== p.channel) return `That is a ${CHANNEL_LABEL[s.channel]} slot. Nothing moved.`
      const day = target.dayId ?? slotDay(s).id
      const holder = posts.find((x) => x.slotId === s.id && x.dayId === day)
      if (holder && holder.id !== p.id) return "That slot is taken. Nothing moved."
      if (isPast(day, s.time)) return "That time has already passed. Pick a later one: a post moved there would go out straight away."
    } else if (isPast(target.dayId, target.time)) {
      return "That time has already passed. Pick a later one: a post moved there would go out straight away."
    }
    return null
  }

  const resolve = (target: Target) => {
    if (target.kind === "slot") {
      const s = slots.find((x) => x.id === target.slotId)!
      return { dayId: target.dayId ?? slotDay(s).id, time: s.time, slotId: s.id }
    }
    return { dayId: target.dayId, time: target.time, slotId: null }
  }

  const move = (postId: string, target: Target) => {
    const p = posts.find((x) => x.id === postId)
    const refusal = refuseMove(p, target)
    if (refusal || !p) {
      say(refusal ?? "Nothing moved.")
      return false
    }
    const to = resolve(target)
    setWeek((w) => ({ ...w, posts: w.posts.map((x) => (x.id === postId ? { ...x, ...to } : x)) }))
    setUndoable({ kind: "move", label: openingOf(p.body), restore: [{ id: p.id, dayId: p.dayId, time: p.time, slotId: p.slotId }] })
    say(`Moved ${quoted(openingOf(p.body))} to ${whenLabel(to.dayId, to.time)}.`, true)
    setSelectedKey(postId)
    return true
  }

  /** The places a post can step to on its own channel: the other queued posts and the open slots still ahead. */
  const placesFor = (p: LabPost) =>
    [
      ...posts.filter((q) => q.id !== p.id && q.channel === p.channel && q.state === "queued").map((q) => ({ at: at(q.dayId, q.time), post: q, slot: null })),
      ...openSlots.filter((o) => !o.passed && o.slot.channel === p.channel).map((o) => ({ at: at(o.day.id, o.slot.time), post: null, slot: o.slot })),
    ].sort((a, b) => a.at.localeCompare(b.at))

  const shift = (postId: string, dir: 1 | -1) => {
    const p = posts.find((x) => x.id === postId)
    if (!p || p.state !== "queued") {
      say("Only a queued post moves. Nothing moved.")
      return
    }
    const here = at(p.dayId, p.time)
    const places = placesFor(p)
    const next = dir > 0 ? places.find((x) => x.at > here) : places.filter((x) => x.at < here && !isPast(x.at.slice(0, 10), x.at.slice(11))).pop()
    if (!next) {
      say(`Nothing ${dir > 0 ? "later" : "earlier"} on ${CHANNEL_LABEL[p.channel]} this week. Nothing moved.`)
      return
    }
    if (next.slot) {
      move(p.id, { kind: "slot", slotId: next.slot.id })
      return
    }
    swap(p.id, next.post!.id)
  }

  /** Two queued posts on one channel trade day, time and slot: one `reorderLineup`, both or neither. */
  const swap = (aId: string, bId: string) => {
    const p = posts.find((x) => x.id === aId)
    const q = posts.find((x) => x.id === bId)
    if (!p || !q || p.state !== "queued" || q.state !== "queued") {
      say("One of these posts has changed since the page loaded. Nothing moved.")
      return
    }
    if (p.channel !== q.channel) {
      say(`Those are on two channels. Move it into an open ${CHANNEL_LABEL[p.channel]} slot instead.`)
      return
    }
    if (isPast(p.dayId, p.time) || isPast(q.dayId, q.time)) {
      say("A place in that order has already passed, so nothing moved.")
      return
    }
    setWeek((w) => ({
      ...w,
      posts: w.posts.map((x) =>
        x.id === p.id ? { ...x, dayId: q.dayId, time: q.time, slotId: q.slotId } : x.id === q.id ? { ...x, dayId: p.dayId, time: p.time, slotId: p.slotId } : x
      ),
    }))
    setUndoable({
      kind: "move",
      label: openingOf(p.body),
      restore: [
        { id: p.id, dayId: p.dayId, time: p.time, slotId: p.slotId },
        { id: q.id, dayId: q.dayId, time: q.time, slotId: q.slotId },
      ],
    })
    say(`${quoted(openingOf(p.body))} now goes ${whenLabel(q.dayId, q.time)}, and ${quoted(openingOf(q.body))} takes ${whenLabel(p.dayId, p.time)}.`, true)
    setSelectedKey(p.id)
  }

  const unschedule = (postId: string) => {
    const p = posts.find((x) => x.id === postId)
    if (!p || (p.state !== "queued" && p.state !== "failed")) return
    const i = items.findIndex((x) => x.key === postId)
    const after = items[i + 1]?.key ?? items[i - 1]?.key ?? null
    setWeek((w) => ({
      ...w,
      posts: w.posts.filter((x) => x.id !== postId),
      stranded: [...w.stranded, { versionId: p.versionId, idea: p.idea, channel: p.channel, body: p.body, reason: "sent-back" }],
    }))
    setUndoable({ kind: "unschedule", label: openingOf(p.body), post: p })
    say(`Sent ${quoted(openingOf(p.body))} back to Drafts. It is still approved and waits there for a time.`, true)
    setSelectedKey(after)
  }

  /** The next free slot on the channel, this week (or next, past what the page shows). Or into the slot named. */
  const place = (versionId: string, slotId?: string) => {
    const s = stranded.find((x) => x.versionId === versionId)
    if (!s) return
    const free = openSlots.filter((o) => !o.passed && o.slot.channel === s.channel && (!slotId || o.slot.id === slotId))
    const pick = free[0]
    if (!slots.some((x) => x.channel === s.channel)) {
      say(`No ${CHANNEL_LABEL[s.channel]} slot yet, so it has no time. Add one with S, or send it now.`)
      return
    }
    if (!pick) {
      if (week.nextWeekFull) {
        setWeek((w) => ({ ...w, stranded: w.stranded.map((x) => (x.versionId === versionId ? { ...x, reason: "slots-full" } : x)) }))
        say(`Every ${CHANNEL_LABEL[s.channel]} slot is taken for the next two weeks. Free one, add one with S, or send it now.`)
        return
      }
      const first = slots.filter((x) => x.channel === s.channel).sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time))[0]!
      setWeek((w) => ({ ...w, stranded: w.stranded.filter((x) => x.versionId !== versionId) }))
      say(`${quoted(openingOf(s.body))} takes next ${slotLabel(first)}. That is past the week this page shows.`)
      return
    }
    const id = `placed-${versionId}`
    const newPost: LabPost = { id, versionId, idea: s.idea, channel: s.channel, body: s.body, dayId: pick.day.id, time: pick.slot.time, slotId: pick.slot.id, state: "queued", url: null, error: null }
    setWeek((w) => ({ ...w, posts: [...w.posts, newPost], stranded: w.stranded.filter((x) => x.versionId !== versionId) }))
    setUndoable({ kind: "place", label: openingOf(s.body), postId: id, s })
    say(`${quoted(openingOf(s.body))} goes out ${whenLabel(pick.day.id, pick.slot.time)}.`, true)
    setSelectedKey(id)
  }

  /**
   * Proposed: an approved post with no time, dropped at a day and time of
   * your choosing (the calendar's tray). The server has only the next free
   * slot (`placeApprovedVersion`); this is that plus a `movePost`. It fills
   * a slot when one of its channel stands open at exactly that time.
   */
  const placeAt = (versionId: string, dayId: string, time: string) => {
    const s = stranded.find((x) => x.versionId === versionId)
    if (!s) return false
    if (isPast(dayId, time)) {
      say("That time has already passed. Pick a later one: a post put there would go out straight away.")
      return false
    }
    const weekday = new Date(`${dayId}T12:00:00Z`).getUTCDay() || 7
    const slot = slots.find((x) => x.channel === s.channel && x.weekday === weekday && x.time === time && !posts.some((p) => p.slotId === x.id && p.dayId === dayId))
    const id = `placed-${versionId}`
    const newPost: LabPost = { id, versionId, idea: s.idea, channel: s.channel, body: s.body, dayId, time, slotId: slot?.id ?? null, state: "queued", url: null, error: null }
    setWeek((w) => ({ ...w, posts: [...w.posts, newPost], stranded: w.stranded.filter((x) => x.versionId !== versionId) }))
    setUndoable({ kind: "place", label: openingOf(s.body), postId: id, s })
    say(`${quoted(openingOf(s.body))} goes out ${whenLabel(dayId, time)}${slot ? ", in your slot" : ""}.`, true)
    setSelectedKey(id)
    return true
  }

  /** Post now: sending (the dot) at once, then the receipt. A failed post is sent again. */
  const postNow = (key: string) => {
    setConfirm(null)
    const p = posts.find((x) => x.id === key)
    const s = key.startsWith("st:") ? stranded.find((x) => `st:${x.versionId}` === key) : undefined
    if (!p && !s) return
    if (p && p.state !== "queued" && p.state !== "failed") return
    const id = p ? p.id : `now-${s!.versionId}`
    const text = p ? p.body : s!.body
    const sending: LabPost = p
      ? { ...p, dayId: NOW.dayId, time: NOW.time, slotId: null, state: "sending", error: null }
      : { id, versionId: s!.versionId, idea: s!.idea, channel: s!.channel, body: s!.body, dayId: NOW.dayId, time: NOW.time, slotId: null, state: "sending", url: null, error: null }
    setWeek((w) => ({
      ...w,
      posts: p ? w.posts.map((x) => (x.id === id ? sending : x)) : [...w.posts, sending],
      stranded: s ? w.stranded.filter((x) => x.versionId !== s.versionId) : w.stranded,
    }))
    setUndoable(null)
    setSelectedKey(id)
    say(`Posting ${quoted(openingOf(text))} now.`)
    window.setTimeout(() => {
      setWeek((w) => ({ ...w, posts: w.posts.map((x) => (x.id === id && x.state === "sending" ? { ...x, state: "published", url: `https://x.com/${"christer"}/status/${id}` } : x)) }))
      setNotice({ text: `Posted ${quoted(openingOf(text))}. Quincy can't unsend it.`, undo: false })
    }, 1400)
  }

  const undo = () => {
    const u = undoable
    if (!u) return null
    if (u.kind === "move") {
      if (u.restore.some((r) => isPast(r.dayId, r.time))) {
        say("Its old time has passed, so it stays where it is.")
        setUndoable(null)
        return null
      }
      setWeek((w) => ({ ...w, posts: w.posts.map((x) => ({ ...x, ...(u.restore.find((r) => r.id === x.id) ?? {}) })) }))
      say(`Put ${quoted(u.label)} back.`)
      setSelectedKey(u.restore[0]!.id)
    } else if (u.kind === "unschedule") {
      setWeek((w) => ({ ...w, posts: [...w.posts, u.post], stranded: w.stranded.filter((x) => x.versionId !== u.post.versionId) }))
      say(`Put ${quoted(u.label)} back in ${whenLabel(u.post.dayId, u.post.time)}.`)
      setSelectedKey(u.post.id)
    } else {
      setWeek((w) => ({ ...w, posts: w.posts.filter((x) => x.id !== u.postId), stranded: [...w.stranded, u.s] }))
      say(`${quoted(u.label)} has no time again.`)
      setSelectedKey(`st:${u.s.versionId}`)
    }
    setUndoable(null)
    return u
  }

  const addSlot = (channel: Channel, weekday: number, time: string) => {
    if (slots.some((s) => s.channel === channel && s.weekday === weekday && s.time === time)) return
    const s: LabSlot = { id: `s-${channel}-${weekday}-${time}`, channel, weekday, time }
    setWeek((w) => ({ ...w, slots: [...w.slots, s] }))
    say(`Added ${slotLabel(s)} on ${CHANNEL_LABEL[channel]}. It is a time you publish every week.`)
  }

  /** The posts in it keep their time and become one-offs (`ON DELETE SET NULL`). */
  const deleteSlot = (id: string) => {
    const s = slots.find((x) => x.id === id)
    if (!s) return
    setWeek((w) => ({ ...w, slots: w.slots.filter((x) => x.id !== id), posts: w.posts.map((p) => (p.slotId === id ? { ...p, slotId: null } : p)) }))
    say(`Removed ${slotLabel(s)} on ${CHANNEL_LABEL[s.channel]}. Anything in it keeps its time.`)
  }

  const takeStarter = () => {
    const add: LabSlot[] = connected.flatMap((c) => STARTER.map((r) => ({ id: `starter-${c}-${r.weekday}`, channel: c, weekday: r.weekday, time: r.time })))
    setWeek((w) => ({ ...w, slots: [...w.slots, ...add] }))
    say("Your rhythm: Tuesday and Thursday at 08:00. Approve a draft and it takes the next one.")
  }

  const reset = () => {
    setWeek(weekFor(scenario))
    setSelectedKey(null)
    setNotice(null)
    setUndoable(null)
  }

  /* ── Selection ────────────────────────────────────────────────────── */

  const select = React.useCallback((key: string | null) => setSelectedKey(key), [])

  const step = (by: 1 | -1, within?: (i: Item) => boolean) => {
    const list = within ? items.filter(within) : items
    if (list.length === 0) return null
    const current = selected ?? list.find((i) => i.key === firstQueued) ?? null
    const i = current ? list.indexOf(current) : -1
    const next = list[Math.min(list.length - 1, Math.max(0, i < 0 ? 0 : i + by))]!
    setSelectedKey(next.key)
    return next.key
  }

  /* ── The one sentence of numbers ──────────────────────────────────── */

  const thisWeek = posts.filter((p) => dayOf(p.dayId))
  const goingThisWeek = thisWeek.filter((p) => p.state !== "failed").length
  const failed = thisWeek.filter((p) => p.state === "failed").length
  const openAhead = openSlots.filter((o) => !o.passed).length

  return {
    phase,
    scenario,
    connected,
    slots,
    posts,
    stranded,
    items,
    timeline,
    waiting,
    byDay,
    openSlots,
    quietDays,
    notes,
    filters,
    setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v })),
    clearFilters: () => setFilters({ channel: "all", show: "all" }),
    selectedKey,
    selected: selected ?? (selectedKey === null ? (items.find((i) => i.key === firstQueued) ?? null) : null),
    select,
    step,
    move,
    shift,
    swap,
    selectGhost: () => setSelectedKey(""),
    unschedule,
    place,
    placeAt,
    postNow,
    undo,
    canUndo: undoable != null,
    addSlot,
    deleteSlot,
    takeStarter,
    notice,
    dismissNotice,
    menu,
    setMenu,
    confirm,
    setConfirm,
    rhythmOpen,
    setRhythmOpen,
    reset,
    filledBy,
    summary: { goingThisWeek, failed, openAhead, baseline: BASELINE.perWeek, slots: slots.length, waiting: stranded.length },
    nothingAtAll: slots.length === 0 && posts.length === 0 && stranded.length === 0,
  }
}

export type LineupStore = ReturnType<typeof useLineup>

function minutes(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h! * 60 + m!
}

function hours(min: number) {
  if (min < 60) return `${min} minutes`
  const h = Math.round(min / 60)
  return h === 1 ? "An hour" : `${["Two", "Three", "Four"][h - 2] ?? h} hours`
}

/** The channels' slots in the order a week runs, for the rhythm dialog. */
export function sortedSlots(slots: readonly LabSlot[]) {
  return [...slots].sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time) || a.channel.localeCompare(b.channel))
}
