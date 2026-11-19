import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", () => ({ db: {} }))
vi.mock("./storage-r2", () => ({ createR2Storage: () => ({}) }))
vi.mock("./assets", () => ({ getAsset: async () => null }))

const { mediaEntryFor } = await import("./media-entry")
const { storageKeys } = await import("./media")

type Row = Parameters<typeof mediaEntryFor>[0]

const HASH = "xxh3-128:10:abc"

function row(overrides: Record<string, unknown> = {}): Row {
  return {
    id: "va-1",
    filename: "take.mov",
    mimeType: "video/quicktime",
    contentHash: HASH,
    hasAudio: true,
    durationUs: 1_000_000,
    width: 1080,
    height: 1920,
    fps: 30,
    rotation: 0,
    proxyKey: null,
    seekIndexKey: null,
    filmstripKey: null,
    thumbnailKey: null,
    transcript: null,
    ...overrides,
  } as unknown as Row
}

function storage(
  present: string[],
  exists?: (key: string) => Promise<boolean>
) {
  const keys = new Set(present)
  return {
    exists: vi.fn(exists ?? (async (key: string) => keys.has(key))),
    url: vi.fn(async (key: string) => `url:${key}`),
  }
}

/**
 * PR #7 files the speech model's track under v3 and the plain one under v2,
 * and promises a cut finished before the model keeps the track it had. This
 * is where the studio learns which one plays.
 */
describe("mediaEntryFor, the cleaned voice", () => {
  const v3 = storageKeys.voice(HASH)
  const v2 = storageKeys.voicePlain(HASH)

  it("plays the plain track a take cleaned before the model has", async () => {
    const entry = await mediaEntryFor(row(), storage([v2]))
    expect(entry.voiceUrl).toBe(`url:${v2}`)
  })

  it("prefers the model's track when both exist", async () => {
    const entry = await mediaEntryFor(row(), storage([v2, v3]))
    expect(entry.voiceUrl).toBe(`url:${v3}`)
  })

  it("has no voice when neither exists", async () => {
    expect((await mediaEntryFor(row(), storage([]))).voiceUrl).toBeNull()
  })

  it("opens the take without a voice when the check fails", async () => {
    const entry = await mediaEntryFor(
      row(),
      storage([], async () => {
        throw new Error("R2 down")
      })
    )
    expect(entry.voiceUrl).toBeNull()
    expect(entry.id).toBe("va-1")
  })

  it("does not look for a voice on music or a silent take", async () => {
    const music = storage([v3])
    expect(
      (await mediaEntryFor(row({ mimeType: "audio/mpeg" }), music)).voiceUrl
    ).toBeNull()
    const silent = storage([v3])
    expect(
      (await mediaEntryFor(row({ hasAudio: false }), silent)).voiceUrl
    ).toBeNull()
    expect(music.exists).not.toHaveBeenCalled()
    expect(silent.exists).not.toHaveBeenCalled()
  })
})
