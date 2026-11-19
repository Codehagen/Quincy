import { describe, expect, it } from "vitest"

import { fillerReceipt, fillerReceiptOf, isFiller, isSoundFiller, SOUND_FILLERS, WORD_FILLERS } from "./fillers"
import { noticed, readTake, startersFor, STRONG_LINE_KEY, strongLineSlot } from "./reading"
import { us, type Us } from "./time"
import type { Word } from "./transcript"

const s = (seconds: number): Us => us(Math.round(seconds * 1_000_000))

function word(text: string, start: number, end: number, speaker?: number): Word {
  return { text, startUs: s(start), endUs: s(end), confidence: 1, speaker }
}

/** A take with two long pauses (1.5 s and 3 s), an "um," and a "liksom". */
const PAUSED = [
  word("So", 0.2, 0.4),
  word("um,", 0.5, 0.8),
  word("this", 0.9, 1.1),
  word("worked.", 1.2, 1.6),
  // 1.5 s of nothing.
  word("Then", 3.1, 3.4),
  word("liksom", 3.5, 3.9),
  word("it", 4.0, 4.1),
  // 3 s of nothing.
  word("broke.", 7.1, 7.6),
]

/** The test cut's shape: 1.3 s, words, no pauses, no fillers. */
const TIGHT = [
  word("Hello", 0.1, 0.4),
  word("there,", 0.45, 0.7),
  word("friend.", 0.75, 1.2),
]

describe("fillers", () => {
  it("counts a whole word only, through its punctuation", () => {
    expect(isFiller("Um,")).toBe(true)
    expect(isFiller("altså.")).toBe(true)
    expect(isFiller("umbrella")).toBe(false)
    expect(isFiller("like")).toBe(false)
  })
})

describe("readTake", () => {
  it("reads pauses over a second and the fillers", () => {
    const reading = readTake(PAUSED, s(8))
    expect(reading.words).toBe(8)
    expect(reading.speakers).toBe(1)
    expect(reading.pauses.count).toBe(2)
    expect(reading.pauses.totalUs).toBe(s(1.5) + s(3))
    expect(reading.fillers).toEqual({ count: 2, byWord: { um: 1, liksom: 1 } })
    expect(reading.firstLine).toBe("So this worked.")
    expect(reading.strongLine).toBeNull()
  })

  it("leaves a gap of a second or less alone", () => {
    const reading = readTake([word("a", 0, 0.2), word("b", 1.2, 1.4)], s(2))
    expect(reading.pauses.count).toBe(0)
  })

  it("counts the speakers the transcript names", () => {
    const reading = readTake([word("Hi.", 0, 0.3, 0), word("Hey.", 0.5, 0.8, 1)], s(1))
    expect(reading.speakers).toBe(2)
  })

  it("reads a silent take as no words and no first line", () => {
    const reading = readTake([], s(3))
    expect(reading).toMatchObject({ words: 0, speakers: 0, firstLine: null })
    expect(noticed(reading)).toEqual(["3.0 s, and no words in it."])
    expect(startersFor(reading)).toEqual([])
  })
})

describe("noticed", () => {
  it("says the numbers the starters stand on", () => {
    expect(noticed(readTake(PAUSED, s(8)))).toEqual([
      "8.0 s, 8 words, one voice.",
      "2 pauses over a second, 4.5 s in all.",
      "2 fillers: “liksom”, “um”.",
    ])
  })

  it("says so when nothing runs long", () => {
    expect(noticed(readTake(TIGHT, s(1.3)))).toEqual([
      "1.3 s, 3 words, one voice.",
      "No pause runs over a second.",
    ])
  })
})

