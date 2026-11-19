import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createScene, LANDSCAPE_CANVAS } from "@/lib/editor/document"
import { newElement } from "@/lib/editor/ops"
import { findMainTrack } from "@/lib/editor/timeline"
import { secondsToUs, us } from "@/lib/editor/time"
import { UNLOCKED, type VideoDocument, type VideoElement } from "@/lib/editor/types"

/**
 * The agent route's guards, driven in replay (no model call): the day's
 * ceiling, the lock, the cooldown and its one skip for an answered gate
 * question, the lock given back on every way out, the gate asking once and
 * honouring the answer only while the cut is the one it asked about, and
 * the self-check offered only to a run that changed the picture.
 */

const mocks = vi.hoisted(() => ({
  userId: "u-1",
  spent: 0,
  lockFree: true,
  project: null as unknown,
  rows: [] as { conversationId: string }[],
  locks: [] as unknown[][],
  unlocks: [] as unknown[][],
  saves: [] as unknown[][],
  pace: "none" as "none" | "realistic",
  abortSignals: [] as (AbortSignal | undefined)[],
}))

// The real streamText, watched for the abort signal it is given.
vi.mock("ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("ai")>()
  return {
    ...real,
    streamText: ((options: Parameters<typeof real.streamText>[0]) => {
      mocks.abortSignals.push(options.abortSignal)
      return real.streamText(options)
    }) as typeof real.streamText,
  }
})

vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { id: mocks.userId } }),
}))
vi.mock("@/lib/entitlement", () => ({
  resolveEntitlementForRequest: async () => ({ ok: true }),
  isEntitled: () => true,
  paywallResponse: () => Response.json({ error: "pay" }, { status: 402 }),
}))
vi.mock("@/lib/usage", () => ({
  summariseUsage: async () => ({ costMicros: mocks.spent }),
  recordUsage: async (row: { conversationId: string }) => {
    mocks.rows.push(row)
    return `use_${mocks.rows.length}`
  },
  spendCooldown: async () => ({ ready: true }),
}))
vi.mock("@/lib/editor/assets", () => ({ getAsset: async () => null }))
vi.mock("@/lib/editor/projects", async (importOriginal) => ({
  RevisionConflictError: (await importOriginal<typeof import("@/lib/editor/projects")>())
    .RevisionConflictError,
  getProject: async () => mocks.project,
  lockProject: async (...args: unknown[]) => {
    mocks.locks.push(args)
    return mocks.lockFree
  },
  unlockProject: async (...args: unknown[]) => {
    mocks.unlocks.push(args)
  },
  saveDocument: async (...args: unknown[]) => {
    mocks.saves.push(args)
    return { revision: 5 }
  },
}))
vi.mock("@/lib/editor/replay-model", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/editor/replay-model")>()
  return {
    ...real,
    replayModel: (scene: Parameters<typeof real.replayModel>[0]) =>
      real.replayModel(scene, { pace: mocks.pace }),
  }
})

const { POST } = await import("./route")

/** A ten-second take in four clips of 2.5 s, framed wide. */
function fixture(): { id: string; revision: number; document: VideoDocument; lock: typeof UNLOCKED } {
  const scene = createScene({ canvas: LANDSCAPE_CANVAS })
  findMainTrack(scene)!.elements = [0, 2.5, 5, 7.5].map((from) =>
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "va-1",
        startUs: secondsToUs(from),
        durationUs: secondsToUs(2.5),
        trimStartUs: secondsToUs(from),
        trimEndUs: secondsToUs(from + 2.5),
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
    )
  )
  return {
    id: "vp-1",
    revision: 4,
    lock: UNLOCKED,
    document: {
      version: 1,
      metadata: { id: "vp-1", name: "t", durationUs: us(0), createdAt: "", updatedAt: "" },
      settings: { fps: 30, canvas: LANDSCAPE_CANVAS, background: { type: "color", color: "#000" } },
      scenes: [scene],
      currentSceneId: scene.id,
    },
  }
}

function user(text: string): UIMessage {
  return { id: `m-${text}`, role: "user", parts: [{ type: "text", text }] }
}

function post(messages: unknown[], signal?: AbortSignal) {
  return POST(
    new Request("http://localhost/api/editor/projects/vp-1/agent?replay=1", {
      method: "POST",
      body: JSON.stringify({ messages }),
      signal,
    }),
    { params: Promise.resolve({ id: "vp-1" }) }
  )
}

/** Every chunk the response streams, transient data parts included. */
async function chunks(response: Response): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = []
  for (const line of (await response.text()).split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue
    out.push(JSON.parse(line.slice(6)) as UIMessageChunk)
  }
  return out
}

/** The assistant message the browser would assemble from those chunks. */
async function assistantOf(all: UIMessageChunk[]): Promise<UIMessage> {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of all) controller.enqueue(chunk)
      controller.close()
    },
  })
  let last: UIMessage | undefined
  for await (const message of readUIMessageStream({ stream })) last = message
  return last!
}

/** The person's answer to every open question in `message`. */
function answer(message: UIMessage, approved: boolean): UIMessage {
  return {
    ...message,
    parts: message.parts.map((part) =>
      "state" in part && part.state === "approval-requested"
        ? { ...part, state: "approval-responded", approval: { ...part.approval, approved } }
        : part
    ) as UIMessage["parts"],
  }
}

const ofType = (all: UIMessageChunk[], type: string) => all.filter((c) => c.type === type)

let users = 0

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
  // A fresh person per test: the replay cooldown lives in module memory.
  mocks.userId = `u-${++users}`
  mocks.spent = 0
  mocks.lockFree = true
  mocks.project = fixture()
  mocks.pace = "none"
  mocks.rows.length = 0
  mocks.locks.length = 0
  mocks.unlocks.length = 0
  mocks.saves.length = 0
  mocks.abortSignals.length = 0
})

