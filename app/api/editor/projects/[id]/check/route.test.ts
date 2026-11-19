import { beforeEach, describe, expect, it, vi } from "vitest"

import { createScene, VERTICAL_CANVAS } from "@/lib/editor/document"
import { applyToScene, newElement } from "@/lib/editor/ops"
import { CHECK_MODEL, checkTagPrefix } from "@/lib/editor/self-check"
import { findMainTrack } from "@/lib/editor/timeline"
import { secondsToUs, us } from "@/lib/editor/time"
import { addCaptions } from "@/lib/editor/tools"
import { UNLOCKED, type VideoDocument, type VideoElement } from "@/lib/editor/types"

/**
 * The self-check route's money guards, with the model, the database and the
 * session mocked: one check per run (the usage row is the attempt log), at
 * most three frames, a signed offer, and a usage row for every model call,
 * failed ones included.
 */

const mocks = vi.hoisted(() => ({
  rows: [] as { conversationId: string; model: string; inputTokens: number }[],
  look: vi.fn(),
  save: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { id: "u-1" } }),
}))
vi.mock("@/lib/entitlement", () => ({
  resolveEntitlementForRequest: async () => ({ ok: true }),
  isEntitled: () => true,
  paywallResponse: () => Response.json({ error: "pay" }, { status: 402 }),
}))
vi.mock("@/lib/usage", () => ({
  summariseUsage: async () => ({ costMicros: 0 }),
  recordUsage: async (row: { conversationId: string; model: string; inputTokens: number }) => {
    mocks.rows.push(row)
  },
}))
vi.mock("@/lib/editor/projects", () => ({
  getProject: async () => ({ id: "vp-1", revision: 4, document: documentFixture(), lock: UNLOCKED }),
  lockProject: async () => true,
  unlockProject: async () => {},
  saveDocument: async (...args: unknown[]) => {
    mocks.save(...args)
    return { revision: 5 }
  },
}))
vi.mock("@/lib/editor/self-check-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/editor/self-check-server")>()),
  alreadyChecked: async (_userId: string, runId: string) =>
    mocks.rows.some((row) => row.conversationId.startsWith(checkTagPrefix(runId))),
  lookAtFrames: mocks.look,
}))

const { POST } = await import("./route")
const { signOffer } = await import("@/lib/editor/self-check-server")

function documentFixture(): VideoDocument {
  const scene = createScene({ canvas: VERTICAL_CANVAS })
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
  const words = [{ text: "Hello.", startUs: secondsToUs(1), endUs: secondsToUs(1.5), confidence: 1 }]
  const captioned = applyToScene(scene, addCaptions(scene, words, { mediaId: "va-1", author: "agent" }), "agent")
  return {
    version: 1,
    metadata: { id: "vp-1", name: "t", durationUs: us(0), createdAt: "", updatedAt: "" },
    settings: { fps: 30, canvas: VERTICAL_CANVAS, background: { type: "color", color: "#000" } },
    scenes: [captioned],
    currentSceneId: captioned.id,
  }
}

const FRAME = `data:image/jpeg;base64,${"A".repeat(200)}`

function post(body: unknown, project = "vp-1") {
  return POST(
    new Request(`http://localhost/api/editor/projects/${project}/check`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: project }) }
  )
}

const frames = (n: number) => Array.from({ length: n }, (_, i) => ({ atUs: i * 1_000_000, dataUrl: FRAME }))

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key")
  mocks.rows.length = 0
  mocks.look.mockReset()
  mocks.save.mockReset()
  mocks.look.mockResolvedValue({
    verdict: {
      frames: [{ index: 0, note: "caption covers the chin" }],
      captions: "up",
      keep: null,
      say: "Lifted the caption off the chin.",
    },
    usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 40 },
  })
})

describe("the self-check route", () => {
  it("looks once, meters it, and lands the fix as a saved revision", async () => {
    const response = await post({ offer: signOffer("vp-1", "run-1"), frames: frames(2) })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { steps: { toolName: string }[]; revision: number }
    expect(body.steps.map((s) => s.toolName)).toEqual(["move_captions"])
    expect(body.revision).toBe(5)
    expect(mocks.look).toHaveBeenCalledTimes(1)
    expect(mocks.rows).toEqual([
      expect.objectContaining({ conversationId: "check:run-1:2f", model: CHECK_MODEL, inputTokens: 900 }),
    ])
  })

  it("refuses a second check in the same run, without a model call", async () => {
    const offer = signOffer("vp-1", "run-1")
    await post({ offer, frames: frames(3) })
    const second = await post({ offer, frames: frames(3) })
    expect(second.status).toBe(409)
    expect(mocks.look).toHaveBeenCalledTimes(1)
    expect(mocks.rows).toHaveLength(1)
  })

  it("refuses more than three frames", async () => {
    const response = await post({ offer: signOffer("vp-1", "run-1"), frames: frames(4) })
    expect(response.status).toBe(400)
    expect(mocks.look).not.toHaveBeenCalled()
  })

  it("refuses a forged offer, and an offer for another project", async () => {
    const forged = `vp-1.run-9.${Date.now() + 60_000}.bad`
    expect((await post({ offer: forged, frames: frames(1) })).status).toBe(403)
    expect((await post({ offer: signOffer("vp-2", "run-1"), frames: frames(1) })).status).toBe(403)
    expect(mocks.look).not.toHaveBeenCalled()
  })

  it("meters a failed call too, and that still counts as the run's check", async () => {
    mocks.look.mockRejectedValueOnce(new Error("gateway down"))
    const offer = signOffer("vp-1", "run-2")
    expect((await post({ offer, frames: frames(1) })).status).toBe(502)
    expect(mocks.rows).toEqual([expect.objectContaining({ conversationId: "check:run-2:1f", inputTokens: 0 })])
    expect((await post({ offer, frames: frames(1) })).status).toBe(409)
    expect(mocks.look).toHaveBeenCalledTimes(1)
  })

  it("saves nothing when the frames read clear", async () => {
    mocks.look.mockResolvedValueOnce({
      verdict: { frames: [], captions: null, keep: null, say: "The framing holds." },
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    })
    const response = await post({ offer: signOffer("vp-1", "run-3"), frames: frames(1) })
    expect(((await response.json()) as { steps: unknown[] }).steps).toEqual([])
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
