import type { UIMessageChunk } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createScene, LANDSCAPE_CANVAS } from "./document"
import { newElement, type EditOp } from "./ops"
import { replayModel } from "./replay-model"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import { UNLOCKED, type VideoDocument, type VideoElement } from "./types"
import { isAttemptOnly } from "../usage-attempts"

/**
 * The three-cuts run's guards and its stream, with the database, the asset
 * and the model mocked (the model is the scripted replay model, so the real
 * tools build the real ops): the ceiling refuses before anything starts, the
 * cooldown answers with the time left, every sub-run writes a usage row, ops
 * name their scene, and the run saves one revision per scene.
 */

const mocks = vi.hoisted(() => ({
  rows: [] as { conversationId: string; model: string; inputTokens?: number }[],
  spent: 0,
  lastStart: null as Date | null,
  userLastStart: null as Date | null,
  unlocks: [] as unknown[][],
  assetFails: false,
  streamCalls: 0,
  lock: vi.fn(),
  saves: [] as { scenes: string[]; expected: number }[],
}))

vi.mock("../db", () => ({ db: {} }))
vi.mock("../usage", () => ({
  summariseUsage: async () => ({ costMicros: mocks.spent }),
  recordUsage: async (row: { conversationId: string; model: string }) => {
    mocks.rows.push(row)
  },
  spendCooldown: async (_user: string, tag: string, ms: number) => {
    const { cooldownDecision } = await import("../cooldown")
    return cooldownDecision(tag === "three-cuts" ? mocks.userLastStart : mocks.lastStart, ms)
  },
}))
vi.mock("./assets", () => ({
  getAsset: async () => {
    if (mocks.assetFails) throw new Error("db down")
    return null
  },
}))
vi.mock("./projects", () => ({
  getProject: async () => ({ id: "vp-1", revision: 4, document: fixture(), lock: UNLOCKED }),
  lockProject: async (...args: unknown[]) => {
    mocks.lock(...args)
    return true
  },
  unlockProject: async (...args: unknown[]) => {
    mocks.unlocks.push(args)
  },
  saveDocument: async (_id: string, _user: string, document: VideoDocument, expected: number) => {
    mocks.saves.push({ scenes: document.scenes.map((s) => s.id), expected })
    return { revision: expected + 1 }
  },
}))

const { threeCutsResponse } = await import("./three-cuts-run")

function fixture(): VideoDocument {
  const scene = createScene({ canvas: LANDSCAPE_CANVAS })
  findMainTrack(scene)!.elements = [
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "va-1",
        startUs: us(0),
        durationUs: secondsToUs(10),
        trimStartUs: us(0),
        trimEndUs: secondsToUs(10),
        sourceDurationUs: secondsToUs(10),
        transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
        opacity: 1,
        blendMode: "normal",
        volume: 1,
        muted: false,
        effects: [],
        animations: { channels: {} },
      },
      "user"
    ),
  ]
  return {
    version: 1,
    metadata: { id: "vp-1", name: "t", durationUs: us(0), createdAt: "", updatedAt: "" },
    settings: { fps: 30, canvas: LANDSCAPE_CANVAS, background: { type: "color", color: "#000" } },
    scenes: [scene],
    currentSceneId: scene.id,
  }
}

/**
 * The replay model with a token count on every step, and a throw on the
 * `failOnCall`th call, for the metering test.
 */
function metered(scene: Parameters<typeof replayModel>[0], o: { failOnCall?: number; inputTokens?: number }) {
  const inner = replayModel(scene, { pace: "none" })
  let calls = 0
  return {
    ...inner,
    doStream: async (options: Parameters<typeof inner.doStream>[0]) => {
      calls++
      mocks.streamCalls++
      if (o.failOnCall !== undefined && calls >= o.failOnCall) throw new Error("gateway down")
      const result = await inner.doStream(options)
      const total = o.inputTokens ?? 0
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            transform(part, controller) {
              controller.enqueue(
                part.type === "finish"
                  ? { ...part, usage: { ...part.usage, inputTokens: { total, noCache: total, cacheRead: 0, cacheWrite: 0 } } }
                  : part
              )
            },
          })
        ),
      }
    },
  }
}

function start(o: { failOnCall?: number; inputTokens?: number } = {}) {
  return threeCutsResponse({
    request: new Request("http://localhost/api/editor/projects/vp-1/agent", { method: "POST" }),
    projectId: "vp-1",
    userId: "u-1",
    replay: false,
    model: "anthropic/claude-sonnet-5",
    system: "test",
    maxSteps: 8,
    runId: "run-1",
    messageId: "msg-1",
    languageModel: (scene) => metered(scene, o),
  })
}

