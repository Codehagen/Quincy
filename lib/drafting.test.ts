import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CHANNEL_TONE,
  DRAFTING_RULES,
  STORY_SHAPE,
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

/**
 * Plan 028 item 1d. `DRAFTING_MODEL` used to fall through to `CHAT_MODEL`, so
 * the split it exists to create held only for whoever set both — and the string
 * is a database key as well as a model id (`draftsToday` in lib/mcp.ts counts
 * the daily ceiling with `eq(usageEvent.model, DRAFTING_MODEL)`), so a silent
 * move resets that ceiling to zero.
 */
describe("DRAFTING_MODEL", () => {
  const ORIGINAL = {
    DRAFTING_MODEL: process.env.DRAFTING_MODEL,
    CHAT_MODEL: process.env.CHAT_MODEL,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    vi.resetModules()
  })

  async function load(env: Record<string, string | undefined>) {
    vi.resetModules()
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return import("./drafting")
  }

  it("does not follow CHAT_MODEL", async () => {
    const drafting = await load({
      DRAFTING_MODEL: undefined,
      CHAT_MODEL: "openai/gpt-5.6-luna",
    })
    expect(drafting.DRAFTING_MODEL).toBe("anthropic/claude-sonnet-5")
  })

  it("takes its own variable", async () => {
    const drafting = await load({
      DRAFTING_MODEL: "openai/gpt-5.6-luna",
      CHAT_MODEL: undefined,
    })
    expect(drafting.DRAFTING_MODEL).toBe("openai/gpt-5.6-luna")
  })
})

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

  /**
   * Plan 028 item 1f. The numbers alone let two versions be one sentence
   * trimmed to two sizes: both under the ceiling, both front-loaded, both the
   * same post. The tone line is the part that says how the reading differs.
   */
  it("says how each channel is read, not only how long it lets a post be", () => {
    const description = describeConstraints(
      targetsFor("Short post", ["x", "linkedin"])
    )

    expect(description).toContain("How it reads there:")
    // X hides nothing, so a short line is a choice rather than a truncation.
    expect(description).toContain("reads as deliberate")
    // LinkedIn's first line is the whole post for most of the feed.
    expect(description).toContain("cannot be the setup half of a payoff")
  })

  it("gives X and LinkedIn different tone lines", () => {
    const lines = describeConstraints(
      targetsFor("Short post", ["x", "linkedin"])
    )
      .split("\n")
      .filter((line) => line.includes("How it reads there:"))

    expect(lines).toHaveLength(2)
    expect(lines[0]).not.toBe(lines[1])
  })

  /**
   * The numbers stay alone on the labelled line. They are enforced on send and
   * the tone line is a reading of the room; joining them would also break the
   * per-channel lookup the two tests above this one do.
   */
  it("keeps the tone on its own line, under the numbers", () => {
    const [xLine, toneLine] = describeConstraints(targetsFor("Thread", ["x"]))
      .split("\n")
      .slice(0, 2)

    expect(xLine.startsWith("X:")).toBe(true)
    expect(xLine).not.toContain("How it reads there:")
    expect(toneLine.trim().startsWith("How it reads there:")).toBe(true)
  })

  /**
   * A channel with no tone entry prints its numbers and stops. Inventing a
   * claim about how an unknown platform reads is the one failure worse than
   * saying nothing — see the assertion above that "Mystery" is exactly one
   * line.
   */
  it("prints no tone line for a channel the tone table does not know", () => {
    const description = describeConstraints([
      {
        id: "mystery",
        label: "Mystery",
        rules: { limit: 100, fold: null, urlCost: null },
      },
    ])
    expect(description).not.toContain("How it reads there:")
  })

  /**
   * The tone table is keyed by the registry's channel ids rather than being a
   * second list of channels. A key that is not in `CHANNEL_RULES` is a line
   * nobody will ever see — the renamed-channel failure, silent in production
   * and loud here. The reverse is deliberately not asserted: a registry channel
   * with no tone line prints its numbers and stops.
   */
  it("keys every tone line to a channel the registry knows", () => {
    for (const id of Object.keys(CHANNEL_TONE)) {
      expect(CHANNEL_RULES[id]).toBeDefined()
    }
  })
})

