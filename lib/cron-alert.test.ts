import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * What is worth pinning here is the bound, not the sending.
 *
 * The publish sweep runs every five minutes, so an outage alerting on every
 * run is 288 emails a day and a reader who filters them. `deliver`'s
 * idempotency key is what stops that, and it only works if the key buckets by
 * hour *and* the payload is byte-identical between runs — Resend answers 409,
 * not "already sent", to the same key carrying different content.
 *
 * So the assertions are: one key per job per failure per hour, and a payload
 * with no counts and no clock in it.
 */
/** The shape `deliver` is called with, so the mock's arguments are typed. */
type Sent = {
  to: string
  subject: string
  react: unknown
  text: string
  idempotencyKey: string
}

const deliver = vi.hoisted(() =>
  vi.fn(
    async (input: {
      to: string
      subject: string
      react: unknown
      text: string
      idempotencyKey: string
    }) => ({
      ok: true as const,
      // Echoing the key back is what a real send does not do, but it keeps the
      // parameter used — and a stub whose return ignores its input entirely is
      // the kind that hides an argument being dropped.
      id: `m_${input.idempotencyKey}`,
    })
  )
)

vi.mock("./mail", () => ({
  deliver,
  MAIL_REPLY_TO: "ops@example.com",
}))

const { alertCronFailure } = await import("./cron-alert")

afterEach(() => {
  deliver.mockClear()
  delete process.env.OPS_EMAIL
})

const AT = new Date("2026-08-12T09:14:00.000Z")
const LATER_SAME_HOUR = new Date("2026-08-12T09:59:59.000Z")
const NEXT_HOUR = new Date("2026-08-12T10:00:00.000Z")

/** The nth call's payload. Throws a readable failure rather than a type error. */
function sent(call: number): Sent {
  const args = deliver.mock.calls[call]
  if (!args) throw new Error(`deliver was not called ${call + 1} time(s)`)
  return args[0]
}

function keyOf(call: number) {
  return sent(call).idempotencyKey
}

describe("alertCronFailure", () => {
  it("gives every run in the same hour the same key", async () => {
    await alertCronFailure({ job: "publish", failure: "degraded", now: AT })
    await alertCronFailure({
      job: "publish",
      failure: "degraded",
      now: LATER_SAME_HOUR,
    })

    // Twelve publish runs an hour, one message.
    expect(keyOf(0)).toBe(keyOf(1))
  })

  it("sends again in the next hour", async () => {
    await alertCronFailure({ job: "publish", failure: "degraded", now: AT })
    await alertCronFailure({
      job: "publish",
      failure: "degraded",
      now: NEXT_HOUR,
    })

    // A bound, not a mute: an outage lasting all day still says so hourly.
    expect(keyOf(0)).not.toBe(keyOf(1))
  })

  it("keeps the four jobs in separate buckets", async () => {
    await alertCronFailure({ job: "publish", failure: "degraded", now: AT })
    await alertCronFailure({ job: "rhythms", failure: "degraded", now: AT })

    expect(keyOf(0)).not.toBe(keyOf(1))
  })

  it("keeps a second failure kind from being swallowed by the first", async () => {
    await alertCronFailure({ job: "publish", failure: "degraded", now: AT })
    await alertCronFailure({
      job: "publish",
      failure: "unconfigured",
      now: AT,
    })

    expect(keyOf(0)).not.toBe(keyOf(1))
  })

  it("sends a payload that cannot change between runs", async () => {
    await alertCronFailure({ job: "publish", failure: "degraded", now: AT })
    await alertCronFailure({
      job: "publish",
      failure: "degraded",
      now: LATER_SAME_HOUR,
    })

    // The whole reason the body carries no counts. Same key with a different
    // payload is a 409, which would turn the hourly bound back into one email
    // every five minutes.
    expect(sent(0).subject).toBe(sent(1).subject)
    expect(sent(0).text).toBe(sent(1).text)
  })

  it("says what stops happening, not just that something failed", async () => {
    await alertCronFailure({ job: "publish", failure: "degraded", now: AT })

    // The reader is deciding whether to get out of bed. "missed is final" is
    // the fact that answers it.
    expect(sent(0).text).toMatch(/missed/)
  })

  it("falls back to the mailbox a human reads", async () => {
    await alertCronFailure({ job: "channels", failure: "degraded", now: AT })

    expect(sent(0).to).toBe("ops@example.com")
  })

  it("prefers OPS_EMAIL when it is set", async () => {
    process.env.OPS_EMAIL = "alerts@example.com"

    await alertCronFailure({ job: "channels", failure: "degraded", now: AT })

    expect(sent(0).to).toBe("alerts@example.com")
  })

  it("never throws, so a failed alert cannot fail the run", async () => {
    deliver.mockRejectedValueOnce(new Error("resend is down"))

    await expect(
      alertCronFailure({ job: "publish", failure: "degraded", now: AT })
    ).resolves.toBeUndefined()
  })
})
