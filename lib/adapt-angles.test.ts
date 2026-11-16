import { readFile } from "node:fs/promises"

import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The five angle prompts, asserted at the only place they are all the same
 * shape: the `system` string that actually leaves for the gateway.
 *
 * Two claims are being pinned, and both are the kind that regress silently.
 *
 * **The examples reach every one of them** (plans/028 item 1b). These five
 * choose the hook, and lib/drafting.ts's IDENTITY then calls that hook "the
 * whole bet on any platform" and instructs the writer to keep it. Until
 * 2026-09-09 the prompt that picks it saw the voice as a list of rules and
 * never as a post — the weakest-context prompt in the chain deciding the most
 * important line. A regression here is invisible from the output: the angles
 * still come back, plausible and in nobody's voice, exactly the way
 * lib/angle-draft.ts's swapped-array bug read.
 *
 * **The shared body is genuinely shared** (item 1c). The rules were hand-copied
 * five times and had already drifted; the test that matters is that a change to
 * one reaches the rest.
 *
 * `ai` is mocked rather than the network stubbed, the way lib/voice-preview.test.ts
 * mocks `./db` — what `generateObject` does with the prompt is its concern, and
 * what is unproven without this file is the prompt.
 */

const generateObject = vi.hoisted(() => vi.fn())

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai")
  return { ...actual, generateObject }
})

const {
  generateAngles,
  generateAnglesFromSaid,
  buildShippedAnglePrompt,
  generateAnglesFromShipped,
  generateChannelAngle,
  generateSteeredAngle,
} = await import("./adapt")

/** A well-formed answer, so `retryMalformed` asks exactly once. */
const ANSWER = {
  object: {
    angles: [
      { hook: "Switched models.", shape: "Short post", kind: "Story", why: "" },
    ],
    groundedIn: "",
  },
  usage: { inputTokens: 1, outputTokens: 1 },
}

/** Distinctive enough that `indexOf` cannot match it anywhere else. */
const BRAIN = "## Brain\n\nvoice: writes in lowercase, ends with ✨"
const EXAMPLE = "shipped the thing. broke twice. worth it ✨"

const SHAPES = ["Short post", "Thread"] as const

const SOURCE = {
  body: "Per-seat pricing punishes the customer you want most.",
  handle: "someone",
  url: "https://x.com/someone/status/1",
}

const FACTS = {
  repository: "Codehagen/quincy",
  number: 1,
  private: true,
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  commits: 1,
  labels: [] as string[],
  mergedAt: "2026-09-01T00:00:00.000Z",
  repo: null,
}

const BEATS = { did: "did", happened: "happened", learned: "meant" }

/** The `system` string of the one call the run makes. */
async function systemFor(run: () => Promise<unknown>): Promise<string> {
  generateObject.mockReset()
  generateObject.mockResolvedValue(ANSWER)
  await run()
  expect(generateObject).toHaveBeenCalledTimes(1)
  return generateObject.mock.calls[0][0].system as string
}

/** The five, each as "run it with this brain and these examples". */
const PROMPTS: Record<
  string,
  (input: { brain: string; examples?: string[] }) => Promise<unknown>
> = {
  angles: ({ brain, examples }) =>
    generateAngles({
      source: SOURCE,
      note: "",
      brain,
      shapes: SHAPES,
      examples,
    }),
  said: ({ brain, examples }) =>
    generateAnglesFromSaid({
      scrap: "so the thing is, uh, the pricing",
      note: "",
      brain,
      shapes: SHAPES,
      examples,
    }),
  shipped: ({ brain, examples }) =>
    generateAnglesFromShipped({
      scrap: "Swapped the model behind drafting.",
      brain,
      shapes: SHAPES,
      facts: FACTS,
      forUser: "Drafts cost less.",
      beats: BEATS,
      examples,
    }),
  channel: ({ brain, examples }) =>
    generateChannelAngle({
      scrap: "so the thing is, uh, the pricing",
      existing: ["an angle they already have"],
      channelLabel: "LinkedIn",
      shapes: SHAPES,
      brain,
      examples,
    }),
  steer: ({ brain, examples }) =>
    generateSteeredAngle({
      scrap: "so the thing is, uh, the pricing",
      existing: ["an angle they already have"],
      note: "more about the numbers",
      shapes: SHAPES,
      brain,
      examples,
    }),
}

const NAMES = Object.keys(PROMPTS)

/** The three that ask for two to four angles, and the two that ask for one. */
const SET_PROMPTS = ["angles", "said", "shipped"]
const ONE_PROMPTS = ["channel", "steer"]
/** All five, for the rules every one of them must carry. */
const ALL_PROMPTS = [...SET_PROMPTS, ...ONE_PROMPTS]

