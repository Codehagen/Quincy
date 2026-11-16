import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ status: string | null }>,
}))

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mocks.rows,
      }),
    }),
  },
}))

const { hasLiveSubscription } = await import("@/lib/subscription-status")

beforeEach(() => {
  mocks.rows = []
})

describe("hasLiveSubscription", () => {
  it("is false when there is no subscription at all", async () => {
    expect(await hasLiveSubscription("u1")).toBe(false)
  })

  it("is true for an active subscription", async () => {
    mocks.rows = [{ status: "active" }]
    expect(await hasLiveSubscription("u1")).toBe(true)
  })

  it("is true for a stripe-side trialing subscription", async () => {
    mocks.rows = [{ status: "trialing" }]
    expect(await hasLiveSubscription("u1")).toBe(true)
  })

  it("is false for an abandoned checkout, so they can try again", async () => {
    mocks.rows = [{ status: "incomplete" }]
    expect(await hasLiveSubscription("u1")).toBe(false)
  })

  it("is false for a cancelled subscription, so they can resubscribe", async () => {
    mocks.rows = [{ status: "canceled" }]
    expect(await hasLiveSubscription("u1")).toBe(false)
  })

  it("is true when any one row is live", async () => {
    mocks.rows = [{ status: "canceled" }, { status: "active" }]
    expect(await hasLiveSubscription("u1")).toBe(true)
  })
})
