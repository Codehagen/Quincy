import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The voice preview, tested for the three things that cost money or trust:
 * the cooldown holds, the ceiling holds, and the two prompts differ *only* by
 * the voice section — which is the entire claim the side-by-side makes.
 *
 * The fourth is a negative and matters as much: a demonstration must never
 * become a draft. Asserted twice, once on the module's own imports and once on
 * a real run through a stubbed generator.
 *
 * The database is mocked, the way lib/chat-tools.test.ts mocks it: what
 * `getBrainByKind` returns is its own concern, and what is unproven without
 * this file is the guarding and the prompt shape.
 */

const readVoiceLedger = vi.hoisted(() => vi.fn())
const writeVoiceLedger = vi.hoisted(() => vi.fn())
const getBrainByKind = vi.hoisted(() => vi.fn())
const recordUsage = vi.hoisted(() => vi.fn())
const insert = vi.hoisted(() => vi.fn())

vi.mock("./voice", () => ({
  readVoiceLedger,
  writeVoiceLedger,
  VOICE_LEDGER_SLUG: "voice/ledger",
}))

vi.mock("./brain", async () => {
  const actual = await vi.importActual<typeof import("./brain")>("./brain")
  return { ...actual, getBrainByKind }
})

vi.mock("./usage", () => ({ recordUsage }))

/**
 * One chain, and `insert` is on it so the "nothing is written" assertion has
 * something to be false against. If this module ever grows a write, this spy
 * catches it rather than the test silently passing on an absence.
 */
vi.mock("./db", () => ({
  db: {
    insert,
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
    }),
  },
}))

import {
  buildPreviewPrompts,
  cooldownLeft,
  FALLBACK_TOPIC,
  fitToCeiling,
  MAX_INPUT_BYTES,
  maxOutputTokensFor,
  namedRules,
  numberVoice,
  previewVoice,
  PREVIEW_COOLDOWN_MS,
  PREVIEW_USAGE_LABEL,
  type PreviewGenerator,
} from "./voice-preview"

const NOW = new Date("2026-08-27T12:22:00Z")

const voicePage = (rules: string[]) => ({
  id: "bp_1",
  userId: "u1",
  kind: "voice" as const,
  slug: "voice/x",
  title: "Voice — X",
  body: "",
  data: { rules },
  provenance: "published" as const,
  createdAt: NOW,
  updatedAt: NOW,
})

beforeEach(() => {
  vi.clearAllMocks()
  readVoiceLedger.mockResolvedValue({ edits: {} })
  writeVoiceLedger.mockResolvedValue(undefined)
  getBrainByKind.mockResolvedValue([voicePage(["Never uses hashtags."])])
  recordUsage.mockResolvedValue(undefined)
})

/** A generator that records what it was asked and answers instantly. */
function stub() {
  const seen: Parameters<PreviewGenerator>[0][] = []
  const generate: PreviewGenerator = async (input) => {
    seen.push(input)
    return {
      without: "A post with no voice behind it.",
      with: "a post that sounds like him",
      rulesUsed: ["1"],
      usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 120 },
    }
  }
  return { seen, generate }
}

describe("cooldownLeft", () => {
  it("is nothing when nobody has pressed it", () => {
    expect(cooldownLeft(undefined, NOW)).toBe(0)
  })

  it("is nothing once the ten minutes are up", () => {
    const then = new Date(NOW.getTime() - PREVIEW_COOLDOWN_MS).toISOString()
    expect(cooldownLeft(then, NOW)).toBe(0)
  })

  it("counts down from the last press", () => {
    const then = new Date(NOW.getTime() - 60_000).toISOString()
    expect(cooldownLeft(then, NOW)).toBe(PREVIEW_COOLDOWN_MS - 60_000)
  })

  it("treats an unreadable stamp as free rather than as forever", () => {
    expect(cooldownLeft("not a date", NOW)).toBe(0)
  })
})

