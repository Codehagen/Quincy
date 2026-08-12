import { describe, expect, it } from "vitest"

import {
  describeConstraints,
  describeRecent,
  targetsFor,
  writesPerShape,
} from "./drafting"
import { CHANNEL_RULES } from "./post-length"

/**
 * The model call itself (`generateDraft`) is not exercised here — no DB, no
 * model, following the repo's split (lib/voice.test.ts, lib/corpus-x.test.ts).
 * A live check belongs to a verify script, per plans/015 step 6.
 */

describe("targetsFor", () => {
  it("keeps every shape channel that is connected, in CHANNELS_FOR_SHAPE order", () => {
    const targets = targetsFor("Short post", ["x", "linkedin"])
    expect(targets.map((t) => t.id)).toEqual(["x", "linkedin"])
  })

  it("narrows to only the connected channel", () => {
    const targets = targetsFor("Short post", ["x"])
    expect(targets.map((t) => t.id)).toEqual(["x"])
  })

  it("drops a shape channel that is not connected", () => {
    // Carousel maps to linkedin + instagram; only linkedin is connected.
    const targets = targetsFor("Carousel", ["x", "linkedin"])
    expect(targets.map((t) => t.id)).toEqual(["linkedin"])
  })

  /**
   * The pair that used to be one test asserting the wrong half.
   *
   * "Falls back to the unnarrowed shape list when the intersection is empty"
   * passed for two years' worth of reasons and shipped a Substack draft to an
   * account live on X and LinkedIn on 2026-08-08. The widening is for a user we
   * know nothing about, not for a user we know cannot receive this shape.
   */
  it("returns nothing when the user has channels and none of them take the shape", () => {
    // Essay maps to substack; this account publishes to X.
    expect(targetsFor("Essay", ["x"])).toEqual([])
  })

  it("falls back to the unnarrowed shape list only when nothing is connected", () => {
    const targets = targetsFor("Essay", [])
    expect(targets.map((t) => t.id)).toEqual(["substack"])
  })

  it("attaches the real CHANNEL_RULES entry to each target", () => {
    const [x] = targetsFor("Short post", ["x"])
    expect(x.rules.limit).toBe(CHANNEL_RULES.x.limit)
  })
})

/**
 * The number /riffs puts on every angle. It has to be `targetsFor` counted and
 * nothing else — a second reading of `CHANNELS_FOR_SHAPE` would put a promise
 * on screen that the action then refuses, which is the 2026-08-08 Substack bug
 * with a user watching.
 */
describe("writesPerShape", () => {
  it("counts one draft per connected channel the shape reaches", () => {
    const writes = writesPerShape(["x", "linkedin"])
    expect(writes["Short post"]).toBe(2)
    expect(writes.Thread).toBe(1)
  })

  it("narrows with the account, not with the shape table", () => {
    // Carousel maps to linkedin + instagram; only linkedin is connected.
    expect(writesPerShape(["x", "linkedin"]).Carousel).toBe(1)
  })

  it("is zero when the account has channels and none take the shape", () => {
    // Essay maps to substack; this account publishes to X. The card says
    // "no channel for this yet" rather than promising a draft.
    expect(writesPerShape(["x"]).Essay).toBe(0)
  })

  it("widens to the shape list only when nothing is connected", () => {
    expect(writesPerShape([])).toEqual({
      "Short post": 2,
      Thread: 1,
      Carousel: 2,
      Essay: 1,
    })
  })

  it("answers for every shape, so no angle can render a blank count", () => {
    expect(Object.keys(writesPerShape(["x"])).sort()).toEqual(
      ["Carousel", "Essay", "Short post", "Thread"].sort()
    )
  })
})

describe("describeConstraints", () => {
  it("names X's ceiling and LinkedIn's fold, read from CHANNEL_RULES", () => {
    const targets = targetsFor("Short post", ["x", "linkedin"])
    const description = describeConstraints(targets)

    const xLine = description.split("\n").find((line) => line.startsWith("X:"))
    const linkedinLine = description
      .split("\n")
      .find((line) => line.startsWith("LinkedIn:"))

    expect(xLine).toContain(String(CHANNEL_RULES.x.limit))
    expect(linkedinLine).toContain(String(CHANNEL_RULES.linkedin.fold))
  })

  it("does not claim a limit for a channel with no CHANNEL_RULES entry", () => {
    const description = describeConstraints([
      {
        id: "mystery",
        label: "Mystery",
        rules: { limit: null, fold: null, urlCost: null },
      },
    ])
    expect(description).toBe("Mystery: no published length limit")
  })
})

/**
 * The avoid-list added on 2026-08-09, after six consecutive drafts opened on
 * a claim plus 🤯 and closed on ✨.
 *
 * The empty case is the one worth asserting: a first draft has nothing to
 * avoid, and a block saying so ("Already written recently:" followed by
 * nothing) would be an instruction pointing at no examples.
 */
describe("describeRecent", () => {
  it("is empty for a user with nothing written yet", () => {
    expect(describeRecent([])).toBe("")
  })

  it("is empty when every recent body is blank", () => {
    expect(describeRecent(["", "   "])).toBe("")
  })

  it("fences each post so the model can tell where one ends", () => {
    const block = describeRecent(["first post", "second post"])

    expect(block).toContain("first post")
    expect(block).toContain("second post")
    expect(block.split("---").length - 1).toBe(3)
  })
})