/**
 * Plan 028 item 1a. The house shape — did, happened, meant; one clause each;
 * the user as the subject of the first; the number on its own line — used to
 * ride entirely on `describeBeats`, which returns "" unless `selectShippedPassage`
 * filled `beats`. That made it a GitHub-merge feature: voice notes, meetings
 * and pastes reached the writer with no structural instruction at all, and came
 * back as summaries. These assert the shape is now in the rules for every kind
 * of material, and that it still refuses to be forced onto material that is not
 * a story.
 */
describe("STORY_SHAPE", () => {
  it("names the three beats and the form they take", () => {
    expect(STORY_SHAPE).toContain("what the user did")
    expect(STORY_SHAPE).toContain("what happened")
    expect(STORY_SHAPE).toContain("what it meant")
    expect(STORY_SHAPE).toContain("One clause per block")
    expect(STORY_SHAPE).toContain("blank line between them")
    expect(STORY_SHAPE).toContain("the user is the subject of the first")
    // Digits, not a spelled-out word: "twelve riffs had been ready" reads as
    // prose and the reader goes past it. See the note in describeBeats.
    // Digits and a line of its own, but the noun stays attached: an early
    // version of this rule said only "its own line" and a live draft came back
    // with "12" orphaned above "riffs sat ready".
    expect(STORY_SHAPE).toContain("opens its own line, in digits")
    expect(STORY_SHAPE).toContain("never the bare")
  })

  it("applies without supplied beats, and defers to them when they exist", () => {
    // The default half: no beats block in the prompt is not a licence to write
    // a paragraph.
    expect(STORY_SHAPE).toContain("find the shape in the material")
    // The deference half, in the same words `describeBeats` uses.
    expect(STORY_SHAPE).toContain(
      "those are the beats and they win over any you would pick yourself"
    )
  })

  /**
   * The guard, and the reason this is one rule and not two sentences: a shape
   * with no exit turns an opinion into a fake anecdote and bolts a moral onto a
   * question, which is the tidy lesson `TELLS` forbids, rebuilt as structure.
   */
  it("refuses to force the shape onto material that is not a story", () => {
    expect(STORY_SHAPE).toContain("is not forced into that shape")
    expect(STORY_SHAPE).toContain("An observation, an opinion, a question")
    expect(STORY_SHAPE).toContain('invented "what it meant"')
  })

  it("is actually in the prompt, and sits under the tells it depends on", () => {
    expect(DRAFTING_RULES).toContain(STORY_SHAPE)
    // TELLS ends on "the number is the post"; this opens on where that number
    // goes. Order is the argument for the adjacency.
    expect(DRAFTING_RULES.indexOf("Prefer the specific detail")).toBeLessThan(
      DRAFTING_RULES.indexOf(STORY_SHAPE)
    )
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

  /**
   * The failure this pair exists for, from a real draft on 2026-09-10.
   *
   * Merge `9b11b0e` was selected correctly: `learned` came back as "The work
   * was already there; Quincy just never gave you a reason to open it." The
   * draft took beats 1 and 2 nearly verbatim and then closed on the `forUser`
   * line — "Now it shows the strongest unfinished idea, how long it waited,
   * and where to continue." A person's sentence was in the database and a
   * product sentence went out in its place, which is most of what made the
   * post read as a release note rather than as somebody talking.
   *
   * Both lines are one true clause about the same change, so ranking them was
   * never something the writer could infer. It is said here, and again at the
   * other end in `describeMaterial` (lib/angle-draft.ts).
   */
  it("names beat 3 as the learned line, so the user-facing line cannot take it", () => {
    const block = describeBeats(beats)

    expect(block).toContain("Beat 3 is the line above and nothing else")
    expect(block).toContain("What changed for a user")
    expect(block).toContain("never the closing block")
  })

  it("asks for the number in digits, on its own line", () => {
    const block = describeBeats(beats)

    expect(block).toContain("in digits, opening a line with the thing it counts")
  })

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
   * Plan 028 item 1a. The rules now carry the same shape for every kind of
   * material, so this block has to read as the specific case of it rather than
   * as a second, competing instruction — a model handed two rules that disagree
   * obeys the nearer one, and this is the nearer one.
   */
  it("presents itself as the rules' shape with the clauses already found", () => {
    const block = describeBeats(beats)

    expect(block).toContain("the shape the rules describe")
    expect(block).toContain("use these rather than looking for your own")
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
