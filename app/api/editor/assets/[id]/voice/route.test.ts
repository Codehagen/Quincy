import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The Sound button's route: an existing track is handed back as it is, and a
 * new one is filed by what made it — the speech model's under v3, the plain
 * chain's under v2 — so a track is never stored as something it is not.
 */

const mocks = vi.hoisted(() => ({
  present: new Set<string>(),
  puts: [] as string[],
  track: null as { bytes: Uint8Array; denoised: boolean; note?: string } | null,
  fail: false,
  cleaned: 0,
}))

vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { id: "user-1" } }),
}))
vi.mock("@/lib/entitlement", () => ({
  resolveEntitlementForRequest: async () => ({ ok: true }),
  isEntitled: () => true,
  paywallResponse: () => Response.json({ error: "pay" }, { status: 402 }),
}))
vi.mock("@/lib/editor/assets", () => ({
  getAsset: async () => ({
    id: "va-1",
    state: "ready",
    hasAudio: true,
    contentHash: "h",
    storageKey: "k",
  }),
}))
vi.mock("@/lib/editor/ingest-meter", () => ({
  voiceCooldown: async () => ({ ready: true }),
  recordVoiceStart: async () => {},
}))
vi.mock("@/lib/editor/storage-r2", () => ({
  createR2Storage: () => ({
    exists: async (key: string) => mocks.present.has(key),
    url: async (key: string) => `url:${key}`,
    put: async (key: string) => {
      mocks.puts.push(key)
    },
  }),
  downloadObject: async () => {},
}))
vi.mock("@/lib/editor/transcoder-ffmpeg", () => ({
  withWorkspace: async (body: (dir: string) => Promise<unknown>) =>
    body("/tmp/w"),
  createFfmpegTranscoder: () => ({
    voice: async () => {
      mocks.cleaned++
      if (mocks.fail) throw new Error("ffmpeg")
      return mocks.track
    },
  }),
}))

const { POST } = await import("./route")

function press() {
  return POST(new Request("http://test/api/editor/assets/va-1/voice"), {
    params: Promise.resolve({ id: "va-1" }),
  })
}

beforeEach(() => {
  mocks.present = new Set()
  mocks.puts = []
  mocks.track = { bytes: new Uint8Array([1]), denoised: true }
  mocks.fail = false
  mocks.cleaned = 0
})

describe("POST /api/editor/assets/[id]/voice", () => {
  it("hands back a take's plain track without cleaning again", async () => {
    mocks.present.add("derived/voice/v2/h.m4a")
    const response = await press()
    expect(await response.json()).toEqual({ url: "url:derived/voice/v2/h.m4a" })
    expect(mocks.cleaned).toBe(0)
  })

  it("files the speech model's track under v3", async () => {
    const response = await press()
    expect(mocks.puts).toEqual(["derived/voice/v3/h.m4a"])
    expect(await response.json()).toEqual({ url: "url:derived/voice/v3/h.m4a" })
  })

  it("files a plain-chain track under v2", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mocks.track = {
      bytes: new Uint8Array([1]),
      denoised: false,
      note: "speech model lowered the voice",
    }
    const response = await press()
    expect(mocks.puts).toEqual(["derived/voice/v2/h.m4a"])
    expect(await response.json()).toEqual({ url: "url:derived/voice/v2/h.m4a" })
  })

  it("says the take still plays when the clean fails, and stores nothing", async () => {
    mocks.fail = true
    const response = await press()
    expect(response.status).toBe(500)
    expect(mocks.puts).toEqual([])
  })
})
