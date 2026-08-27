import { describe, expect, it } from "vitest"

import {
  buildUserPrompt,
  describeBeats,
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

/**
 * The three beats, and the one thing that decides whether they are printed at
 * all: at least one of them has to exist.
 *
 * An empty block would be three labels with nothing after them, and "What it
 * meant:" followed by a blank is an invitation to fill it in — which is the
 * moral `TELLS` spends a bullet forbidding. See plans/026 decision 7.
 */
describe("describeBeats", () => {
  const beats = {
    did: "Switched from one model to a cheaper one.",
    happened: "69x cheaper for the same job.",
    learned: "It took an afternoon.",
  }

  it("is empty for a voice note, which has no beats", () => {
    expect(describeBeats(undefined)).toBe("")
    expect(describeBeats({ did: "", happened: "", learned: "" })).toBe("")
    expect(describeBeats({ did: " ", happened: "", learned: "  " })).toBe("")
  })

  it("prints all three in order, with the form under them", () => {
    const block = describeBeats(beats)

    expect(block.indexOf("1. What you did")).toBeLessThan(
      block.indexOf("2. What happened")
    )
    expect(block.indexOf("2. What happened")).toBeLessThan(
      block.indexOf("3. What it meant")
    )
    expect(block).toContain("69x cheaper for the same job.")
    expect(block).toContain("blank line between them")
    expect(block).toContain("do not invent the missing one")
  })

  /**
   * Plan 027 phase 1e. `did` and `happened` are quoted out of a description
   * written for a repository, and in this corpus that description is in
   * Norwegian while the post is in English — so a beat reached the writer as a
   * Norwegian clause and was printed verbatim into an English post. The rule
   * that fixes it has to be in this block, because this is the only place the
   * beats are named.
   */
  it("tells the writer to translate a beat and keep its number", () => {
    const block = describeBeats({
      did: "Kjørt i prod 2026-08-26",
      happened: "37% av notatet gikk tapt.",
      learned: "",
    })

    expect(block).toContain("translated, not quoted")
    expect(block).toContain("Every number in it survives the translation")
    expect(block).toContain(
      "Nothing goes out verbatim in a language the reader does not read"
    )
  })

  /**
   * One beat is enough to print the block. A merge that only described a state
   * has no "did", and the writer is told to write the two it has — which is a
   * different instruction from being handed nothing.
   */
  it("prints the block when only one beat survived the quote check", () => {
    const block = describeBeats({
      did: "",
      happened: "83/100 to 100/100.",
      learned: "",
    })

    expect(block).toContain("83/100 to 100/100.")
    expect(block).toContain("If a beat is empty")
  })
})

describe("buildUserPrompt", () => {
  const base = {
    hook: "Switched models and the bill fell.",
    shape: "Short post" as const,
    scrapOrIdea: "The pull request body, in full.",
    sourceLabel: "Pull request",
    channels: targetsFor("Short post", ["x"]),
  }

  it("carries no beats block for a riff that has none", () => {
    const prompt = buildUserPrompt(base)

    expect(prompt).toContain("Material:")
    expect(prompt).not.toContain("The three beats")
  })

  /**
   * After the material and before the constraints. The beats are a reading of
   * the description, so putting them above it would make the user's own words
   * look like supporting detail for a summary somebody else wrote.
   */
  it("puts the beats between the material and the channel constraints", () => {
    const prompt = buildUserPrompt({
      ...base,
      beats: {
        did: "Switched from one model to a cheaper one.",
        happened: "69x cheaper for the same job.",
        learned: "",
      },
    })

    expect(prompt.indexOf("Material:")).toBeLessThan(
      prompt.indexOf("The three beats")
    )
    expect(prompt.indexOf("The three beats")).toBeLessThan(
      prompt.indexOf("Write one post for each of these channels")
    )
  })
})
