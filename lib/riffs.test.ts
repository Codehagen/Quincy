import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Riff } from "./riffs"

/**
 * The channel-gap logic, which decides when /riffs offers to spend money.
 *
 * Pure, and tested here rather than left to the page, because every branch is a
 * judgment call with a cost attached: a false gap buys a model call for an
 * angle nobody needed, and a missed gap silently hides the feature. There is no
 * DOM test environment in this repo (vitest runs `environment: "node"`), which
 * is the same reason `microphoneFailureMessage` was extracted from the recorder.
 */

/**
 * `@/lib/db` is mocked only for `claimVoiceRiff`'s test below — every other
 * test in this file exercises pure functions and touches no I/O. Same mock
 * shape as lib/entitlement.test.ts:24-31: only the one method the function
 * under test actually calls.
 */
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: {
    execute: mocks.execute,
  },
}))

const { channelGaps, claimVoiceRiff, shapesForChannel, shapesForChannels } =
  await import("./riffs")

function riff(
  angles: { shape: Riff["angles"][number]["shape"]; drafted?: boolean }[]
): Pick<Riff, "state" | "angles"> {
  return {
    state: "ready",
    angles: angles.map((a, i) => ({
      id: `a${i}`,
      hook: `hook ${i}`,
      shape: a.shape,
      // Not what these tests are about: `channelGaps` reads shape alone.
      kind: "",
      why: "",
      ...(a.drafted ? { status: "drafted" as const } : {}),
    })),
  }
}

const X = { id: "x", label: "X" }
const LINKEDIN = { id: "linkedin", label: "LinkedIn" }

describe("shapesForChannel", () => {
  it("inverts the shape table", () => {
    expect(shapesForChannel("x").sort()).toEqual(["Short post", "Thread"])
    expect(shapesForChannel("linkedin").sort()).toEqual([
      "Carousel",
      "Short post",
    ])
    expect(shapesForChannel("substack")).toEqual(["Essay"])
  })

  it("returns nothing for a channel no shape reaches", () => {
    // Not a hypothetical: a connection can exist for a platform the shape
    // table has no route to, and the caller must not offer a gap it could
    // never fill.
    expect(shapesForChannel("tiktok")).toEqual([])
  })
})

describe("shapesForChannels", () => {
  it("drops a shape the account cannot publish", () => {
    // X and LinkedIn: Essay reaches only Substack, so offering it would
    // produce an angle `targetsFor` refuses to draft.
    expect(shapesForChannels(["x", "linkedin"]).sort()).toEqual([
      "Carousel",
      "Short post",
      "Thread",
    ])
  })

  it("keeps a shape that reaches one of its channels but not both", () => {
    // Carousel is LinkedIn *and* Instagram. LinkedIn alone is a real
    // destination, not a partial one.
    expect(shapesForChannels(["linkedin"])).toContain("Carousel")
  })

  it("widens to every shape for an account with nothing connected", () => {
    // The same call `targetsFor` makes: a user we know nothing about still
    // gets angles.
    expect(shapesForChannels([])).toEqual([
      "Short post",
      "Thread",
      "Carousel",
      "Essay",
    ])
  })

  it("widens rather than empties when no connection reaches any shape", () => {
    expect(shapesForChannels(["tiktok"])).toHaveLength(4)
  })
})

describe("channelGaps", () => {
  it("names a channel no angle reaches", () => {
    // Carousel reaches LinkedIn and Instagram, never X.
    expect(channelGaps(riff([{ shape: "Carousel" }]), [X, LINKEDIN])).toEqual([
      X,
    ])
  })

  it("is silent when every channel is covered", () => {
    // Short post reaches both, which is the common case and the one where the
    // control has to render nothing at all.
    expect(channelGaps(riff([{ shape: "Short post" }]), [X, LINKEDIN])).toEqual(
      []
    )
  })

  it("counts a drafted angle as covering its channels", () => {
    // A draft already exists for X. Offering another is offering to write the
    // same post twice — the failure `drafted` was introduced to prevent.
    expect(
      channelGaps(riff([{ shape: "Thread", drafted: true }]), [X])
    ).toEqual([])
  })

  it("finds both gaps when an essay is all there is", () => {
    expect(channelGaps(riff([{ shape: "Essay" }]), [X, LINKEDIN])).toEqual([
      X,
      LINKEDIN,
    ])
  })

  it("has no gaps for an account connected to nothing", () => {
    // The whole feature disappears rather than suggesting platforms the user
    // has never mentioned.
    expect(channelGaps(riff([{ shape: "Essay" }]), [])).toEqual([])
  })

  it("has no gaps while the riff is still being read", () => {
    // Otherwise every channel looks like a gap and offers sprout under a
    // skeleton for angles that have not arrived yet.
    expect(
      channelGaps({ state: "working", angles: [] }, [X, LINKEDIN])
    ).toEqual([])
  })

  it("has no gaps on a failed riff", () => {
    expect(channelGaps({ state: "failed", angles: [] }, [X, LINKEDIN])).toEqual(
      []
    )
  })

  it("has no gaps on a ready riff whose angles were all discarded", () => {
    // There is no material to aim at a channel, so the offer would be asking
    // Quincy to invent one from nothing.
    expect(channelGaps({ state: "ready", angles: [] }, [X, LINKEDIN])).toEqual(
      []
    )
  })
})

describe("claimVoiceRiff", () => {
  beforeEach(() => {
    mocks.execute.mockReset()
  })

  /**
   * Postgres supplies the atomicity — the single `INSERT ... WHERE NOT
   * EXISTS` statement is what makes two concurrent claims impossible in
   * production. This pins the *contract* the mock cannot prove on its own:
   * a row back means the claim was taken, no row means it was not, and
   * `claimVoiceRiff` must read that and nothing else. A regression that
   * turned this back into read-then-insert would still pass a test that
   * only checked "eventually returns ok: true" — this checks the row count
   * decides the outcome.
   */
  it("reports the claim won when a row comes back", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ id: "rif_abc123" }] })

    const result = await claimVoiceRiff("u1", 30_000)

    expect(result).toEqual({ ok: true, riffId: "rif_abc123" })
  })

  it("reports the claim lost when no row comes back", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] })

    const result = await claimVoiceRiff("u1", 30_000)

    expect(result).toEqual({ ok: false })
  })

  it("wins the first claim and loses the second inside one cooldown window", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ id: "rif_first" }] })
      .mockResolvedValueOnce({ rows: [] })

    const first = await claimVoiceRiff("u1", 30_000)
    const second = await claimVoiceRiff("u1", 30_000)

    expect(first).toEqual({ ok: true, riffId: "rif_first" })
    expect(second).toEqual({ ok: false })
  })
})