/** Enough of a merge for `describeFacts` to render; the numbers are not read. */
const SHIPPED_FACTS = {
  repository: "Codehagen/Quincy",
  number: 3,
  private: false,
  additions: 4651,
  deletions: 96,
  changedFiles: 25,
  commits: 1,
  labels: [],
  mergedAt: "2026-09-09T19:00:18.000Z",
  repo: null,
}

beforeEach(() => {
  generateObject.mockReset()
})

describe("the user's own posts reach every angle prompt", () => {
  it.each(NAMES)("%s shows them verbatim", async (name) => {
    const system = await systemFor(() =>
      PROMPTS[name]({ brain: BRAIN, examples: [EXAMPLE] })
    )

    expect(system).toContain(EXAMPLE)
    expect(system).toContain("## How the user actually writes")
  })

  it.each(NAMES)("%s puts them after the brain, not before", async (name) => {
    // The last thing read before the question is the writing rather than a
    // description of it — `buildSystemPrompt` in lib/drafting.ts makes the same
    // argument, and these five now make it too.
    const system = await systemFor(() =>
      PROMPTS[name]({ brain: BRAIN, examples: [EXAMPLE] })
    )

    expect(system.indexOf(BRAIN)).toBeGreaterThan(-1)
    expect(system.indexOf(BRAIN)).toBeLessThan(
      system.indexOf("## How the user actually writes")
    )
  })

  it.each(NAMES)(
    "%s is unchanged for an account with no corpus",
    async (name) => {
      // Absent-safe, which is the condition on shipping this at all: every
      // account that has never had its corpus read must get the prompt it has
      // been getting. `describeExamples([])` is "" and the filter drops it.
      const before = await systemFor(() => PROMPTS[name]({ brain: BRAIN }))
      const empty = await systemFor(() =>
        PROMPTS[name]({ brain: BRAIN, examples: [] })
      )
      const blank = await systemFor(() =>
        PROMPTS[name]({ brain: BRAIN, examples: ["  ", ""] })
      )

      expect(empty).toBe(before)
      expect(blank).toBe(before)
      expect(before).not.toContain("## How the user actually writes")
      // Nothing trailing the brain, so no empty section is left behind.
      expect(before.endsWith(BRAIN)).toBe(true)
    }
  )

  it.each(NAMES)("%s still works for an empty brain", async (name) => {
    // A brand-new account has neither, and the two absences are independent —
    // the filter has to drop each of them on its own.
    const system = await systemFor(() =>
      PROMPTS[name]({ brain: "", examples: [EXAMPLE] })
    )

    expect(system).toContain(EXAMPLE)
    expect(system).not.toContain("\n\n\n")
  })
})

