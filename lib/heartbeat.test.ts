import { describe, expect, it } from "vitest"

import { factsFrom } from "./heartbeat"

/**
 * The distinction the whole guard exists for.
 *
 * `runHeartbeat` appends its watermark unconditionally at the end of a run, so
 * what the extractor returns decides whether that week's captures are compiled
 * or discarded forever. An empty list has to pass through and let the watermark
 * advance — "most input is not worth keeping" is what the prompt asks for, and
 * re-reading those captures every run would pay for the same refusal on a loop.
 * A malformed result has to become `null`, which `runHeartbeat` turns into a
 * throw once it has recorded the bill.
 *
 * Only `runHeartbeat` touches the database, so this tests the discriminator
 * rather than the run, matching how the rest of the repo tests internals. The
 * end-to-end behaviour lives in scripts/verify-heartbeat.ts.
 */
describe("factsFrom", () => {
  it("passes an empty list through, because refusing is a correct answer", () => {
    // Must be `[]` and not `null`. `null` here would hold the watermark back
    // and re-read the same captures on every run, paying for the same
    // "nothing worth keeping" verdict forever.
    expect(factsFrom({ facts: [] })).toEqual([])
  })

  it("passes real facts through unchanged", () => {
    const facts = [{ topic: "working-style", fact: "Ships on Fridays." }]

    expect(factsFrom({ facts })).toBe(facts)
  })

  it("rejects the Gateway's stringified payload rather than losing the week", () => {
    // What two malformed attempts actually leave behind: the payload is right
    // there, but as a string, so `for (const {topic} of facts)` would iterate
    // characters. Reading it as an empty run would look clean and move the
    // watermark past captures that were never compiled.
    const mangled = {
      facts: JSON.stringify({ facts: [{ topic: "a", fact: "b" }] }),
    }

    expect(factsFrom(mangled)).toBeNull()
  })

  it("rejects a missing property", () => {
    expect(factsFrom({ facts: undefined })).toBeNull()
  })

  it("rejects an object where an array belongs", () => {
    // The second documented mangling flattens the array into scalar properties
    // at the root, so `facts` can arrive as an object rather than a string.
    expect(factsFrom({ facts: { topic: "a", fact: "b" } })).toBeNull()
  })
})
