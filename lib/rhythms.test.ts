import { describe, expect, it } from "vitest"

import { ceilingSkip, RHYTHM_DAILY_CEILING_MICROS } from "./rhythm-run"
import { RHYTHM_HANDLERS, RUNS_ELSEWHERE, runsToday } from "./rhythm-handlers"
import {
  DEFAULT_CADENCE,
  FAMILY_LABEL,
  isRunnable,
  LIVE_RHYTHMS,
  MAKES_LABEL,
  NODE_LABEL,
  RHYTHMS,
} from "./rhythms"

/**
 * The invariant this file exists for: **a card cannot exist without code
 * behind it.** `/rhythm` used to render the whole catalogue, twenty of them
 * inert, and the flag that decided which was a boolean a person maintained
 * beside a registry the machine maintained. See plans/027, 4a.
 *
 * These are deliberately not assertions about *how many*. Ten run today, up
 * from seven when plan 027 added Ship Log, Weekly Review and Week Plan — and a
 * test that had to be edited to allow the eleventh would be a test about today
 * rather than about the rule.
 */
describe("the rhythms the page renders", () => {
  it("is exactly the ones with code behind them", () => {
    expect(LIVE_RHYTHMS.map((r) => r.id).sort()).toEqual(
      [...Object.keys(RHYTHM_HANDLERS), ...Object.keys(RUNS_ELSEWHERE)].sort()
    )
  })

  it("is smaller than the catalogue it comes from", () => {
    // If these are ever equal, either every rhythm shipped or the derivation
    // has been replaced by the catalogue again.
    expect(LIVE_RHYTHMS.length).toBeLessThan(RHYTHMS.length)
    expect(LIVE_RHYTHMS.length).toBeGreaterThan(0)
  })

  it("names a rhythm that is really in the catalogue", () => {
    const ids = new Set(RHYTHMS.map((r) => r.id))

    for (const id of Object.keys(RHYTHM_HANDLERS)) expect(ids).toContain(id)
    for (const id of Object.keys(RUNS_ELSEWHERE)) expect(ids).toContain(id)
  })

  it("never claims a rhythm through both registries", () => {
    // Two answers to "how does this run" is how a dispatcher ends up firing
    // something an event already fired.
    for (const id of Object.keys(RUNS_ELSEWHERE)) {
      expect(RHYTHM_HANDLERS[id]).toBeUndefined()
    }
  })

  it("gives every id in the catalogue a unique id", () => {
    expect(new Set(RHYTHMS.map((r) => r.id)).size).toBe(RHYTHMS.length)
  })
})

describe("what a live card can render", () => {
  it("has a label for every family, node and product of a live rhythm", () => {
    for (const rhythm of LIVE_RHYTHMS) {
      expect(FAMILY_LABEL[rhythm.family]).toBeTruthy()
      expect(MAKES_LABEL[rhythm.makes]).toBeTruthy()

      for (const node of [...rhythm.from, ...rhythm.to]) {
        expect(NODE_LABEL[node]).toBeTruthy()
      }
    }
  })

  it("only offers a switch to a clock rhythm with a handler", () => {
    for (const rhythm of RHYTHMS) {
      if (!isRunnable(rhythm)) continue

      expect(rhythm.trigger.kind).toBe("clock")
      expect(RHYTHM_HANDLERS[rhythm.id]).toBeTypeOf("function")
      // The switch writes a subscription, and a subscription needs a time to
      // start at. Without this the first press stores 09:00 by accident.
      expect(DEFAULT_CADENCE[rhythm.id]).toBeDefined()
    }
  })

  it("gives an event rhythm somewhere else to be switched on", () => {
    for (const [id, run] of Object.entries(RUNS_ELSEWHERE)) {
      if (run.kind !== "event") continue

      expect(run.switchedAt.startsWith("/")).toBe(true)
      // It has no switch on /rhythm, which is why it needs the path above.
      expect(RHYTHM_HANDLERS[id]).toBeUndefined()
    }
  })

  it("agrees with runsToday about a rhythm nobody built", () => {
    const dormant = RHYTHMS.filter((r) => !runsToday(r.id))

    expect(dormant.length).toBe(RHYTHMS.length - LIVE_RHYTHMS.length)
    for (const rhythm of dormant) {
      expect(isRunnable(rhythm)).toBe(false)
    }
  })
})

/**
 * The three plan 027 added. Named rather than counted, because a card that
 * quietly stopped being live is the failure the derivation cannot catch on its
 * own: `LIVE_RHYTHMS` would simply be shorter and every test above would still
 * pass.
 */
describe("the rhythms plan 027 added", () => {
  for (const id of ["ship-log", "weekly-review", "week-plan"]) {
    it(`runs ${id} on the dispatcher, with a time to start at`, () => {
      expect(RHYTHM_HANDLERS[id]).toBeTypeOf("function")
      expect(LIVE_RHYTHMS.map((r) => r.id)).toContain(id)

      const cadence = DEFAULT_CADENCE[id]
      expect(cadence).toBeDefined()
      // All three are weekly. A daily ship log is a daily list of nothing.
      expect(cadence.weekday).not.toBeNull()
    })
  }
})

/**
 * The guard AGENTS.md names as missing: "Per-run costs are capped; a per-user
 * daily total is not."
 *
 * The sweep itself needs a database, so what is tested here is the rule and
 * the sentence it is recorded with — the same split lib/heartbeat.test.ts
 * draws between `factsFrom` and `runHeartbeat`.
 */
describe("the daily ceiling on unattended runs", () => {
  it("lets a run through under the ceiling", () => {
    expect(ceilingSkip(RHYTHM_DAILY_CEILING_MICROS - 1)).toBeNull()
    expect(ceilingSkip(0)).toBeNull()
  })

  it("skips on the ceiling itself, not one micro past it", () => {
    expect(ceilingSkip(RHYTHM_DAILY_CEILING_MICROS)).not.toBeNull()
  })

  it("records both numbers, so the skip can be checked against /credits", () => {
    expect(ceilingSkip(612_345)).toBe(
      "Skipped — this account has spent $0.61 today, and the daily ceiling for unattended runs is $0.50."
    )
  })
})
