import { describe, expect, it } from "vitest"

import { ANGLE_KINDS, asAngleKind, describeKinds, settleKind } from "./adapt"

/**
 * The kind rule. What is asserted here is deliberately narrow: prompt wording
 * is not a contract and testing it would freeze it. What *is* a contract is the
 * line between context and quota — `describeKinds` steers a genuine tie and is
 * forbidden from doing anything else, and unlike `shape` there is no downstream
 * constraint to make a wrong answer visible. An angle bent into `Question` to
 * balance a list is still publishable, just not the one the material supported.
 */
describe("describeKinds", () => {
  it("offers every kind, and only the kinds", () => {
    const out = describeKinds()
    for (const kind of ANGLE_KINDS) expect(out).toContain(kind)
  })

  it("says nothing about recent posts when there are none", () => {
    // An account that has drafted nothing gets no rule about it, rather than a
    // rule about an empty list.
    expect(describeKinds()).not.toContain("Lately")
    expect(describeKinds([])).not.toContain("Lately")
  })

  it("names what they have published lately, newest first", () => {
    const out = describeKinds(["Announcement", "Announcement", "Story"])
    expect(out).toContain("Announcement, Announcement, Story")
  })

  it("frames the recent list as context and forbids it as a quota", () => {
    const out = describeKinds(["Announcement"])
    expect(out).toContain("not a quota")
    expect(out).toContain("Never bend an angle into a kind it is not")
  })

  it("holds a window rather than the whole history", () => {
    // What they published in March is not what this set is competing with.
    const many = Array.from({ length: 20 }, (_, i) => `Kind${i}`)
    const out = describeKinds(many)
    expect(out).toContain("Kind5")
    expect(out).not.toContain("Kind6")
  })

  it("drops empties rather than reporting them as a kind", () => {
    // "" means "we do not know" — see `settleKind`. A blank in this list would
    // teach the model a category that does not exist.
    const out = describeKinds(["Story", "", "Opinion"])
    expect(out).toContain("Story, Opinion")
  })

  /**
   * Kind and shape answer different questions, and the prompt has to say so.
   * Without it the model collapses them — Essay/Story and Short post/
   * Announcement pair so naturally that kind stops carrying any information.
   */
  it("separates kind from shape explicitly", () => {
    expect(describeKinds()).toContain("different question from")
  })
})

/**
 * The guard between the model and `riff_angle.kind`. The schema enumerates
 * `kind`, and a schema enum is a request rather than a guarantee — the same
 * reading `buildAnglesSchema` already applies to `minItems`.
 */
describe("settleKind", () => {
  const angle = { hook: "h", shape: "Short post", kind: "", why: "w" }

  it("keeps a kind that is on the list", () => {
    expect(settleKind({ ...angle, kind: "Teardown" }).kind).toBe("Teardown")
  })

  it("empties one that is not", () => {
    // It would render on the card as a category that does not exist, and then
    // reappear in the next set's "lately this user has published" line.
    expect(settleKind({ ...angle, kind: "Hot take" }).kind).toBe("")
    expect(settleKind({ ...angle, kind: "announcement" }).kind).toBe("")
  })

  it("never guesses a default", () => {
    // `Announcement` is the plausible filler and exactly the one to avoid: the
    // whole point of the field is noticing that too much already is one.
    expect(settleKind({ ...angle, kind: "" }).kind).toBe("")
    expect(
      settleKind({ ...angle, kind: undefined as unknown as string }).kind
    ).toBe("")
  })

  /**
   * The guard the generators use, and the one every `riff_angle` insert uses.
   * Same function on purpose: two copies of this list is one place for an
   * off-list kind to get through.
   */
  it("is the same check the write sites apply", () => {
    expect(asAngleKind("Story")).toBe("Story")
    expect(asAngleKind("Hot take")).toBe("")
    expect(asAngleKind("  Opinion  ")).toBe("Opinion")
    expect(asAngleKind(undefined)).toBe("")
    expect(asAngleKind(null)).toBe("")
  })

  it("leaves the rest of the angle alone", () => {
    const out = settleKind({ ...angle, kind: "Story" })
    expect(out.hook).toBe("h")
    expect(out.shape).toBe("Short post")
    expect(out.why).toBe("w")
  })
})

describe("ANGLE_KINDS", () => {
  it("stays short enough for variety to mean something", () => {
    // Thirty categories make any two posts differ on paper, which is the same
    // as not measuring variety at all.
    expect(ANGLE_KINDS.length).toBeLessThanOrEqual(8)
  })

  it("has no duplicates", () => {
    expect(new Set(ANGLE_KINDS).size).toBe(ANGLE_KINDS.length)
  })
})
