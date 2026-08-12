import { describe, expect, it } from "vitest"

import { isMissed, windowFor } from "./publish-run"

/**
 * The catch-up window, which is the rule standing between a cron that missed
 * its turn and a week of stale posts fired into one minute.
 *
 * Nothing here touches a database. What is worth pinning is not that the query
 * runs but that the boundary is where the product says it is — see
 * scripts/verify-publish-run.ts for the half that needs real rows, including
 * the claim, which is the other half of the safety argument.
 */

/** A fixed instant. Nothing in this file may depend on when it is run. */
const NOW = new Date("2026-08-05T12:00:00.000Z")

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

describe("windowFor", () => {
  it("closes the window two hours behind now", () => {
    expect(windowFor(NOW).cutoff.toISOString()).toBe("2026-08-05T10:00:00.000Z")
  })

  it("stops looking two windows back", () => {
    // Anything older is left in `queued` rather than marked, so an abandoned
    // queue is not re-read on every run for the rest of time.
    expect(windowFor(NOW).floor.toISOString()).toBe("2026-08-05T08:00:00.000Z")
  })

  it("treats now as the moment a post is due", () => {
    expect(windowFor(NOW).due.getTime()).toBe(NOW.getTime())
  })
})

describe("isMissed", () => {
  const { cutoff } = windowFor(NOW)

  it("sends a post that is due this second", () => {
    expect(isMissed(NOW, cutoff)).toBe(false)
  })

  it("sends a post an hour late", () => {
    expect(isMissed(new Date(NOW.getTime() - HOUR), cutoff)).toBe(false)
  })

  it("still sends a post exactly two hours late", () => {
    // The boundary is inclusive on purpose. A rule that says "two hours" and
    // then refuses at exactly two hours is one nobody can predict.
    expect(isMissed(new Date(NOW.getTime() - 2 * HOUR), cutoff)).toBe(false)
  })

  it("refuses a post a minute past the window", () => {
    expect(isMissed(new Date(NOW.getTime() - 2 * HOUR - MINUTE), cutoff)).toBe(
      true
    )
  })

  it("refuses a post from last week", () => {
    // The failure this whole window exists to prevent: a cron that was broken
    // for days coming back and publishing all of it at once.
    expect(isMissed(new Date(NOW.getTime() - 7 * 24 * HOUR), cutoff)).toBe(true)
  })

  it("does not treat a future post as missed", () => {
    // Belt and braces. The query already excludes these, but `attempt`
    // re-checks the window on every row and must not invent a verdict for one
    // that has not come round yet.
    expect(isMissed(new Date(NOW.getTime() + HOUR), cutoff)).toBe(false)
  })
})
