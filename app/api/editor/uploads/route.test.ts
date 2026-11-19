import { describe, expect, it, vi } from "vitest"

/**
 * The daily transcription allowance is for transcription. Music and pictures
 * buy none, so a spent day does not refuse them; a take still is.
 */

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
  findOrCreateAsset: async () => ({
    asset: { id: "va-1", state: "uploaded", storageKey: "k" },
    created: true,
  }),
}))
vi.mock("@/lib/editor/ingest-meter", () => ({
  ingestCooldown: async () => ({ ready: true }),
  // Far past any day's allowance, so the real verdict refuses.
  transcribedSecondsToday: async () => 10 ** 9,
}))
vi.mock("@/lib/editor/storage-r2", () => ({
  isR2Configured: () => true,
  createUploadUrl: async () => ({ url: "https://upload.test/k", headers: {} }),
}))

const { POST } = await import("./route")

function upload(body: Record<string, unknown>) {
  return POST(
    new Request("http://test/api/editor/uploads", {
      method: "POST",
      body: JSON.stringify({
        filename: "file",
        sizeBytes: 1000,
        hash: "0123456789abcdef",
        ...body,
      }),
    })
  )
}

describe("uploads and the day's allowance", () => {
  it("refuses a take once the day is spent", async () => {
    expect((await upload({ mimeType: "video/mp4" })).status).toBe(429)
  })

  it("lets music through", async () => {
    expect((await upload({ mimeType: "audio/mpeg", purpose: "music" })).status).toBe(200)
  })

  it("lets a picture through", async () => {
    expect((await upload({ mimeType: "image/png" })).status).toBe(200)
  })

  it("refuses a picture over the image limit", async () => {
    const response = await upload({ mimeType: "image/png", sizeBytes: 26 * 1024 ** 2 })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toMatch(/^Images are limited/)
  })
})
