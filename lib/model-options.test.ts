import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The effort knobs are read at module load, so every case here re-imports the
 * module with a different environment. `vi.resetModules` rather than a factory
 * function on purpose: the point of this file is that the values are decided in
 * one place at startup, and a test that called a helper would be testing a
 * shape the product does not use.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return import("./model-options")
}

const ORIGINAL = {
  REASONING_EFFORT: process.env.REASONING_EFFORT,
  DRAFTING_REASONING_EFFORT: process.env.DRAFTING_REASONING_EFFORT,
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.resetModules()
})

describe("REASONING", () => {
  it("defaults to the measured low", async () => {
    const { REASONING } = await load({
      REASONING_EFFORT: undefined,
      DRAFTING_REASONING_EFFORT: undefined,
    })
    expect(REASONING.openai.reasoningEffort).toBe("low")
  })

  it("carries the same effort to every provider key", async () => {
    const { REASONING } = await load({
      REASONING_EFFORT: "medium",
      DRAFTING_REASONING_EFFORT: undefined,
    })
    expect(REASONING.anthropic.reasoningEffort).toBe("medium")
    expect(REASONING.deepseek.reasoningEffort).toBe("medium")
  })
})

/**
 * Plan 028 item 1h. The global `low` was measured on angle generation, where a
 * weak result costs a click and there are five of them on the card. The draft
 * is the end of the pipeline and goes out under the user's name, so it gets its
 * own step — and its own variable, so raising one cannot silently raise the
 * other.
 */
describe("DRAFTING_REASONING", () => {
  it("sits one step above the global default", async () => {
    const { REASONING, DRAFTING_REASONING } = await load({
      REASONING_EFFORT: undefined,
      DRAFTING_REASONING_EFFORT: undefined,
    })
    expect(REASONING.openai.reasoningEffort).toBe("low")
    expect(DRAFTING_REASONING.openai.reasoningEffort).toBe("medium")
  })

  it("steps up from wherever the global was moved to", async () => {
    const { DRAFTING_REASONING } = await load({
      REASONING_EFFORT: "medium",
      DRAFTING_REASONING_EFFORT: undefined,
    })
    expect(DRAFTING_REASONING.openai.reasoningEffort).toBe("high")
  })

  it("stops at the top of the ladder rather than inventing a level", async () => {
    const { DRAFTING_REASONING } = await load({
      REASONING_EFFORT: "high",
      DRAFTING_REASONING_EFFORT: undefined,
    })
    expect(DRAFTING_REASONING.openai.reasoningEffort).toBe("high")
  })

  /**
   * A value off the ladder has no step above it that we can name — a provider
   * string, a typo, a level that does not exist yet. Passing the operator's own
   * value through is the honest answer, and the gateway already degrades an
   * unknown one to the provider's default instead of failing the call.
   */
  it("passes an unrecognised effort through unchanged", async () => {
    const { DRAFTING_REASONING } = await load({
      REASONING_EFFORT: "exhaustive",
      DRAFTING_REASONING_EFFORT: undefined,
    })
    expect(DRAFTING_REASONING.openai.reasoningEffort).toBe("exhaustive")
  })

  it("takes its own override, and does not move the global with it", async () => {
    const { REASONING, DRAFTING_REASONING } = await load({
      REASONING_EFFORT: "low",
      DRAFTING_REASONING_EFFORT: "high",
    })
    expect(DRAFTING_REASONING.anthropic.reasoningEffort).toBe("high")
    expect(REASONING.anthropic.reasoningEffort).toBe("low")
  })

  it("is not moved by raising the global for a debugging session", async () => {
    const { DRAFTING_REASONING } = await load({
      REASONING_EFFORT: "high",
      DRAFTING_REASONING_EFFORT: "low",
    })
    expect(DRAFTING_REASONING.openai.reasoningEffort).toBe("low")
  })
})
