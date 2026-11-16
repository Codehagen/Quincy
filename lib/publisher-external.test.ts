import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  externalCredentials,
  externalPublisher,
  type ExternalCredentials,
} from "./publisher-external"
import type { PublishInput } from "./publisher"

/**
 * The external scheduler adapter: what it sends, how often, and what it writes
 * to the meter.
 *
 * `fetch` and the meter are injected, so nothing here reaches a network or a
 * database. The two properties worth pinning are the retry rule — one extra
 * request on a 5xx, none on a 4xx — and that the meter runs once per post
 * rather than once per request, because /credits is read as "where the posts
 * went" and a retry that produced one post must not read as two.
 */

const CREDENTIALS: ExternalCredentials = {
  url: "https://scheduler.example",
  token: "deployment-secret",
}

function inputFor(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    userId: "usr_1",
    channel: "threads",
    connection: { id: "cc_9", externalId: "integration-7", handle: "@quincy" },
    accessToken: "",
    body: "A post.",
    idempotencyKey: "sch_1",
    scheduledFor: new Date("2026-08-27T09:00:00.000Z"),
    ...overrides,
  }
}

function reply(status: number, body: string) {
  return new Response(body, { status })
}

const fetchMock = vi.fn()
const meter = vi.fn(async () => {})

function publisher() {
  return externalPublisher("threads", CREDENTIALS, {
    fetch: fetchMock as unknown as typeof globalThis.fetch,
    meter,
  })
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  fetchMock.mockReset()
  meter.mockClear()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("externalCredentials", () => {
  it("is null unless both variables are set, which is what keeps it off", () => {
    vi.stubEnv("EXTERNAL_PUBLISHER_URL", "")
    vi.stubEnv("EXTERNAL_PUBLISHER_TOKEN", "")
    expect(externalCredentials()).toBeNull()

    vi.stubEnv("EXTERNAL_PUBLISHER_URL", "https://scheduler.example")
    expect(externalCredentials()).toBeNull()

    vi.stubEnv("EXTERNAL_PUBLISHER_TOKEN", "secret")
    expect(externalCredentials()).toEqual({
      url: "https://scheduler.example",
      token: "secret",
    })
  })

  it("strips a trailing slash so the path is never doubled", () => {
    vi.stubEnv("EXTERNAL_PUBLISHER_URL", "https://scheduler.example/api/")
    vi.stubEnv("EXTERNAL_PUBLISHER_TOKEN", "secret")

    expect(externalCredentials()?.url).toBe("https://scheduler.example/api")
  })
})

describe("the request", () => {
  it("posts the agreed body to {url}/posts with a bearer token", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(201, '{"id":"post-1","url":"https://threads.example/post-1"}')
    )

    const result = await publisher().publish(inputFor())

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://scheduler.example/posts")
    expect(init.method).toBe("POST")

    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer deployment-secret")
    expect(headers["Content-Type"]).toBe("application/json")

    expect(JSON.parse(init.body as string)).toEqual({
      channel: "threads",
      integrationId: "integration-7",
      body: "A post.",
      scheduledFor: "2026-08-27T09:00:00.000Z",
      idempotencyKey: "sch_1",
    })

    expect(result).toEqual({
      ok: true,
      externalId: "post-1",
      url: "https://threads.example/post-1",
    })
  })

  it("bounds every attempt with an abort signal", async () => {
    fetchMock.mockResolvedValueOnce(reply(201, '{"id":"post-1"}'))

    await publisher().publish(inputFor())

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("builds a url from the id when the scheduler returns none", async () => {
    fetchMock.mockResolvedValueOnce(reply(201, '{"id":"post-2"}'))

    const result = await publisher().publish(inputFor())

    expect(result).toEqual({
      ok: true,
      externalId: "post-2",
      url: "https://scheduler.example/posts/post-2",
    })
  })

  it("refuses without an idempotency key, because the retry needs one", async () => {
    const result = await publisher().publish(inputFor({ idempotencyKey: null }))

    expect(result.ok === false && result.reason).toBe("rejected")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(meter).not.toHaveBeenCalled()
  })

  it("refuses media rather than sending the text without it", async () => {
    const result = await publisher().publish(
      inputFor({ media: ["https://example.com/a.png"] })
    )

    expect(result.ok === false && result.reason).toBe("rejected")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("the retry rule", () => {
  it("retries once on a 503 and keeps the same idempotency key", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(503, "upstream unwell"))
      .mockResolvedValueOnce(reply(201, '{"id":"post-3"}'))

    const result = await publisher().publish(inputFor())

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const first = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
    )
    const second = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string
    )
    expect(second.idempotencyKey).toBe(first.idempotencyKey)

    expect(result.ok).toBe(true)
  })

  it("gives up after the second 5xx rather than a third request", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(503, "unwell"))
      .mockResolvedValueOnce(reply(500, "still unwell"))

    const result = await publisher().publish(inputFor())

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.ok === false && result.reason).toBe("rejected")
    expect(result.ok === false && result.message).toContain("500")
  })

  it("never retries a 4xx, and hands back the scheduler's own words", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(400, '{"error":"unknown integration"}')
    )

    const result = await publisher().publish(inputFor())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok === false && result.reason).toBe("rejected")
    expect(result.ok === false && result.message).toContain("400")
    expect(result.ok === false && result.message).toContain(
      "unknown integration"
    )
  })

  it("reads a 401 as rejected, not as the user's connection needing repair", async () => {
    // A 401 means EXTERNAL_PUBLISHER_TOKEN is wrong. `needs_reauth` would put
    // a red error on a healthy connection and send the user to reconnect an
    // account that is fine.
    fetchMock.mockResolvedValueOnce(reply(401, "bad token"))

    const result = await publisher().publish(inputFor())

    expect(result.ok === false && result.reason).toBe("rejected")
  })

  it("backs off on a 429", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, "slow down"))

    const result = await publisher().publish(inputFor())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok === false && result.reason).toBe("rate-limited")
  })

  it("does not retry a timeout, and never claims the post failed to send", async () => {
    // Nothing answered, so nothing can be concluded — the same reasoning the
    // claim in lib/publish-run.ts makes. A second request here could be the
    // second post.
    fetchMock.mockRejectedValueOnce(
      new DOMException("The operation was aborted.", "TimeoutError")
    )

    const result = await publisher().publish(inputFor())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok === false && result.message).toContain("aborted")
    expect(meter).not.toHaveBeenCalled()
  })

  it("calls a 2xx with no readable id unconfirmed", async () => {
    fetchMock.mockResolvedValueOnce(reply(202, "queued"))

    const result = await publisher().publish(inputFor())

    expect(result.ok === false && result.reason).toBe("unconfirmed")
  })
})

describe("the meter", () => {
  it("writes one row per post, not one per request", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(503, "unwell"))
      .mockResolvedValueOnce(reply(201, '{"id":"post-4"}'))

    await publisher().publish(inputFor())

    expect(meter).toHaveBeenCalledTimes(1)
    expect(meter).toHaveBeenCalledWith({ userId: "usr_1", channel: "threads" })
  })

  it("still records a post the scheduler refused", async () => {
    // The row says where posts went. A refusal is still the external
    // scheduler being the place this one went to.
    fetchMock.mockResolvedValueOnce(reply(400, "no"))

    await publisher().publish(inputFor())

    expect(meter).toHaveBeenCalledTimes(1)
  })
})
