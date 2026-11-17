import { createElement } from "react"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const send = vi.hoisted(() => vi.fn())

vi.mock("resend", () => ({
  Resend: class {
    emails = { send }
  },
}))

import { deliver } from "./mail"

const message = {
  to: "someone@example.com",
  subject: "Subject",
  react: createElement("p", null, "Body"),
  text: "Body",
  idempotencyKey: "verify-email/abc123",
}

const ok = { data: { id: "email_1" }, error: null }
const failed = (statusCode: number, name: string) => ({
  data: null,
  error: { statusCode, name, message: name },
})

/** Runs `deliver` with the backoff sleeps fast-forwarded. */
async function run() {
  const pending = deliver(message)
  await vi.runAllTimersAsync()
  return pending
}

describe("deliver", () => {
  const previousKey = process.env.RESEND_API_KEY

  beforeAll(() => {
    process.env.RESEND_API_KEY = "re_test"
    vi.useFakeTimers()
  })

  afterAll(() => {
    vi.useRealTimers()
    process.env.RESEND_API_KEY = previousKey
  })

  beforeEach(() => {
    send.mockReset()
  })

  it("tags the send with the key's event and keeps the key on every try", async () => {
    send.mockResolvedValueOnce(failed(500, "internal_server_error"))
    send.mockResolvedValueOnce(ok)

    const result = await run()

    expect(result).toEqual({ ok: true, id: "email_1" })
    expect(send).toHaveBeenCalledTimes(2)
    for (const [payload, options] of send.mock.calls) {
      expect(payload.tags).toEqual([{ name: "category", value: "verify-email" }])
      expect(options).toEqual({ idempotencyKey: "verify-email/abc123" })
    }
  })

  it("stops at three tries when Resend keeps answering 429", async () => {
    send.mockResolvedValue(failed(429, "rate_limit_exceeded"))

    const result = await run()

    expect(send).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ ok: false, reason: "rejected" })
  })

  it("does not retry a request Resend refused on its merits", async () => {
    send.mockResolvedValue(failed(422, "validation_error"))

    await run()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it("does not retry a spent quota, even though it is a 429", async () => {
    send.mockResolvedValue(failed(429, "daily_quota_exceeded"))

    await run()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it("retries a transport error and reports it if it never clears", async () => {
    send.mockRejectedValue(new Error("socket hang up"))

    const result = await run()

    expect(send).toHaveBeenCalledTimes(3)
    expect(result).toEqual({
      ok: false,
      reason: "rejected",
      message: "socket hang up",
    })
  })
})
