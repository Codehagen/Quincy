import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The image branch of ingest: a picture never reaches ffmpeg, so the stored
 * bytes are read back here and nowhere else. Too big or not a picture is a
 * final answer and fails the row; not uploaded yet is not.
 */

const mocks = vi.hoisted(() => ({
  head: null as { sizeBytes: number; head: Uint8Array } | null,
  failed: [] as unknown[][],
  completed: [] as unknown[][],
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
    mimeType: "image/png",
    state: "uploaded",
    storageKey: "k",
  }),
  completeImage: async (...args: unknown[]) => {
    mocks.completed.push(args)
    return { state: "ready" }
  },
  failIngest: async (...args: unknown[]) => {
    mocks.failed.push(args)
  },
  claimForIngest: async () => null,
  completeIngest: async () => null,
}))
vi.mock("@/lib/editor/ingest-meter", () => ({
  ingestCooldown: async () => ({ ready: true }),
  recordIngestStart: async () => {},
  recordTranscription: async () => {},
  transcribedSecondsToday: async () => 0,
}))
vi.mock("@/lib/editor/storage-r2", () => ({
  createR2Storage: () => ({}),
  downloadObject: async () => {},
  readObjectHead: async () => mocks.head,
}))
vi.mock("@/lib/editor/transcoder-ffmpeg", () => ({
  createFfmpegTranscoder: () => ({}),
  withWorkspace: async () => {},
}))
vi.mock("@/lib/transcription", () => ({
  isSpeechConfigured: () => false,
  pcmTranscriber: () => ({}),
  speechProviderFor: () => "deepgram",
  speechToTextFor: () => ({}),
}))

const { POST } = await import("./route")

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

function ingest(body: unknown) {
  return POST(
    new Request("http://test/api/editor/assets/va-1/ingest", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "va-1" }) }
  )
}

const SIZE = { image: { width: 1200, height: 800 } }

beforeEach(() => {
  mocks.head = null
  mocks.failed = []
  mocks.completed = []
})

describe("image ingest", () => {
  it("needs the picture's size", async () => {
    expect((await ingest({})).status).toBe(400)
  })

  it("waits for bytes that have not landed, without failing the row", async () => {
    expect((await ingest(SIZE)).status).toBe(409)
    expect(mocks.failed).toHaveLength(0)
  })

  it("refuses and fails a picture that is too big", async () => {
    mocks.head = { sizeBytes: 26 * 1024 ** 2, head: PNG }
    expect((await ingest(SIZE)).status).toBe(413)
    expect(mocks.failed).toHaveLength(1)
    expect(mocks.completed).toHaveLength(0)
  })

  it("refuses and fails bytes that are not what they were uploaded as", async () => {
    mocks.head = { sizeBytes: 1000, head: JPEG }
    expect((await ingest(SIZE)).status).toBe(415)
    expect(mocks.failed[0]?.[0]).toBe("va-1")
  })

  it("completes a real picture with its size", async () => {
    mocks.head = { sizeBytes: 1000, head: PNG }
    const response = await ingest(SIZE)
    expect(response.status).toBe(200)
    expect(mocks.completed[0]).toEqual(["va-1", "user-1", { width: 1200, height: 800 }])
    expect(mocks.failed).toHaveLength(0)
  })
})
