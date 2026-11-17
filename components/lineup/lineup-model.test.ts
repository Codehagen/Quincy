import { describe, expect, it } from "vitest"

import type { LineupWeek, WeekPost, WeekSlot } from "@/lib/lineup"

import {
  blocksOf,
  buildItems,
  closeBehind,
  dropTarget,
  isMovable,
  matches,
  moveLocally,
  removeLocally,
  stepOnChannel,
  summaryOf,
  weekNotes,
  whenLabel,
  type Clock,
} from "./lineup-model"

/**
 * A week of the shape `getLineupWeek` reads: Monday 16 November 2026, 14:20
 * on the account's clock, two X slots and one LinkedIn slot.
 */

const CLOCK: Clock = { day: "2026-11-16", time: "14:20" }
const MON = "2026-11-16"

const slot = (id: string, weekday: number, time: string, channel = "x"): WeekSlot => ({ id, channel, channelLabel: channel === "x" ? "X" : "LinkedIn", weekday, time })

const post = (id: string, dayId: string, time: string, extra: Partial<WeekPost> = {}): WeekPost => ({
  id,
  versionId: `v-${id}`,
  draftId: "d",
  idea: "An idea",
  channel: "x",
  channelLabel: "X",
  sourceId: "s",
  sourceLabel: "Notes",
  opening: `Opening of ${id}.`,
  time,
  state: "queued",
  url: null,
  error: null,
  dayId,
  body: `Opening of ${id}.\n\nThe rest.`,
  slotId: null,
  ...extra,
})

const SLOTS = [slot("mon-x", 1, "08:00"), slot("tue-x", 2, "08:00"), slot("thu-li", 4, "11:00", "linkedin")]

function week(over: Partial<LineupWeek> = {}): LineupWeek {
  return { week: MON, thisWeek: MON, posts: [], slots: SLOTS, filled: {}, unplaced: [], ...over }
}

describe("buildItems", () => {
  it("draws every slot occurrence nothing fills, and says which have passed", () => {
    const items = buildItems(week(), CLOCK)
    expect(items.map((i) => i.key)).toEqual(["slot:mon-x:2026-11-16", "slot:tue-x:2026-11-17", "slot:thu-li:2026-11-19"])
    expect(items.map((i) => i.kind === "open" && i.passed)).toEqual([true, false, false])
  })

  it("hides an occurrence its post fills", () => {
    const p = post("p1", "2026-11-17", "08:00", { slotId: "tue-x" })
    const items = buildItems(week({ posts: [p], filled: { "tue-x@2026-11-17": "p1" } }), CLOCK)
    expect(items.some((i) => i.key === "slot:tue-x:2026-11-17")).toBe(false)
    expect(items.some((i) => i.key === "p1")).toBe(true)
  })

  it("keeps an occurrence open when its post went out at another time", () => {
    // The row Post now used to leave: slot_id kept, sent early. `filled` (the read) does not count it.
    const p = post("p1", MON, "14:15", { slotId: "tue-x", state: "published" })
    const items = buildItems(week({ posts: [p] }), CLOCK)
    expect(items.some((i) => i.key === "slot:tue-x:2026-11-17")).toBe(true)
  })

  it("puts the approved posts with no time first, and a post before a slot at its minute", () => {
    const p = post("p1", "2026-11-17", "08:00")
    const u = { versionId: "v9", channel: "x", channelLabel: "X", body: "Waiting.", opening: "Waiting.", reason: "slot-came-later" as const }
    const items = buildItems(week({ posts: [p], unplaced: [u] }), CLOCK)
    expect(items[0]?.key).toBe("st:v9")
    const i = items.findIndex((x) => x.key === "p1")
    expect(items[i + 1]?.key).toBe("slot:tue-x:2026-11-17")
  })

  it("takes what the session learned about an unplaced post", () => {
    const u = { versionId: "v9", channel: "x", channelLabel: "X", body: "W.", opening: "W.", reason: "slot-came-later" as const }
    const [first] = buildItems(week({ unplaced: [u] }), CLOCK, { v9: "slots-full" })
    expect(first?.kind === "unplaced" && first.reason).toBe("slots-full")
  })
})

