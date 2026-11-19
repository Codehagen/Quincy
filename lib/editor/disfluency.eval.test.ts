import { describe, expect, it } from "vitest"

import { PASSAGES, type Passage } from "./__fixtures__/speech/passages"
import {
  DISFLUENCY_KINDS,
  detectDisfluencies,
  type DisfluencyKind,
} from "./disfluency"
import { secondsToUs, type Us } from "./time"
import type { Word } from "./transcript"

/**
 * Precision of the stumble detector on labelled speech.
 *
 * `clean_up_speech` cuts without the approval gate (gate.ts), so the kinds it
 * takes by default must almost never fire on words that were meant. The
 * thresholds below are that promise in numbers; recall is printed, not held.
 */

const PAUSE = 0.6

function wordsOf(passage: Passage): Word[] {
  const words: Word[] = []
  let at = 0
  for (const token of passage.text.split(/\s+/)) {
    if (token === "|") {
      at += PAUSE
      continue
    }
    words.push({
      text: token,
      startUs: secondsToUs(at) as Us,
      endUs: secondsToUs(at + 0.28) as Us,
      confidence: 1,
    })
    at += 0.36
  }
  return words
}

type Tally = { found: number; right: number; expected: number }

function tally(): Record<DisfluencyKind, Tally> {
  const all = {} as Record<DisfluencyKind, Tally>
  for (const kind of DISFLUENCY_KINDS)
    all[kind] = { found: 0, right: 0, expected: 0 }
  for (const passage of PASSAGES) {
    const found = detectDisfluencies(wordsOf(passage)).map((item) => ({
      kind: item.kind,
      phrase: item.phrase,
    }))
    const expected = [...passage.cut]
    for (const item of found) {
      all[item.kind].found++
      const at = expected.findIndex(
        (e) => e.kind === item.kind && e.phrase === item.phrase
      )
      if (at !== -1) {
        all[item.kind].right++
        expected.splice(at, 1)
      }
    }
    for (const item of passage.cut) all[item.kind].expected++
  }
  return all
}

const precision = (t: Tally) => (t.found === 0 ? 1 : t.right / t.found)
const recall = (t: Tally) => (t.expected === 0 ? 1 : t.right / t.expected)

describe("stumble detector on labelled speech", () => {
  const all = tally()

  it("reports precision and recall per kind", () => {
    const rows = DISFLUENCY_KINDS.map(
      (kind) =>
        `${kind.padEnd(12)} found ${all[kind].found}  right ${all[kind].right}  expected ${all[kind].expected}  precision ${precision(all[kind]).toFixed(2)}  recall ${recall(all[kind]).toFixed(2)}`
    )
    console.info(`\n${rows.join("\n")}`)
    expect(rows).toHaveLength(4)
  })

  it("rarely cuts what was meant, for the kinds a clean-up takes unasked", () => {
    expect(precision(all.repetition)).toBeGreaterThanOrEqual(0.9)
    expect(precision(all.false_start)).toBeGreaterThanOrEqual(0.9)
    expect(precision(all.hesitation)).toBeGreaterThanOrEqual(0.8)
  })

  it("finds nothing in the fluent passages", () => {
    for (const passage of PASSAGES.filter((p) => p.cut.length === 0)) {
      expect(
        detectDisfluencies(wordsOf(passage)).map(
          (item) => `${item.kind}: ${item.phrase}`
        ),
        passage.name
      ).toEqual([])
    }
  })
})
