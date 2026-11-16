import { describe, expect, it } from "vitest"

import {
  describeWait,
  rankWaitingRiffs,
  sourceNoun,
  type DeskAngle,
} from "./waiting-work"

/**
 * The rows come out of one join, so a fixture is one angle of one riff. The
 * defaults describe the live shape measured on 2026-09-09: a merged pull
 * request, `ready`, beats extracted, nothing drafted from it.
 */
const angle = (over: Partial<DeskAngle> = {}): DeskAngle => ({
  riffId: "rif_a",
  sourceId: "github",
  sourceLabel: "Pull request",
  createdAt: new Date("2026-08-26T09:28:50Z"),
  beats: true,
  hook: "I fixed the action row breaking button labels in narrow panels.",
  position: 0,
  drafted: false,
  ...over,
})

describe("rankWaitingRiffs", () => {
  /**
   * The live desk on 2026-09-09, reduced to the two riffs that decide the
   * rule. `rif_old` is the oldest thing waiting (26 August 08:08) and already
   * carries one draft — the owner opened it and took an angle. `rif_next`
   * (26 August 09:28) has never been touched. The offer is the untouched one.
   */
  it("offers the riff nobody has drafted from before the older one they mined", () => {
    const picks = rankWaitingRiffs([
      angle({
        riffId: "rif_old",
        createdAt: new Date("2026-08-26T08:08:01Z"),
        hook: "I shipped a Context tab.",
        position: 0,
      }),
      angle({
        riffId: "rif_old",
        createdAt: new Date("2026-08-26T08:08:01Z"),
        hook: "I ran 3,847 tests before shipping it.",
        position: 1,
        drafted: true,
      }),
      angle({ riffId: "rif_next" }),
    ])

    expect(picks.map((pick) => pick.riffId)).toEqual(["rif_next", "rif_old"])
    expect(picks[0].untouched).toBe(true)
    expect(picks[1].untouched).toBe(false)
  })

  it("puts the longest wait first among riffs nobody has touched", () => {
    const picks = rankWaitingRiffs([
      angle({ riffId: "rif_new", createdAt: new Date("2026-08-31T20:02:01Z") }),
      angle({ riffId: "rif_old", createdAt: new Date("2026-08-26T09:28:50Z") }),
      angle({ riffId: "rif_mid", createdAt: new Date("2026-08-28T08:25:44Z") }),
    ])

    expect(picks.map((pick) => pick.riffId)).toEqual([
      "rif_old",
      "rif_mid",
      "rif_new",
    ])
  })

  it("drops a riff whose every angle has been written", () => {
    expect(
      rankWaitingRiffs([
        angle({ riffId: "rif_done", drafted: true }),
        angle({
          riffId: "rif_done",
          hook: "The other one.",
          position: 1,
          drafted: true,
        }),
      ])
    ).toEqual([])
  })

  it("leads with the lowest-positioned angle nobody has drafted", () => {
    const [pick] = rankWaitingRiffs([
      angle({ hook: "Already written.", position: 0, drafted: true }),
      angle({ hook: "Still open.", position: 1 }),
      angle({ hook: "Also open.", position: 2 }),
    ])

    expect(pick.hook).toBe("Still open.")
    expect(pick.openAngles).toBe(2)
  })

  /**
   * Two drafts can carry the same hook, and the join returns that angle twice
   * — once matched, once not. Folding on the hook with `drafted` winning is
   * what stops a written angle being offered again.
   */
  it("does not re-offer an angle a duplicate join row shows as open", () => {
    const picks = rankWaitingRiffs([
      angle({ hook: "One hook.", drafted: true }),
      angle({ hook: "One hook.", drafted: false }),
    ])

    expect(picks).toEqual([])
  })

  it("breaks a tie on the riff id, so the same desk offers the same thing twice", () => {
    const same = new Date("2026-08-26T09:28:50Z")
    const order = () =>
      rankWaitingRiffs([
        angle({ riffId: "rif_b", createdAt: same }),
        angle({ riffId: "rif_a", createdAt: same }),
      ]).map((pick) => pick.riffId)

    expect(order()).toEqual(["rif_a", "rif_b"])
    expect(order()).toEqual(order())
  })

  it("carries the beats flag and the source noun onto the pick", () => {
    const [pick] = rankWaitingRiffs([
      angle({ sourceId: "voice", sourceLabel: "Voice note", beats: false }),
    ])

    expect(pick.source).toBe("voice note")
    expect(pick.beats).toBe(false)
  })
})

describe("sourceNoun", () => {
  it("names the material the way a sentence needs it", () => {
    expect(sourceNoun("github", "Pull request")).toBe("pull request")
    expect(sourceNoun("voice", "Voice note")).toBe("voice note")
    // "the Pasted I read on 26 Aug" is what the card label would have produced.
    expect(sourceNoun("notes", "Pasted")).toBe("note")
  })

  it("falls back to the card label, lowercased, for a source it has not met", () => {
    expect(sourceNoun("granola", "Meeting")).toBe("meeting")
    expect(sourceNoun("", "")).toBe("scrap")
  })
})

describe("describeWait", () => {
  /** The real case: the oldest untouched riff, read on 2026-09-09 in Oslo. */
  it("counts the wait in calendar days and names the day the product already prints", () => {
    expect(
      describeWait(
        new Date("2026-08-26T09:28:50Z"),
        new Date("2026-09-09T07:30:00Z"),
        "Europe/Oslo"
      )
    ).toEqual({ waitingSince: "26 Aug", waitedDays: 14 })
  })

  it("counts days in the owner's zone, not the server's", () => {
    // 23:30 UTC on the 8th is 01:30 on the 9th in Oslo: one calendar day, not
    // an eight-hour difference rounded to zero.
    expect(
      describeWait(
        new Date("2026-09-08T21:10:00Z"),
        new Date("2026-09-08T23:30:00Z"),
        "Europe/Oslo"
      )
    ).toEqual({ waitingSince: "Yesterday", waitedDays: 1 })
  })

  it("never reports a negative wait", () => {
    const now = new Date("2026-09-09T07:30:00Z")
    expect(
      describeWait(new Date("2026-09-10T07:30:00Z"), now, "UTC").waitedDays
    ).toBe(0)
  })
})
