import { describe, expect, it } from "vitest"

import {
  addDayKeys,
  filledOccurrences,
  mondayOf,
  occurrenceKey,
  slotTargetOn,
  weekDays,
} from "./lineup-week"
import { requeuedForNow } from "./publish-run"
import { instantOf, parseDayKey } from "./timezone"

/**
 * "Is this slot filled?", asked the way `nextFreeSlot` asks it: by the
 * slot's own instant, never by `slot_id` alone. The bug these pin: Post now
 * kept `slot_id`, so /lineup drew a slot as taken that the next approval
 * then filled.
 */

const ZONE = "Europe/Oslo"
const TUE = "2026-11-17"
const MON = "2026-11-16"
const days = weekDays(MON).map((d) => parseDayKey(d)!)
const TUE_SLOT = { id: "slot_tue", weekday: 2, timeOfDay: "08:00" }
const tueAt = (time: string) => {
  const [hour, minute] = time.split(":").map(Number)
  return instantOf({ ...parseDayKey(TUE)!, hour: hour!, minute: minute! }, ZONE)
}

describe("filledOccurrences", () => {
  it("fills the occurrence a post goes out at", () => {
    const filled = filledOccurrences([{ id: "p1", slotId: TUE_SLOT.id, scheduledFor: tueAt("08:00") }], [TUE_SLOT], days, ZONE)
    expect(filled.get(occurrenceKey(TUE_SLOT.id, TUE))).toBe("p1")
  })

  it("leaves the slot open when its post was sent at another time", () => {
    // Sent on Monday at 14:20 from Tuesday's slot, with slot_id kept: the
    // row as Post now used to leave it.
    const sentEarly = instantOf({ ...parseDayKey(MON)!, hour: 14, minute: 20 }, ZONE)
    const filled = filledOccurrences([{ id: "p1", slotId: TUE_SLOT.id, scheduledFor: sentEarly }], [TUE_SLOT], days, ZONE)
    expect(filled.has(occurrenceKey(TUE_SLOT.id, TUE))).toBe(false)
  })

  it("does not let a one-off at the slot's time fill it", () => {
    const filled = filledOccurrences([{ id: "p1", slotId: null, scheduledFor: tueAt("08:00") }], [TUE_SLOT], days, ZONE)
    expect(filled.size).toBe(0)
  })

  it("reads the slot's time in the account's zone, not UTC", () => {
    // 08:00 in Oslo is 07:00 UTC in November.
    const utcEight = new Date(`${TUE}T08:00:00Z`)
    const filled = filledOccurrences([{ id: "p1", slotId: TUE_SLOT.id, scheduledFor: utcEight }], [TUE_SLOT], days, ZONE)
    expect(filled.size).toBe(0)
  })
})

describe("requeuedForNow", () => {
  it("takes a post sent now out of its slot", () => {
    const now = new Date("2026-11-16T13:20:00Z")
    expect(requeuedForNow(now)).toEqual({ scheduledFor: now, state: "queued", lastError: null, slotId: null })
  })

  it("leaves the slot it left free for the next placement", () => {
    // The row after Post now: its slot cleared. The occurrence reads open,
    // as `nextFreeSlot` would place into it.
    const now = new Date("2026-11-16T13:20:00Z")
    const row = { id: "p1", ...requeuedForNow(now) }
    const filled = filledOccurrences([row], [TUE_SLOT], days, ZONE)
    expect(filled.has(occurrenceKey(TUE_SLOT.id, TUE))).toBe(false)
  })
})

describe("the week", () => {
  it("starts on the Monday of any day in it", () => {
    expect(mondayOf("2026-11-22")).toBe(MON)
    expect(mondayOf(MON)).toBe(MON)
    expect(mondayOf("2026-11-23")).toBe("2026-11-23")
    expect(mondayOf("not a day")).toBeNull()
  })

  it("has seven days, across a month's end", () => {
    expect(weekDays("2026-11-30")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"])
  })

  it("adds days across a year's end", () => {
    expect(addDayKeys("2026-12-31", 1)).toBe("2027-01-01")
  })
})

describe("slotTargetOn", () => {
  const slot = { id: "slot_tue", time: "08:00" }

  it("fills the slot when the day is its next occurrence", () => {
    expect(slotTargetOn(slot, TUE, MON)).toEqual({ target: { kind: "slot", slotId: "slot_tue" }, slotted: true })
  })

  it("puts a post a week out at the time, as a one-off", () => {
    // `movePost` would resolve a slot target to this week's Tuesday.
    expect(slotTargetOn(slot, "2026-11-24", MON)).toEqual({
      target: { kind: "day", dayId: "2026-11-24", time: "08:00" },
      slotted: false,
    })
  })

  it("counts today as the next occurrence", () => {
    expect(slotTargetOn(slot, TUE, TUE).slotted).toBe(true)
  })
})
