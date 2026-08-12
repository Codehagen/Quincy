import { describe, expect, it } from "vitest"

import { ZONES, timeIn, zoneLabel, zoneOptions } from "@/lib/zones"

// A fixed instant, in July, so the northern-hemisphere zones are on summer time
// and the offsets below are the ones that actually move twice a year.
const SUMMER = new Date("2026-07-15T12:00:00Z")
const WINTER = new Date("2026-01-15T12:00:00Z")

describe("zoneOptions", () => {
  it("returns the list unchanged when the zone is already in it", () => {
    expect(zoneOptions("Europe/Oslo")).toBe(ZONES)
  })

  it("puts an unlisted zone at the top rather than dropping it", () => {
    // A select whose value is not among its options renders empty. Kiritimati
    // is a real place with real people and is not in the curated 25.
    const options = zoneOptions("Pacific/Kiritimati")

    expect(options[0]).toBe("Pacific/Kiritimati")
    expect(options).toHaveLength(ZONES.length + 1)
    expect(options).toContain("Europe/Oslo")
  })

  it("does not mutate the shared list when it prepends", () => {
    zoneOptions("Pacific/Kiritimati")
    expect(ZONES).not.toContain("Pacific/Kiritimati")
  })
})

describe("zoneLabel", () => {
  it("writes the offset beside the identifier", () => {
    expect(zoneLabel("Europe/Oslo", SUMMER)).toBe("Europe/Oslo · GMT+2")
    expect(zoneLabel("America/New_York", SUMMER)).toBe(
      "America/New York · GMT-4"
    )
  })

  it("follows the clocks rather than storing one offset", () => {
    expect(zoneLabel("Europe/Oslo", WINTER)).toBe("Europe/Oslo · GMT+1")
    expect(zoneLabel("America/New_York", WINTER)).toBe(
      "America/New York · GMT-5"
    )
  })

  it("returns the raw identifier rather than throwing on an unknown one", () => {
    expect(zoneLabel("Not/AZone", SUMMER)).toBe("Not/AZone")
  })
})

describe("timeIn", () => {
  it("gives the wall clock in the zone", () => {
    expect(timeIn("Europe/Oslo", SUMMER)).toBe("14:00")
    expect(timeIn("Asia/Tokyo", SUMMER)).toBe("21:00")
    expect(timeIn("America/Los_Angeles", SUMMER)).toBe("05:00")
  })

  it("does not throw on an unknown zone", () => {
    expect(timeIn("Not/AZone", SUMMER)).toBe("—")
  })
})