describe("startersFor", () => {
  it("offers Tighten with its reason when there are pauses", () => {
    const starters = startersFor(readTake(PAUSED, s(8)))
    expect(starters[0]).toEqual({
      text: "Tighten the edit",
      tool: "remove_silences",
      read: "2 pauses over a second, 4.5 s",
    })
  })

  it("does not offer Tighten without pauses", () => {
    const tools = startersFor(readTake(TIGHT, s(1.3))).map((x) => x.tool)
    expect(tools).not.toContain("remove_silences")
    expect(tools).toEqual(["add_captions", "punch_in"])
  })

  it("does not offer captions to a cut that has them", () => {
    const reading = readTake(TIGHT, s(1.3))
    const tools = startersFor(reading, { width: 1080, height: 1920, hasCaptions: true }).map((x) => x.tool)
    expect(tools).toEqual(["punch_in"])
  })

  it("offers vertical only for a wide frame, rotation included", () => {
    const reading = readTake(TIGHT, s(1.3))
    const has = (frame: Parameters<typeof startersFor>[1]) =>
      startersFor(reading, frame).some((x) => x.tool === "reframe")
    expect(has({ width: 1920, height: 1080 })).toBe(true)
    expect(has({ width: 1080, height: 1920 })).toBe(false)
    expect(has({ width: 1920, height: 1080, rotation: 90 })).toBe(false)
    expect(has({ width: null, height: null })).toBe(false)
  })

  it("never offers a starter with an empty reason", () => {
    for (const starter of startersFor(readTake(PAUSED, s(8)), { width: 1920, height: 1080 })) {
      expect(starter.read.length).toBeGreaterThan(0)
    }
  })
})

describe("the filler starter", () => {
  it("offers to remove the sounds, counting only those the cut takes unasked", () => {
    // PAUSED has an "um," and a "liksom": one sound, and liksom stays.
    const starter = startersFor(readTake(PAUSED, s(8))).find((x) => x.tool === "remove_fillers")
    expect(starter).toEqual({ text: "Remove the filler", tool: "remove_fillers", read: "“um”" })
  })

  it("names the count and the words when there are several", () => {
    const take = [word("Øh,", 0, 0.2), word("so", 0.3, 0.5), word("um", 0.6, 0.8), word("øh", 0.9, 1.1), word("yes.", 1.2, 1.4)]
    const starter = startersFor(readTake(take, s(1.5))).find((x) => x.tool === "remove_fillers")
    expect(starter).toEqual({ text: "Remove the 3 fillers", tool: "remove_fillers", read: "2 × “øh”, “um”" })
  })

  it("is not offered when the only fillers are words", () => {
    const take = [word("det", 0, 0.2), word("liksom", 0.3, 0.6), word("altså.", 0.7, 1)]
    expect(startersFor(readTake(take, s(1.2))).map((x) => x.tool)).not.toContain("remove_fillers")
  })
})

describe("the strong line", () => {
  it("is read from its slot on the transcript, and only when chosen", () => {
    expect(strongLineSlot({ [STRONG_LINE_KEY]: { state: "done", line: "It works." } })).toEqual({
      state: "done",
      line: "It works.",
    })
    expect(strongLineSlot({ [STRONG_LINE_KEY]: { state: "pending" } })).toEqual({ state: "pending" })
    expect(strongLineSlot({ results: {} })).toBeUndefined()
    expect(strongLineSlot(null)).toBeUndefined()
  })

  it("is noticed, and the push-in starter quotes it instead of the first line", () => {
    const reading = readTake(TIGHT, s(1.3), "This is the line.")
    expect(noticed(reading)).toContain("The strong line: “This is the line.”")
    const push = startersFor(reading).find((x) => x.tool === "punch_in")
    expect(push?.text).toBe("Push in on “This is the line.”")
    expect(push?.read).toBe("The strong line of the take")
  })
})

describe("the cut's filler lists", () => {
  it("takes sounds unasked and keeps the words that are also real words", () => {
    expect(isSoundFiller("Øh,")).toBe(true)
    expect(isSoundFiller("liksom")).toBe(false)
    expect(WORD_FILLERS).toEqual(["liksom", "altså"])
    for (const sound of SOUND_FILLERS) expect(isFiller(sound)).toBe(true)
  })
})

describe("the filler receipt", () => {
  it("reads as count, the words most first, and the seconds saved", () => {
    const removed = ["øh", "um,", "Øh,", "øh.", "um", "Um", "øh"]
    expect(fillerReceipt(removed, 2_140_000)).toBe("Removed 7 fillers: 4 × øh, 3 × um · 2.1 s")
    expect(fillerReceipt(["uh"], 400_000)).toBe("Removed 1 filler: uh · 0.4 s")
  })

  it("is found at the head of the tool's output, and nowhere else", () => {
    const line = "Removed 2 fillers: um, øh · 0.8 s"
    expect(fillerReceiptOf(`${line}\nThe cut runs 0:59.`)).toBe(line)
    expect(fillerReceiptOf("There are no filler sounds in this take to cut.")).toBeNull()
    expect(fillerReceiptOf(undefined)).toBeNull()
  })
})
