import { describe, expect, it } from "vitest"

import { TELLS, describeExamples } from "./drafting"

/**
 * `describeExamples` and `describeRecent` sit near each other in the prompt and
 * mean opposite things — one is "write like this", the other is "do not repeat
 * this". These assert the framing stays unambiguous, because a swap would make
 * the model avoid the voice and copy the last draft.
 */
describe("describeExamples", () => {
  it("says nothing when the corpus has never been read", () => {
    expect(describeExamples([])).toBe("")
    expect(describeExamples(["   ", ""])).toBe("")
  })

  it("carries the posts verbatim", () => {
    const post = "shipped the thing. broke twice. worth it ✨"
    expect(describeExamples([post])).toContain(post)
  })

  it("frames them as the target, not as an avoid-list", () => {
    const out = describeExamples(["a real post of mine"])
    expect(out).toContain("ground truth")
    expect(out).not.toContain("Do not repeat")
  })

  it("tells the model to match the sound and not the subject", () => {
    const out = describeExamples(["a real post of mine"])
    expect(out).toContain("not what they said")
  })

  it("forbids handing back a post the user already published", () => {
    // Half the examples are now picked *because* they are about the same
    // subject, which is exactly when restating one stops being unlikely.
    const out = describeExamples(["a real post of mine"])
    expect(out).toContain("already published")
  })
})

/**
 * The anti-tells block. Only one thing is asserted, because only one thing here
 * can regress into a bug rather than into a worse prompt: these must stay
 * conditional on the user's own posts. A flat ban would fight the exemplars —
 * this product's whole argument is that what somebody published outranks any
 * rule about how they write, and a rule forbidding a word they demonstrably use
 * makes the draft less like them while reading as a quality improvement.
 */
describe("TELLS", () => {
  it("defers to the user's own posts rather than banning outright", () => {
    expect(TELLS).toContain(
      "unless the user's own posts below show them doing it"
    )
    expect(TELLS).not.toMatch(/\bnever use\b/i)
  })

  it("names the structures, not only the vocabulary", () => {
    // Word bans are easy to route around. The shapes are what give a draft away.
    expect(TELLS).toContain("Turns out")
    expect(TELLS).toContain("Setup and reversal")
  })
})