/** Every chunk the response streams, data parts included. */
async function chunks(response: Response): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = []
  const text = await response.text()
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue
    out.push(JSON.parse(line.slice(6)) as UIMessageChunk)
  }
  return out
}

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
  mocks.rows.length = 0
  mocks.saves.length = 0
  mocks.spent = 0
  mocks.lastStart = null
  mocks.userLastStart = null
  mocks.unlocks.length = 0
  mocks.assetFails = false
  mocks.streamCalls = 0
  mocks.lock.mockReset()
})

describe("three cuts from one recording", () => {
  it("refuses before it starts when the day cannot cover three runs and three checks", async () => {
    mocks.spent = 9_900_000
    const response = await start()
    expect(response.status).toBe(429)
    expect(((await response.json()) as { state: string }).state).toBe("ceiling")
    expect(mocks.lock).not.toHaveBeenCalled()
    expect(mocks.rows).toHaveLength(0)
  })

  it("refuses a second request inside 60 s and says how long to wait", async () => {
    mocks.lastStart = new Date(Date.now() - 20_000)
    const response = await start()
    expect(response.status).toBe(429)
    const body = (await response.json()) as { error: string; secondsLeft: number }
    expect(body.secondsLeft).toBe(40)
    expect(body.error).toContain("40 seconds")
    expect(mocks.lock).not.toHaveBeenCalled()
  })

  it("streams each cut's ops under its scene, meters each cut, and saves one revision per scene", async () => {
    const all = await chunks(await start())

    const cuts = all.find((c) => c.type === "data-cuts") as { data: { cuts: { sceneId: string; letter: string }[] } }
    const ids = cuts.data.cuts.map((c) => c.sceneId)
    expect(ids).toHaveLength(3)

    const ops = all.filter((c) => c.type === "data-ops") as { data: { ops: EditOp[]; sceneId: string } }[]
    for (const id of ids) expect(ops.some((part) => part.data.sceneId === id)).toBe(true)
    for (const part of ops) {
      for (const op of part.data.ops) {
        const named = "sceneId" in op ? op.sceneId : op.op === "add_scene" ? op.scene.id : null
        expect(named).toBe(part.data.sceneId)
      }
    }

    // The attempt log, then one usage row per sub-run.
    expect(mocks.rows.map((r) => r.conversationId).sort()).toEqual([
      "three-cuts",
      "three-cuts:vp-1",
      "three-cuts:vp-1:A",
      "three-cuts:vp-1:B",
      "three-cuts:vp-1:C",
    ])
    // The attempt rows are labelled so /credits leaves them out
    // (usage-attempts.ts); the metered rows are the model's and stay in.
    for (const row of mocks.rows) {
      expect(isAttemptOnly(row.model)).toBe(!/:[ABC]$/.test(row.conversationId))
    }

    // A, then A+B, then A+B+C, each against the revision the last one made.
    expect(mocks.saves.map((s) => s.expected)).toEqual([4, 5, 6])
    expect(mocks.saves.map((s) => s.scenes.length)).toEqual([2, 3, 4])
    expect(mocks.saves[0].scenes).toContain(ids[0])
    expect(mocks.saves[1].scenes).toContain(ids[1])

    const saved = all.filter((c) => c.type === "data-saved") as { data: { sceneId: string } }[]
    expect(saved.map((s) => s.data.sceneId)).toEqual(ids)

    const pick = all.find((c) => c.type === "data-recommend") as { data: { letter: string; reason: string } }
    expect(pick.data.letter).toBe("A")
    expect(pick.data.reason).toMatch(/^I would post A first: it runs /)
  })

  it("refuses inside the per-person cooldown, whichever project asks", async () => {
    mocks.userLastStart = new Date(Date.now() - 50_000)
    const response = await start()
    expect(response.status).toBe(429)
    expect(((await response.json()) as { secondsLeft: number }).secondsLeft).toBe(10)
    expect(mocks.lock).not.toHaveBeenCalled()
  })

  it("gives the lock back when something between the lock and the stream throws", async () => {
    mocks.assetFails = true
    const response = await start()
    expect(response.status).toBe(500)
    expect(mocks.unlocks).toEqual([["vp-1", "u-1", "run-1"]])
  })

  it("meters the steps a cut paid for when the cut throws partway", async () => {
    const response = await start({ failOnCall: 2, inputTokens: 1_000 })
    await chunks(response)
    // Each cut finished one step (1,000 tokens) and threw on its second.
    expect(mocks.streamCalls).toBe(6)
    const cutRows = mocks.rows.filter((r) => /:[ABC]$/.test(r.conversationId)) as { inputTokens?: number }[]
    expect(cutRows).toHaveLength(3)
    for (const row of cutRows) expect(row.inputTokens).toBe(1_000)
    expect(mocks.unlocks).toEqual([["vp-1", "u-1", "run-1"]])
  })
})
