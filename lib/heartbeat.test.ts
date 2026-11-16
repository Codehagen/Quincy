import { describe, expect, it } from "vitest"

import { compilePrompt, factsFrom, ledgerNote } from "./heartbeat"
import type { LedgerEntry } from "./memory-ledger"

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

/**
 * The merged ledger, on its way into the compile.
 *
 * `runHeartbeat` reads the week's ledger pages, merges them and hands the lines
 * to the extractor beside the raw captures. Only two pure pieces of that decide
 * anything: how the two blocks are written into one prompt, and what the
 * compile note says about the lines nobody was shown. Both are here; the read
 * and the write are exercised in scripts/verify-heartbeat.ts.
 */
describe("compilePrompt", () => {
  const ledger: LedgerEntry[] = [
    {
      day: "2026-08-27",
      type: "correction",
      text: "Never open a post with an emoji.",
    },
    {
      day: "2026-08-26",
      type: "preference",
      text: "Write my posts in English.",
    },
  ]

  it("keeps the captures and the typed lines apart", () => {
    const prompt = compilePrompt(["I merged 282 this morning."], ledger)

    expect(prompt).toContain("- I merged 282 this morning.")
    expect(prompt).toContain("- correction: Never open a post with an emoji.")
    expect(prompt).toContain("- preference: Write my posts in English.")
    // The typed block comes second, so the last thing read before the schema
    // is the line that is allowed to overrule the rest.
    expect(prompt.indexOf("I merged 282")).toBeLessThan(
      prompt.indexOf("correction:")
    )
  })

  it("says what a correction is for, so the type is not decoration", () => {
    expect(compilePrompt([], ledger)).toContain("overruling")
  })

  it("is the captures alone when the ledger is empty", () => {
    // What every run looked like before plan 027, and what a user whose ledger
    // pages have all aged out of the window still gets.
    const prompt = compilePrompt(["I merged 282 this morning."])

    expect(prompt).toBe(
      "Raw captures since the last compaction:\n- I merged 282 this morning."
    )
  })
})

describe("ledgerNote", () => {
  it("says nothing when the ledger was empty", () => {
    const note = ledgerNote("Processed 3 capture(s)", {
      ledgerLines: 0,
      ledgerDropped: 0,
      ledgerCut: 0,
    })

    expect(note).toBe("Processed 3 capture(s)")
  })

  it("records what was merged and what the ceiling cut", () => {
    // The cut is the only part of a run a later reader cannot reconstruct from
    // the pages: the lines that were cut are the ones that left no trace.
    const note = ledgerNote("Processed 3 capture(s)", {
      ledgerLines: 120,
      ledgerDropped: 7,
      ledgerCut: 40,
    })

    expect(note).toContain("120 ledger line(s)")
    expect(note).toContain("7 merged as duplicates")
    expect(note).toContain("40 cut at the 12 KB cap")
  })

  it("leaves out the halves that did not happen", () => {
    const note = ledgerNote("Processed 3 capture(s)", {
      ledgerLines: 12,
      ledgerDropped: 0,
      ledgerCut: 0,
    })

    expect(note).toBe("Processed 3 capture(s) — 12 ledger line(s)")
  })
})