describe("the shared angle rules", () => {
  /**
   * The hook rule is the one every angle prompt has, and until the factoring it
   * existed in two wordings: the three set prompts forbade a description of an
   * opening line and forbade title case, and the two single-angle prompts
   * forbade neither. One wording now, and it is the sharper one.
   */
  it.each(NAMES)("%s forbids a title-cased hook", async (name) => {
    const system = await systemFor(() => PROMPTS[name]({ brain: BRAIN }))

    expect(system).toContain(
      `- "hook" is the real opening line, written as they would write it — not a description of one. No "a post about..." and no title case.`
    )
  })

  it.each(NAMES)("%s names the six kinds", async (name) => {
    const system = await systemFor(() => PROMPTS[name]({ brain: BRAIN }))

    expect(system).toContain(`- "kind" is one of: Announcement`)
  })

  it("carries the measured half of the signature rule into the merge prompt", async () => {
    // `shippedRules` stopped at "told apart from the others" and lost the
    // clause with a number behind it. That is the drift this factoring exists
    // to make impossible, so it is asserted on the prompt that had it.
    const system = await systemFor(() => PROMPTS.shipped({ brain: BRAIN }))

    expect(system).toContain("four hooks ending in the same emoji")
  })

  it.each(SET_PROMPTS)(
    "%s asks for fewer angles when fewer are real",
    async (name) => {
      const system = await systemFor(() => PROMPTS[name]({ brain: BRAIN }))

      expect(system).toContain("- Return FEWER angles when fewer are real.")
      expect(system).toContain(
        "An empty string is still an acceptable answer and a lie is not."
      )
      expect(system).toContain(
        "- Write in English unless the brain instructs otherwise."
      )
      // The shape rule, narrowed to what this account can publish.
      expect(system).toContain("Thread (reaches X)")
      expect(system).not.toContain("Essay (reaches Substack)")
    }
  )

  it.each(ONE_PROMPTS)("%s asks for one angle or none", async (name) => {
    const system = await systemFor(() => PROMPTS[name]({ brain: BRAIN }))

    expect(system).toContain("- Return at most one angle.")
    // Deliberately absent, and each for its own reason — see the section
    // comment in lib/adapt.ts. Shape is already decided by the user prompt and
    // by a filter in code; `groundedIn` has no reader on these two paths.
    expect(system).not.toContain("- Return FEWER angles")
    expect(system).not.toContain(`- Set "groundedIn"`)
    expect(system).not.toContain(`- "shape" is one of:`)
  })

  it.each(ONE_PROMPTS)(
    "%s writes in the posting language, not the material's",
    async (name) => {
      // The one point the five used to disagree on, settled on 2026-09-09: a
      // hook in the material's language reaches a writer told to post in
      // English, and the line the user picked is then either silently rewritten
      // or printed into a mixed-language post. All five now defer to the brain,
      // which is the one place a language decision belongs.
      const system = await systemFor(() => PROMPTS[name]({ brain: BRAIN }))

      expect(system).toContain("- Write in English unless the brain instructs otherwise.")
      expect(system).not.toContain("in the language they used")
    }
  )

  it("keeps the user-facing line out of the closing block", async () => {
    // From a real angle set on 2026-09-10, merge `9b11b0e`. The selection had
    // found "The work was already there; Quincy just never gave you a reason to
    // open it." and the first angle closed on the `forUser` sentence instead —
    // "Now it shows the strongest unfinished idea, how long it waited, and
    // where to continue." The second angle in the same set closed correctly, so
    // the model can find the line; nothing ranked the two for it.
    const system = await systemFor(() => PROMPTS.shipped({ brain: BRAIN }))

    expect(system).toContain("never what the product now does for a stranger")
    expect(system).toContain("closes on the feature it announced is a release note")
  })

  it("labels the user-facing line as context in the user prompt", () => {
    const prompt = buildShippedAnglePrompt({
      scrap: "Merged the thing.",
      facts: SHIPPED_FACTS,
      forUser: "Quincy now surfaces the strongest unfinished idea first.",
      beats: {
        did: "made Quincy speak first",
        happened: "twelve riffs sat ready",
        learned: "The work was already there.",
      },
    })

    expect(prompt).toContain("never the last line of a post")
    // The beat it must not be confused with is still there, unqualified.
    expect(prompt).toContain("The work was already there.")
  })

  it.each(ALL_PROMPTS)("%s can refuse an off-strategy angle", async (name) => {
    // Plan 028 item 2c. The strategy has rendered into these prompts since 027
    // (`renderBrainForUser` emits policy pages as "## Strategy — X"), and only
    // the writer was ever told what to do with it — which is one step too late,
    // because by then the angle is already chosen. Dropping an off-strategy
    // angle is a decision only this step can make.
    const system = await systemFor(() => PROMPTS[name]({ brain: BRAIN }))

    expect(system).toContain('name which one in "why"')
    expect(system).toContain("The avoid list is a rule and not a preference")
    // Silent when there is no strategy, which is what makes it safe to ship
    // before the account has one.
    expect(system).toContain("When there is no strategy")
  })

  it.each(ALL_PROMPTS)("%s decides language in one place", async (name) => {
    // The rule that makes the settlement worth anything: no prompt may take the
    // material's language as an instruction. `englishCaveat` says the opposite
    // out loud on the transcript and merge paths, and lives in the set body.
    const system = await systemFor(() => PROMPTS[name]({ brain: BRAIN }))

    expect(system).toContain("- Write in English unless the brain instructs otherwise.")
  })

  it("builds all five from the one builder", async () => {
    // Asserted on the source, the way this file's neighbour bans `minItems`:
    // what is being pinned is that no sixth hand-copied list can appear without
    // the count moving.
    const source = await readFile(
      new URL("./adapt.ts", import.meta.url),
      "utf8"
    )

    const uses = source.match(/ANGLE_BASE_RULES\(\{/g)
    expect(uses).toHaveLength(5)
  })
})

describe("the callers fetch the examples", () => {
  /**
   * The prompts above accept examples; these two files are what actually put
   * them there. Asserted on the source because both call sites need a session
   * and a database — the same shape lib/adapt.test.ts uses for the cooldown.
   */
  it("reads them beside the brain on all three riff paths", async () => {
    const source = await readFile(
      new URL("./riffs.ts", import.meta.url),
      "utf8"
    )

    // One read, in the one function all three angle call sites spread.
    expect(source).toContain("voiceExamples({ userId })")
    expect(source).toContain(
      "return { brain, shapes, recentKinds: kinds, examples }"
    )
    // Still three spreads of it, so a fourth path cannot quietly skip it.
    expect(
      source.match(/\.\.\.\(await angleContext\(userId\)\)/g)
    ).toHaveLength(3)
  })

  it("reads them beside the brain on both /riffs actions", async () => {
    const source = await readFile(
      new URL("../app/(app)/riffs/actions.ts", import.meta.url),
      "utf8"
    )

    expect(
      source.match(/voiceExamples\(\{ userId: session\.user\.id \}\)/g)
    ).toHaveLength(2)
    // Threaded, not merely fetched.
    expect(source.match(/^\s+examples,$/gm)).toHaveLength(2)
  })
})
