import { describe, expect, it } from "vitest"

import { isFigureLine, paragraphsOf, readBeats } from "./draft-beats"

const STORY =
  "I cut our onboarding email down to one question.\n\nReplies in the first week:\n31\nYour median is 6.\n\nPeople answer a question. They skip a brochure."

describe("isFigureLine", () => {
  it("accepts a number with at most a unit", () => {
    for (const s of ["31", "1,240", "1.8×", "40%", "12k", " 6 "]) expect(isFigureLine(s)).toBe(true)
  })
  it("accepts a before and after joined by an arrow", () => {
    for (const s of ["41% → 68%", "27 → 2", "1,240 -> 3,410"])
      expect(isFigureLine(s)).toBe(true)
  })
  it("rejects an arrow with words on either side", () => {
    for (const s of ["41% → 68% in a week", "before → after", "→ 68%", "41% →"])
      expect(isFigureLine(s)).toBe(false)
  })
  it("rejects words and dates", () => {
    for (const s of ["", "31 replies", "#323–#332", "Thu 07:45", "1234567890123"])
      expect(isFigureLine(s)).toBe(false)
  })
})

describe("paragraphsOf", () => {
  it("splits on blank lines and keeps single newlines as lines", () => {
    const p = paragraphsOf("a\nb\n\n  \n\nc")
    expect(p.map((x) => x.map((l) => l.text))).toEqual([["a", "b"], ["c"]])
  })
  it("folds a lone number into the paragraph before it", () => {
    const p = paragraphsOf("did\n\nReplies:\n\n31\n\nmeant")
    expect(p).toHaveLength(3)
    expect(p[1]!.map((l) => l.text)).toEqual(["Replies:", "31"])
  })
})

describe("readBeats", () => {
  it("reads a three-beat story", () => {
    const b = readBeats(STORY)
    expect(b?.did[0]!.text).toMatch(/^I cut/)
    expect(b?.happened.find((l) => l.figure)?.text).toBe("31")
    expect(b?.meant[0]!.text).toMatch(/^People/)
  })

  it("does not bracket an opinion post (an opinion body)", () => {
    expect(
      readBeats(
        "For OSS products like a starter kit, directory listings can help with discovery.\n\nBut a backlink is not adoption.\n\nThe lasting distribution comes from giving builders a foundation they actually want to use."
      )
    ).toBeNull()
  })

  it("does not bracket numbers inside a sentence", () => {
    expect(
      readBeats(
        "I merged 10 changes this week.\n\n#323–#332 covered previews.\n\n7 to 1,582 additions across 2 to 62 files."
      )
    ).toBeNull()
  })

  it("needs exactly three paragraphs", () => {
    expect(readBeats("a\n\nReplies:\n31\n\nb\n\nc")).toBeNull()
    expect(readBeats("Replies:\n31\n\nb")).toBeNull()
  })
})