describe("filters", () => {
  it("hides what has settled under Still to go", () => {
    const items = buildItems(week({ posts: [post("sent", MON, "09:10", { state: "published" })] }), CLOCK)
    expect(items.filter((i) => matches(i, { channel: "all", show: "ahead" })).map((i) => i.key)).toEqual(["slot:tue-x:2026-11-17", "slot:thu-li:2026-11-19"])
    expect(items.filter((i) => matches(i, { channel: "linkedin", show: "all" })).map((i) => i.key)).toEqual(["slot:thu-li:2026-11-19"])
  })
})

describe("blocksOf", () => {
  it("draws a post at its minute, 45 minutes tall, and a slot dashed or passed", () => {
    const items = buildItems(week({ posts: [post("p1", "2026-11-20", "09:00")] }), CLOCK)
    const blocks = blocksOf(items)
    expect(blocks.find((b) => b.id === "p1")).toMatchObject({ track: "2026-11-20", start: 540, end: 585, variant: "post", state: "queued" })
    expect(blocks.find((b) => b.id === "slot:mon-x:2026-11-16")?.variant).toBe("passed")
    expect(blocks.find((b) => b.id === "slot:tue-x:2026-11-17")?.variant).toBe("slot")
  })

  it("never runs a late block past midnight", () => {
    const blocks = blocksOf(buildItems(week({ slots: [], posts: [post("late", "2026-11-20", "23:45")] }), CLOCK))
    expect(blocks[0]?.end).toBe(24 * 60)
  })
})

describe("isMovable", () => {
  it("moves a queued post still ahead, and nothing else", () => {
    const items = buildItems(week({ posts: [post("q", "2026-11-17", "08:00"), post("gone", MON, "09:00"), post("f", "2026-11-17", "10:00", { state: "failed" })] }), CLOCK)
    const by = (k: string) => items.find((i) => i.key === k)
    expect(isMovable(by("q"), CLOCK)).toBe(true)
    expect(isMovable(by("gone"), CLOCK)).toBe(false)
    expect(isMovable(by("f"), CLOCK)).toBe(false)
    expect(isMovable(by("slot:tue-x:2026-11-17"), CLOCK)).toBe(false)
  })
})