describe("previewVoice, the cooldown", () => {
  it("refuses inside the window and names the time to come back", async () => {
    readVoiceLedger.mockResolvedValue({
      edits: {},
      previewAt: new Date(NOW.getTime() - 8 * 60_000).toISOString(),
    })

    const { seen, generate } = stub()
    const result = await previewVoice({
      userId: "u1",
      now: NOW,
      timezone: "UTC",
      generate,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("cooldown")
    // Two minutes left of ten, pressed at 12:22.
    expect(result.message).toBe("Try again after 12:24.")
    // The refusal is free: no model call, no spend, no stamp.
    expect(seen).toHaveLength(0)
    expect(recordUsage).not.toHaveBeenCalled()
    expect(writeVoiceLedger).not.toHaveBeenCalled()
  })

  it("claims the window before it spends", async () => {
    const { generate } = stub()
    await previewVoice({ userId: "u1", now: NOW, generate })

    expect(writeVoiceLedger).toHaveBeenCalledWith("u1", {
      previewAt: NOW.toISOString(),
    })
  })

  it("meters the call under a label /credits can read", async () => {
    const { generate } = stub()
    await previewVoice({ userId: "u1", now: NOW, generate })

    expect(recordUsage).toHaveBeenCalledWith({
      userId: "u1",
      model: PREVIEW_USAGE_LABEL,
      inputTokens: 900,
      cachedInputTokens: 0,
      outputTokens: 120,
    })
  })

  it("refuses rather than spending when there is no voice to show", async () => {
    getBrainByKind.mockResolvedValue([])

    const { seen, generate } = stub()
    const result = await previewVoice({ userId: "u1", now: NOW, generate })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("no-voice")
    expect(seen).toHaveLength(0)
    // And it does not burn the cooldown on a refusal it made itself.
    expect(writeVoiceLedger).not.toHaveBeenCalled()
  })
})

describe("the two prompts", () => {
  const args = { topic: "what I shipped this week", channel: "x" }

  it("differ only by the voice section", () => {
    const voice = "## Voice — X\n\n1. Never uses hashtags."
    const { without, with: withVoice } = buildPreviewPrompts({ ...args, voice })

    expect(withVoice.startsWith(without)).toBe(true)
    expect(withVoice.slice(without.length).trim()).toBe(voice)
  })

  it("are identical when there is no voice", () => {
    const { without, with: withVoice } = buildPreviewPrompts({
      ...args,
      voice: "   ",
    })
    expect(withVoice).toBe(without)
  })

  it("both carry the channel's own constraints", () => {
    const { without, with: withVoice } = buildPreviewPrompts({
      ...args,
      voice: "1. Never uses hashtags.",
    })
    expect(without).toContain("280 characters")
    expect(withVoice).toContain("280 characters")
  })

  it("reach the generator that way", async () => {
    const { seen, generate } = stub()
    await previewVoice({ userId: "u1", now: NOW, generate })

    expect(seen).toHaveLength(1)
    const { without, with: withVoice } = seen[0].prompts
    expect(withVoice.startsWith(without)).toBe(true)
    expect(withVoice.slice(without.length)).toContain("Never uses hashtags.")
  })

  it("write about the user's own material, or a neutral topic when there is none", async () => {
    const { seen, generate } = stub()
    await previewVoice({ userId: "u1", now: NOW, generate })

    // The mocked database has no riffs.
    expect(seen[0].prompts.without).toContain(FALLBACK_TOPIC)
  })
})

describe("the ceiling", () => {
  const bytes = (s: string) => new TextEncoder().encode(s).length

  it("leaves a small voice alone", () => {
    const voice = "1. Never uses hashtags.\n2. Writes short lines."
    const { voice: kept } = fitToCeiling({
      topic: "a topic",
      channel: "x",
      voice,
    })
    expect(kept).toBe(voice)
  })

  it("trims a huge voice until the call fits 8 KB", () => {
    const voice = Array.from(
      { length: 400 },
      (_, i) => `${i + 1}. ${"a rule about how this person writes ".repeat(3)}`
    ).join("\n")

    const { prompts } = fitToCeiling({ topic: "a topic", channel: "x", voice })
    expect(bytes(prompts.without) + bytes(prompts.with)).toBeLessThanOrEqual(
      MAX_INPUT_BYTES
    )
  })

  it("drops rules from the end, keeping the most important ones", () => {
    const voice = Array.from(
      { length: 400 },
      (_, i) => `${i + 1}. ${"a rule about how this person writes ".repeat(3)}`
    ).join("\n")

    const { voice: kept } = fitToCeiling({
      topic: "a topic",
      channel: "x",
      voice,
    })
    expect(kept.startsWith("1. ")).toBe(true)
    expect(kept).not.toContain("400. ")
  })

  it("counts bytes rather than characters", () => {
    const voice = `1. ${"é".repeat(6_000)}`
    const { prompts } = fitToCeiling({ topic: "a topic", channel: "x", voice })
    expect(bytes(prompts.without) + bytes(prompts.with)).toBeLessThanOrEqual(
      MAX_INPUT_BYTES
    )
  })

  it("buys at most two posts' worth of output", () => {
    // X is 280, so the pair is 560 characters plus the JSON and reasoning slack.
    expect(maxOutputTokensFor("x")).toBe(280 + 512)
    // A channel with no published ceiling still gets one, from the default
    // post length rather than from nothing.
    expect(maxOutputTokensFor("substack")).toBeLessThanOrEqual(1_200)
  })
})

describe("nothing becomes a draft", () => {
  it("never writes a row", async () => {
    const { generate } = stub()
    const result = await previewVoice({ userId: "u1", now: NOW, generate })

    expect(result.ok).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it("does not so much as import the draft tables", async () => {
    const { readFile } = await import("node:fs/promises")
    const source = await readFile(
      new URL("./voice-preview.ts", import.meta.url),
      "utf8"
    )

    // The guard that outlives this test: a future edit that persists the
    // preview has to reach for one of these names, and this fails first.
    expect(source).not.toMatch(/\bdraftVersion\b/)
    expect(source).not.toMatch(/\bscheduledPost\b/)
    expect(source).not.toMatch(/db\.insert/)
  })
})

describe("the caption", () => {
  it("numbers the rules so the model has something to point at", () => {
    expect(numberVoice("## Voice\n\n- One.\n- Two.")).toBe(
      "## Voice\n\n1. One.\n2. Two."
    )
  })

  it("resolves a rule number to the rule", () => {
    const voice = numberVoice("- Never uses hashtags.\n- Writes short lines.")
    expect(namedRules(voice, ["2"])).toEqual(["Writes short lines."])
  })

  it("drops a number that points at nothing rather than guessing", () => {
    const voice = numberVoice("- Never uses hashtags.")
    expect(namedRules(voice, ["7", "1"])).toEqual(["Never uses hashtags."])
  })
})
