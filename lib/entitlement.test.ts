import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Two modules are mocked, for two different reasons.
 *
 * `@/lib/db` and `@/lib/trial` are mocked because they are the two side
 * effects the resolvers touch. Mocking them is what makes the state machine
 * testable without a database.
 */
const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ status: string | null }>,
  startTrial: vi.fn<(userId: string) => Promise<Date | null>>(),
}))

vi.mock("@/lib/trial", () => ({
  TRIAL_DAYS: 1,
  startTrial: mocks.startTrial,
}))

/**
 * Only the shape resolveEntitlement actually calls:
 * db.select(...).from(...).where(...) awaited as an array.
 */
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mocks.rows,
      }),
    }),
  },
}))

const { isEntitled, resolveEntitlement, resolveEntitlementForRequest } =
  await import("@/lib/entitlement")

const HOUR = 60 * 60 * 1000
const future = () => new Date(Date.now() + 24 * HOUR)
const past = () => new Date(Date.now() - HOUR)

beforeEach(() => {
  mocks.rows = []
  mocks.startTrial.mockReset()
})

describe("resolveEntitlement", () => {
  it("is trialing while the deadline is in the future", async () => {
    const endsAt = future()
    const result = await resolveEntitlement({ id: "u1", trialEndsAt: endsAt })

    expect(result).toEqual({ state: "trialing", endsAt })
    expect(mocks.startTrial).not.toHaveBeenCalled()
  })

  it("accepts an ISO string deadline as well as a Date", async () => {
    const endsAt = future()
    const result = await resolveEntitlement({
      id: "u1",
      trialEndsAt: endsAt.toISOString(),
    })

    expect(result.state).toBe("trialing")
  })

  it("does not write when no trial is recorded — it is expired", async () => {
    mocks.rows = []

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: null })

    expect(result).toEqual({ state: "expired" })
    expect(mocks.startTrial).not.toHaveBeenCalled()
  })

  it("never writes, whatever the input", async () => {
    mocks.rows = [{ status: "canceled" }]

    await resolveEntitlement({ id: "u1", trialEndsAt: null })
    await resolveEntitlement({ id: "u1", trialEndsAt: past() })
    await resolveEntitlement({ id: "u1", trialEndsAt: future() })

    expect(mocks.startTrial).not.toHaveBeenCalled()
  })

  it("is active when a subscription row is active, even after the trial ended", async () => {
    mocks.rows = [{ status: "active" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "active" })
  })

  it("treats a stripe-side trialing subscription as active", async () => {
    mocks.rows = [{ status: "trialing" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "active" })
  })

  it("is expired when the trial ran out and there is no subscription at all", async () => {
    mocks.rows = []

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "expired" })
  })

  it("is lapsed when a subscription was cancelled", async () => {
    mocks.rows = [{ status: "canceled" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "lapsed" })
  })

  it("is expired, not lapsed, when checkout was opened but never completed", async () => {
    mocks.rows = [{ status: "incomplete" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "expired" })
  })

  it("is expired, not lapsed, when an abandoned checkout expired", async () => {
    mocks.rows = [{ status: "incomplete_expired" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "expired" })
  })

  it("prefers an active row over a dead one", async () => {
    mocks.rows = [{ status: "canceled" }, { status: "active" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "active" })
  })
})

describe("resolveEntitlementForRequest", () => {
  it("starts a trial when none is recorded, and uses what startTrial returns", async () => {
    const endsAt = future()
    mocks.startTrial.mockResolvedValue(endsAt)

    const result = await resolveEntitlementForRequest({
      id: "u1",
      trialEndsAt: null,
    })

    expect(mocks.startTrial).toHaveBeenCalledWith("u1")
    expect(result).toEqual({ state: "trialing", endsAt })
  })

  it("does not touch startTrial when a deadline is already known", async () => {
    const endsAt = future()

    const result = await resolveEntitlementForRequest({
      id: "u1",
      trialEndsAt: endsAt,
    })

    expect(mocks.startTrial).not.toHaveBeenCalled()
    expect(result).toEqual({ state: "trialing", endsAt })
  })

  it("is expired when startTrial returns null and nothing was ever paid", async () => {
    mocks.startTrial.mockResolvedValue(null)
    mocks.rows = []

    const result = await resolveEntitlementForRequest({
      id: "u1",
      trialEndsAt: null,
    })

    expect(result).toEqual({ state: "expired" })
  })
})

describe("isEntitled", () => {
  it("lets trialing and active accounts spend", () => {
    expect(isEntitled({ state: "trialing", endsAt: future() })).toBe(true)
    expect(isEntitled({ state: "active" })).toBe(true)
  })

  it("stops expired and lapsed accounts", () => {
    expect(isEntitled({ state: "expired" })).toBe(false)
    expect(isEntitled({ state: "lapsed" })).toBe(false)
  })
})
