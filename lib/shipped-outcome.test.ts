import { describe, expect, it } from "vitest"

import { isSettled, sayOutcome } from "./shipped-outcome"

/**
 * The sentence /sources says after it reads a merge.
 *
 * Worth its own file because the bug this module was written for was not a
 * crash — every path succeeded, and the page said the wrong thing. A GitHub
 * connection read a real merge, the model declined it, and the row went on
 * showing "the riff will be on /riffs in a moment" forever. So what is asserted
 * here is mostly *which* sentence, and one thing about timing: whether the
 * poller is allowed to stop.
 */

describe("isSettled", () => {
  it("keeps waiting only while nothing has come back", () => {
    expect(isSettled({ state: "pending" })).toBe(false)
  })

  it("stops as soon as a riff exists, before the angles finish", () => {
    /**
     * The one that is easy to get wrong. A riff in `working` is still being
     * written, but "there was a post in it" is already settled and the card is
     * already on /riffs — waiting out the angle generation would leave somebody
     * staring at a spinner for a fact that was true twenty seconds ago.
     */
    expect(isSettled({ state: "writing", riffId: "rif_gh_si-1" })).toBe(true)
  })

  it("stops on a refusal, which is an answer rather than a silence", () => {
    expect(isSettled({ state: "refused", why: "A dependency bump." })).toBe(true)
  })

  it("stops on a failure", () => {
    expect(isSettled({ state: "failed", message: "No angles came back." })).toBe(
      true
    )
  })

  it("treats a missing row as settled, so the poll cannot run forever", () => {
    // null means the source item is gone or was never theirs. Neither is going
    // to change by asking again.
    expect(isSettled(null)).toBe(true)
  })
})

describe("sayOutcome", () => {
  it("hands over the model's own reason, whole", () => {
    /**
     * The real refusal from the first merge this ever read, live on
     * 2026-08-21. Paraphrasing it into a category — "not publishable" — would
     * throw away the only part somebody can argue with, and arguing with it is
     * how the prompt gets better.
     */
    const why =
      "This is an implementation-heavy animation update with verification " +
      "notes, not a stranger-facing insight, measured result, or reusable " +
      "argument."

    expect(sayOutcome({ state: "refused", why })).toBe(
      `There was no post in it: ${why}`
    )
  })

  it("still says no when the model gave no reason", () => {
    expect(sayOutcome({ state: "refused", why: "" })).toBe(
      "There was no post in it."
    )
  })

  it("points at /riffs when there was a post", () => {
    expect(sayOutcome({ state: "ready", riffId: "rif_gh_si-1" })).toContain(
      "/riffs"
    )
    expect(sayOutcome({ state: "writing", riffId: "rif_gh_si-1" })).toContain(
      "/riffs"
    )
  })

  it("never claims a riff exists when nothing came back", () => {
    // The whole bug, as an assertion: `pending` must not borrow the confident
    // sentence from `ready`.
    expect(sayOutcome({ state: "pending" })).not.toContain("/riffs")
    expect(sayOutcome(null)).not.toContain("/riffs")
  })

  it("repeats the riff's own failure rather than inventing one", () => {
    expect(
      sayOutcome({ state: "failed", message: "No angles came back." })
    ).toBe("The write failed: No angles came back.")
  })
})