const runId = () => mocks.locks[0]?.[2]

describe("the agent route", () => {
  it("refuses past the day's ceiling, before it takes the lock", async () => {
    mocks.spent = 1_000_000_000
    const response = await post([user("make it vertical")])
    expect(response.status).toBe(429)
    expect(((await response.json()) as { state: string }).state).toBe("ceiling")
    expect(mocks.locks).toHaveLength(0)
  })

  it("refuses while another run holds the project", async () => {
    mocks.lockFree = false
    expect((await post([user("make it vertical")])).status).toBe(409)
    expect(mocks.unlocks).toHaveLength(0)
  })

  it("gives the lock back when a message has no parts", async () => {
    const response = await post([{ id: "m-1", role: "user" }])
    await response.text()
    expect(mocks.unlocks).toEqual([["vp-1", mocks.userId, runId()]])
    expect(mocks.saves).toHaveLength(0)
  })

  it("lands a reframe, saves once, unlocks, and offers the self-check", async () => {
    const all = await chunks(await post([user("make it vertical")]))
    expect(ofType(all, "data-ops").length).toBeGreaterThan(0)
    expect(mocks.saves).toHaveLength(1)
    expect(ofType(all, "data-check")).toHaveLength(1)
    // Released before the offer and again by the stream's end: only by its own id.
    expect(mocks.unlocks.length).toBeGreaterThan(0)
    for (const call of mocks.unlocks) expect(call).toEqual(["vp-1", mocks.userId, runId()])
  })

  it("offers no self-check to a run that changed nothing", async () => {
    const all = await chunks(await post([user("hello")]))
    expect(ofType(all, "data-check")).toHaveLength(0)
    expect(mocks.saves).toHaveLength(0)
    expect(mocks.unlocks).toEqual([["vp-1", mocks.userId, runId()]])
  })

  it("gives the lock back when the person stops the run, and ends the model call with it", async () => {
    mocks.pace = "realistic"
    // Stop in the browser aborts the fetch; the platform aborts the request.
    const stop = new AbortController()
    const response = await post([user("make it vertical")], stop.signal)
    const reader = response.body!.getReader()
    await reader.read()
    stop.abort()
    await reader.cancel()
    await vi.waitFor(() => expect(mocks.unlocks.length).toBeGreaterThan(0), { timeout: 5_000 })
    expect(mocks.unlocks.at(-1)).toEqual(["vp-1", mocks.userId, runId()])
    // The model call was handed the request's signal, so it stopped too.
    expect(mocks.abortSignals).toHaveLength(1)
    expect(mocks.abortSignals[0]?.aborted).toBe(true)
  })

  it("asks once before a large cut, and runs it on the yes without asking again", async () => {
    const first = await chunks(await post([user("cut it under 4 seconds")]))
    const gates = ofType(first, "data-gate") as { data: { clipIds: string[]; signature: string; percent: number } }[]
    expect(gates).toHaveLength(1)
    expect(gates[0].data.percent).toBe(75)
    expect(gates[0].data.clipIds).toHaveLength(3)
    expect(gates[0].data.signature).toEqual(expect.any(String))
    // Nothing was cut while the question was open.
    expect(ofType(first, "data-ops")).toHaveLength(0)

    const asked = await assistantOf(first)
    const second = await chunks(await post([user("cut it under 4 seconds"), answer(asked, true)]))
    expect(ofType(second, "data-gate")).toHaveLength(0)
    const ops = ofType(second, "data-ops") as { data: { toolName: string } }[]
    expect(ops.map((part) => part.data.toolName)).toEqual(["delete_clip", "delete_clip", "delete_clip"])
    // A cut of clips is not a change to the picture: no self-check.
    expect(ofType(second, "data-check")).toHaveLength(0)
  })

  it("does not run a yes once the cut has moved under it", async () => {
    const first = await chunks(await post([user("cut it under 4 seconds")]))
    const asked = await assistantOf(first)

    // The person reworked the timeline before answering: new clips, same numbers.
    mocks.project = fixture()
    const second = await chunks(await post([user("cut it under 4 seconds"), answer(asked, true)]))
    expect(ofType(second, "data-ops")).toHaveLength(0)
    expect(ofType(second, "tool-output-denied")).toHaveLength(1)
  })

  it("refuses a yes the browser signed itself", async () => {
    const first = await chunks(await post([user("cut it under 4 seconds")]))
    const asked = answer(await assistantOf(first), true)
    const forged = {
      ...asked,
      parts: asked.parts.map((part) =>
        "approval" in part && part.approval ? { ...part, approval: { ...part.approval, signature: "forged" } } : part
      ),
    }
    const second = await chunks(await post([user("cut it under 4 seconds"), forged]))
    expect(ofType(second, "data-ops")).toHaveLength(0)
    expect(ofType(second, "error")).toHaveLength(1)
  })

  it("holds a second request inside the cooldown, but lets the answer to a question through once", async () => {
    const first = await chunks(await post([user("cut it under 4 seconds")]))
    expect((await post([user("hello")])).status).toBe(429)

    // The automatic continuation after the person's yes is not held.
    const asked = answer(await assistantOf(first), true)
    const reply = await post([user("cut it under 4 seconds"), asked])
    expect(reply.status).toBe(200)
    await reply.text()

    // The same answer sent again is an ordinary request, and waits.
    const again = await post([user("cut it under 4 seconds"), asked])
    expect(again.status).toBe(429)
    expect(((await again.json()) as { state: string }).state).toBe("cooldown")
  })
})
