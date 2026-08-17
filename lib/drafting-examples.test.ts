import { describe, expect, it } from "vitest"

import { describeExamples } from "./drafting"

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
})
