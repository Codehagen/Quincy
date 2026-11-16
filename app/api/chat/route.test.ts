import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import { TELLS } from "@/lib/drafting"

/**
 * The chat prompt, asserted against its own source text.
 *
 * A route file may export the handler, `maxDuration` and a short list of
 * segment options and nothing else — Next's generated type guard diffs the
 * module's exports against that list and fails the build on anything extra
 * (`createTypeGuardFile` in next/dist/build/webpack/plugins/next-types-plugin).
 * So `BASE_PROMPT` cannot be exported to be read here, and importing the module
 * to reach it is worse than reading the file: `@/lib/auth` builds its adapter at
 * module scope, and the plugin init behind it opens a real connection to Neon.
 * A unit test that talks to the production database to check a string is not a
 * unit test.
 *
 * Reading the source is the shape lib/adapt.test.ts already uses for the same
 * class of assertion, and it costs nothing.
 */
async function chatPrompt(): Promise<string> {
  return readFile(new URL("./route.ts", import.meta.url), "utf8")
}

describe("the chat's anti-slop rules", () => {
  it("names the structures, not only the vocabulary", async () => {
    // Word bans are easy to route around. The shapes are what make a turn read
    // as a generic assistant, and they survive any amount of word substitution.
    const source = await chatPrompt()

    expect(source).toContain("No tidy lesson at the end of a message")
    expect(source).toContain("No setup and reversal")
    expect(source).toContain(
      "Prefer the specific detail over the summary of it"
    )
  })

  it("is unconditional, unlike the drafting list it is drawn from", async () => {
    // TELLS defers to the user's own posts because a draft goes out under their
    // name. This prompt has no posts in it — `describeExamples` renders on the
    // drafting side only — so the same deference here would be a condition the
    // model cannot evaluate. See the comment above CHAT_TELLS.
    const source = await chatPrompt()
    const rules = source.slice(
      source.indexOf("const CHAT_TELLS = `"),
      source.indexOf("const BASE_PROMPT = `")
    )

    expect(rules).not.toBe("")
    expect(rules).not.toContain("unless the user's own posts")
    expect(rules).toContain("none of them is conditional")
  })

  it("reaches the model rather than only existing", async () => {
    // The regression this catches is a constant that is written, reviewed and
    // never interpolated. Nothing else in the route would notice.
    const source = await chatPrompt()
    const prompt = source.slice(source.indexOf("const BASE_PROMPT = `"))

    expect(prompt).toContain("${CHAT_TELLS}")
  })

  /**
   * The drift alarm, and the reason a second list is allowed to exist.
   *
   * Two copies of a word list will disagree eventually. Rather than share the
   * words — which would separate the body of a conditional rule in `TELLS` from
   * its condition — this asserts every word the chat names is still named
   * there, so removing one from the drafting list fails here instead of leaving
   * the chat quietly enforcing a rule the writer no longer follows.
   */
  it("names no hype or ghostwriter word that TELLS has dropped", async () => {
    const source = await chatPrompt()
    const rules = source.slice(
      source.indexOf("const CHAT_TELLS = `"),
      source.indexOf("const BASE_PROMPT = `")
    )

    const words = [
      ...rules.matchAll(
        /- No (?:hype about their work or your own|ghostwriter vocabulary): (.+)\n/g
      ),
    ]
      .flatMap((match) => match[1].split(/[,.]/))
      .map((word) => word.trim())
      .filter(Boolean)
      .filter((word) => !word.startsWith("Say what"))

    expect(words.length).toBeGreaterThan(15)

    for (const word of words) {
      expect(TELLS, `"${word}" is no longer in TELLS`).toContain(word)
    }
  })
})

/**
 * The rules that were already there. Adding to a prompt is where rules get lost
 * — a replaced template literal takes its neighbours with it — and two of these
 * are the ones the product cannot be wrong about: the tools are the only source
 * of state, and nothing publishes without the user.
 */
describe("the chat prompt keeps its tool and approval rules", () => {
  it("still says every state question is answered from a tool", async () => {
    const source = await chatPrompt()

    expect(source).toContain("Look before you answer")
    expect(source).toContain("Never invent a riff, a draft, a hook or a time")
    expect(source).toContain("call read_source first")
    expect(source).toContain("read_numbers is how you argue with a draft")
    expect(source).toContain(
      "capture_riff. That is how anything becomes something the product can work on."
    )
  })

  it("still refuses to publish, approve or schedule", async () => {
    const source = await chatPrompt()

    expect(source).toContain("You draft, they send")
    expect(source).toContain("cannot approve, schedule or publish")
    expect(source).toContain("it is waiting for them")
  })

  it("still bounds what the two writes may cost", async () => {
    const source = await chatPrompt()

    expect(source).toContain("The writes cost money")
    expect(source).toContain("If a tool refuses")
  })

  it("treats write-about as a draft, not another menu", async () => {
    const source = await chatPrompt()
    const prompt = source.slice(source.indexOf("const BASE_PROMPT = `"))

    expect(prompt).toContain('"What should I write" is a menu')
    expect(prompt).toContain("is not a menu")
    expect(prompt).toContain("call draft_angle")
    expect(prompt).toContain("The Safari card is the writing")
  })
})
