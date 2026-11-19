import { describe, expect, it } from "vitest"

import {
  cleanUpCuts,
  cleanUpReceipt,
  cleanUpReceiptOf,
  detectDisfluencies,
} from "./disfluency"
import { soundFillerForm } from "./fillers"
import { secondsToUs, type Us } from "./time"
import type { Word } from "./transcript"

const s = (seconds: number) => secondsToUs(seconds) as Us

/** Words laid out 0.3 s each with 0.1 s gaps, unless a gap is given. */
function say(...parts: (string | { gap: number })[]): Word[] {
  const words: Word[] = []
  let at = 0
  for (const part of parts) {
    if (typeof part !== "string") {
      at += part.gap
      continue
    }
    words.push({
      text: part,
      startUs: s(at),
      endUs: s(at + 0.3),
      confidence: 1,
    })
    at += 0.4
  }
  return words
}

const kinds = (words: Word[]) =>
  detectDisfluencies(words).map((item) => [item.kind, item.phrase])

describe("soundFillerForm", () => {
  it("matches the listed sounds and their drawn-out spellings", () => {
    expect(soundFillerForm("Um,")).toBe("um")
    expect(soundFillerForm("ummm")).toBe("um")
    expect(soundFillerForm("øhhh")).toBe("øh")
    expect(soundFillerForm("Mmmm.")).toBe("hmm")
  })

  it("never squeezes a real word into a filler", () => {
    expect(soundFillerForm("er")).toBeNull()
    expect(soundFillerForm("err")).toBeNull()
    expect(soundFillerForm("umbrella")).toBeNull()
    expect(soundFillerForm("mamma")).toBeNull()
  })
})

describe("detectDisfluencies", () => {
  it("finds a repeated word and keeps the last copy", () => {
    expect(kinds(say("we", "we", "shipped", "it"))).toEqual([
      ["repetition", "we"],
    ])
  })

  it("finds a repeated phrase as one result", () => {
    expect(kinds(say("I", "think", "I", "think", "it", "works"))).toEqual([
      ["repetition", "I think"],
    ])
  })

  it("sees a repeat across a hesitation", () => {
    expect(kinds(say("vi,", "øh,", "vi", "gjorde", "det"))).toEqual([
      ["repetition", "vi,"],
      ["hesitation", "øh,"],
    ])
  })

  it("leaves doubles people mean", () => {
    expect(kinds(say("it", "was", "very", "very", "good"))).toEqual([])
    expect(kinds(say("nei", "nei", "det", "stemmer", "ikke"))).toEqual([])
    expect(kinds(say("Done.", "Done."))).toEqual([])
  })

  it("leaves a repeat that comes back much later", () => {
    expect(kinds(say("we", { gap: 3 }, "we", "did"))).toEqual([])
  })

  it("finds a false start abandoned with a hesitation", () => {
    expect(
      kinds(say("we", "should,", "um,", "we", "need", "to", "ship"))
    ).toEqual([
      ["false_start", "we should,"],
      ["hesitation", "um,"],
    ])
  })

  it("finds a cut-off fragment", () => {
    expect(kinds(say("the", "bu-", "the", "bug", "report"))).toEqual([
      ["false_start", "bu-"],
    ])
  })

  it("does not call a phrase inside a clause a false start", () => {
    expect(
      kinds(say("for", "the", "bug", "report", "the", "user", "wrote"))
    ).toEqual([])
  })

  it("finds a discourse filler only when it is set off", () => {
    expect(kinds(say("it", "was,", "like,", "huge"))).toEqual([
      ["discourse", "like,"],
    ])
    expect(kinds(say("I", "like", "pizza"))).toEqual([])
    expect(kinds(say("det", "var,", "liksom,", "rart"))).toEqual([
      ["discourse", "liksom,"],
    ])
    expect(kinds(say("du", "vet", "hvordan", "det", "er"))).toEqual([])
  })
})

describe("cleanUpCuts", () => {
  it("cuts only the chosen kinds", () => {
    const words = say("it", "was,", "like,", "huge", "and", "and", "fast")
    const duration = s(4)
    const all = cleanUpCuts(words, duration, ["repetition", "discourse"])
    const repeats = cleanUpCuts(words, duration, ["repetition"])
    expect(all).toHaveLength(2)
    expect(repeats).toHaveLength(1)
    expect(repeats[0].found[0].phrase).toBe("and")
  })

  it("never reaches into the word kept", () => {
    const words = say("we", "we", "shipped")
    const [cut] = cleanUpCuts(words, s(2), ["repetition"])
    expect(cut.range.endUs).toBeLessThanOrEqual(words[1].startUs)
    expect(cut.range.startUs).toBeLessThanOrEqual(words[0].startUs)
  })
})

describe("cleanUpReceipt", () => {
  it("names the kinds and the time", () => {
    const found = detectDisfluencies(
      say(
        "and",
        "and",
        "then.",
        "we",
        "should,",
        "um,",
        "we",
        "need",
        "it",
        "it",
        "now"
      )
    )
    const line = cleanUpReceipt(found, 1_800_000)
    expect(line).toBe(
      "Cleaned up 4: 1 hesitation, 2 repeated words, 1 false start · 1.8 s"
    )
    expect(cleanUpReceiptOf(`${line}\nmore`)).toBe(line)
    expect(cleanUpReceiptOf("Removed 2 fillers")).toBeNull()
  })
})