describe("Quincy's notes", () => {
  it("says close behind for a queued post under four hours after another on its channel", () => {
    const posts = [post("a", "2026-11-20", "09:00"), post("b", "2026-11-20", "12:00"), post("c", "2026-11-20", "17:00"), post("li", "2026-11-20", "09:30", { channel: "linkedin" })]
    expect([...closeBehind(posts)]).toEqual([["b", "09:00"]])
  })

  it("writes quiet day, next open slot and close behind, and never on today or the past", () => {
    const posts = [post("a", "2026-11-20", "09:00"), post("b", "2026-11-20", "11:00")]
    const items = buildItems(week({ posts }), CLOCK)
    const notes = weekNotes({ blocks: blocksOf(items), days: ["2026-11-15", MON, "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].slice(1), today: MON, posts, thisWeek: true })
    expect(notes.filter((n) => n.text === "quiet day").map((n) => n.day)).toEqual(["2026-11-18", "2026-11-21", "2026-11-22"])
    expect(notes.find((n) => n.text === "next open slot")).toMatchObject({ day: "2026-11-17", minute: 8 * 60 + 45 + 4 })
    expect(notes.find((n) => n.text.startsWith("close behind"))).toMatchObject({ day: "2026-11-20", text: "close behind 09:00" })
  })

  it("says no next open slot on another week", () => {
    const items = buildItems(week({ week: "2026-11-23" }), CLOCK)
    const notes = weekNotes({ blocks: blocksOf(items), days: [], today: MON, posts: [], thisWeek: false })
    expect(notes.some((n) => n.text === "next open slot")).toBe(false)
  })
})

describe("dropTarget", () => {
  const w = week()

  it("fills the open slot of its channel at exactly that time", () => {
    expect(dropTarget({ id: "p", channel: "x" }, "2026-11-17", 480, w, MON)).toEqual({ target: { kind: "slot", slotId: "tue-x" }, slotted: true, dayId: "2026-11-17", time: "08:00" })
  })

  it("is a one-off a minute off the slot, or on another channel's slot", () => {
    expect(dropTarget({ id: "p", channel: "x" }, "2026-11-17", 495, w, MON).target).toEqual({ kind: "day", dayId: "2026-11-17", time: "08:15" })
    expect(dropTarget({ id: "p", channel: "x" }, "2026-11-19", 660, w, MON).slotted).toBe(false)
  })

  it("does not take a slot another post fills", () => {
    const taken = week({ filled: { "tue-x@2026-11-17": "other" } })
    expect(dropTarget({ id: "p", channel: "x" }, "2026-11-17", 480, taken, MON).slotted).toBe(false)
  })

  it("is a one-off on a slot a week or more out (movePost would land it this week)", () => {
    expect(dropTarget({ id: "p", channel: "x" }, "2026-11-24", 480, w, MON)).toMatchObject({ slotted: false, target: { kind: "day" } })
  })
})

describe("the local mirrors", () => {
  it("moves a post into a slot, and frees the one it left", () => {
    const p = post("p1", "2026-11-17", "08:00", { slotId: "tue-x" })
    const w = week({ posts: [p], filled: { "tue-x@2026-11-17": "p1" } })
    const next = moveLocally(w, "p1", { target: { kind: "day", dayId: "2026-11-18", time: "10:00" }, slotted: false, dayId: "2026-11-18", time: "10:00" })
    expect(next.posts[0]).toMatchObject({ dayId: "2026-11-18", time: "10:00", slotId: null })
    expect(next.filled).toEqual({})
  })

  it("drops a post moved out of the week from it", () => {
    const w = week({ posts: [post("p1", "2026-11-17", "08:00")] })
    expect(moveLocally(w, "p1", { target: { kind: "day", dayId: "2026-11-24", time: "08:00" }, slotted: false, dayId: "2026-11-24", time: "08:00" }).posts).toEqual([])
  })

  it("sends a post back: the row goes and the version waits with no time", () => {
    const w = week({ posts: [post("p1", "2026-11-17", "08:00", { slotId: "tue-x" })], filled: { "tue-x@2026-11-17": "p1" } })
    const next = removeLocally(w, "p1")
    expect(next.posts).toEqual([])
    expect(next.filled).toEqual({})
    expect(next.unplaced[0]).toMatchObject({ versionId: "v-p1", reason: "slot-came-later" })
  })
})

describe("stepOnChannel", () => {
  it("trades places with the next queued post on its channel, or takes the next open slot", () => {
    const a = post("a", "2026-11-17", "08:00", { slotId: "tue-x" })
    const b = post("b", "2026-11-20", "09:00")
    const items = buildItems(week({ posts: [a, b], filled: { "tue-x@2026-11-17": "a" } }), CLOCK)
    expect(stepOnChannel(a, items, 1, CLOCK)).toMatchObject({ kind: "swap", with: { id: "b" } })
    expect(stepOnChannel(b, items, -1, CLOCK)).toMatchObject({ kind: "swap", with: { id: "a" } })
    expect(stepOnChannel(b, items, 1, CLOCK)).toBeNull()
  })

  it("never steps into a time that has passed", () => {
    const b = post("b", MON, "16:00")
    const items = buildItems(week({ posts: [b] }), CLOCK)
    // Monday's 08:00 slot passed this morning; nothing else is earlier.
    expect(stepOnChannel(b, items, -1, CLOCK)).toBeNull()
  })
})

describe("saying it", () => {
  it("says a time relative while relative is shorter", () => {
    expect(whenLabel(MON, "12:30", MON)).toBe("Today 12:30")
    expect(whenLabel("2026-11-17", "08:00", MON)).toBe("Tomorrow 08:00")
    expect(whenLabel("2026-11-19", "08:00", MON)).toBe("Thu 08:00")
    expect(whenLabel("2026-11-26", "08:00", MON)).toBe("Thu 26 Nov 08:00")
  })

  it("counts the week's sentence", () => {
    const items = buildItems(week({ posts: [post("a", "2026-11-17", "08:00"), post("f", MON, "12:30", { state: "failed" })] }), CLOCK)
    expect(summaryOf(items, 3)).toEqual({ going: 1, failed: 1, openAhead: 2, waiting: 0, slots: 3 })
  })
})
