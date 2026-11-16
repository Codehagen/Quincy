import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  canPublish,
  labelFor,
  publisherFor,
  type PublishInput,
} from "./publisher"

/**
 * The delivery boundary: which implementation sends a channel, and that moving
 * the X and LinkedIn requests behind it changed none of their behaviour.
 *
 * Nothing here touches a database or the network. `fetch` is stubbed, which is
 * exactly what the split bought — before it, the request and the bookkeeping
 * around it were one function and neither could be checked without the other.
 * The half that needs real rows is scripts/verify-publish.ts.
 */

function inputFor(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    userId: "usr_1",
    channel: "x",
    connection: { id: "cc_1", externalId: "ext_1", handle: "@quincy" },
    accessToken: "token",
    body: "A post.",
    idempotencyKey: "sch_1",
    scheduledFor: new Date("2026-08-27T09:00:00.000Z"),
    ...overrides,
  }
}

/** One response, so a test reads as its status and body. */
function reply(
  status: number,
  body: string,
  headers: Record<string, string> = {}
) {
  return new Response(body, { status, headers })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  // The two publishers log which LinkedIn endpoint answered. Real information
  // in production, noise in a test run.
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("publisherFor", () => {
  it("resolves X and LinkedIn first-party", () => {
    expect(publisherFor("x").channel).toBe("x")
    expect(publisherFor("linkedin").channel).toBe("linkedin")
    expect(canPublish("x")).toBe(true)
    expect(canPublish("linkedin")).toBe(true)
  })

  it("refuses an unknown channel with a result rather than a throw", async () => {
    // `draft_version.channel` accepts every key of CHANNEL_RULES, so this is
    // an ordinary state and not a corrupt row. A throw here would lose the
    // post inside a cron nobody is watching.
    expect(canPublish("threads")).toBe(false)

    const result = await publisherFor("threads").publish(
      inputFor({ channel: "threads" })
    )

    expect(result).toEqual({
      ok: false,
      reason: "rejected",
      message: "No publisher for threads.",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("takes the external scheduler once its environment is set", async () => {
    vi.stubEnv("EXTERNAL_PUBLISHER_URL", "https://scheduler.example/api")
    vi.stubEnv("EXTERNAL_PUBLISHER_TOKEN", "secret")

    expect(canPublish("threads")).toBe(true)

    fetchMock.mockResolvedValueOnce(reply(200, '{"id":"ext-9"}'))

    const result = await publisherFor("threads").publish(
      inputFor({ channel: "threads" })
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://scheduler.example/api/posts"
    )
    expect(result.ok).toBe(true)
  })

  it("never lets the external scheduler take over a first-party channel", async () => {
    // Configuring a scheduler must not silently move X off the path whose
    // cost, refusals and token lifecycle this codebase reasons about.
    vi.stubEnv("EXTERNAL_PUBLISHER_URL", "https://scheduler.example")
    vi.stubEnv("EXTERNAL_PUBLISHER_TOKEN", "secret")

    fetchMock.mockResolvedValueOnce(reply(200, '{"data":{"id":"1"}}'))

    await publisherFor("x").publish(inputFor())

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.com/2/tweets")
  })

  it("names an unknown channel by its id rather than as undefined", () => {
    expect(labelFor("x")).toBe("X")
    expect(labelFor("linkedin")).toBe("LinkedIn")
    expect(labelFor("threads")).toBe("threads")
  })
})

describe("the X publisher", () => {
  it("posts the text and reads the id back", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, '{"data":{"id":"1889"}}'))

    const result = await publisherFor("x").publish(inputFor())

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.x.com/2/tweets")
    expect(init.method).toBe("POST")
    expect(
      (init.headers as Record<string, string>).Authorization
    ).toBe("Bearer token")
    expect(JSON.parse(init.body as string)).toEqual({ text: "A post." })

    expect(result).toEqual({
      ok: true,
      externalId: "1889",
      url: "https://x.com/quincy/status/1889",
    })
  })

  it("falls back to the /i/web/ url when no handle was stored", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, '{"data":{"id":"1889"}}'))

    const result = await publisherFor("x").publish(
      inputFor({ connection: { id: "cc_1", externalId: "ext", handle: null } })
    )

    expect(result).toEqual({
      ok: true,
      externalId: "1889",
      url: "https://x.com/i/web/status/1889",
    })
  })

  it("reads a duplicate 403 as a duplicate, not as an auth problem", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(403, '{"detail":"You are not allowed to create a duplicate."}')
    )

    const result = await publisherFor("x").publish(inputFor())

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe("duplicate")
  })

  it("reads a 401 as needs_reauth and a 429 as rate-limited", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, "unauthorized"))
    const unauthorized = await publisherFor("x").publish(inputFor())
    expect(unauthorized.ok === false && unauthorized.reason).toBe(
      "needs_reauth"
    )

    fetchMock.mockResolvedValueOnce(reply(429, "slow down"))
    const limited = await publisherFor("x").publish(inputFor())
    expect(limited.ok === false && limited.reason).toBe("rate-limited")
  })

  it("calls a 2xx with an unreadable body unconfirmed, never failed", async () => {
    // The failure that is not a failure. X took the post; only the id was
    // unreadable, and reporting it as failed is what makes a user retry into
    // a duplicate.
    fetchMock.mockResolvedValueOnce(reply(200, "<html>ok</html>"))

    const result = await publisherFor("x").publish(inputFor())

    expect(result.ok === false && result.reason).toBe("unconfirmed")
  })

  it("refuses media rather than posting the text without it", async () => {
    const result = await publisherFor("x").publish(
      inputFor({ media: ["https://example.com/a.png"] })
    )

    expect(result.ok === false && result.reason).toBe("rejected")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("the LinkedIn publisher", () => {
  const linkedInInput = inputFor({
    channel: "linkedin",
    connection: { id: "cc_2", externalId: "sub-7", handle: null },
  })

  it("refuses without LINKEDIN_API_VERSION rather than guessing one", async () => {
    vi.stubEnv("LINKEDIN_API_VERSION", "")

    const result = await publisherFor("linkedin").publish(linkedInInput)

    expect(result.ok === false && result.reason).toBe("rejected")
    expect(result.ok === false && result.message).toContain(
      "LINKEDIN_API_VERSION"
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts to /rest/posts and reads the id from the response header", async () => {
    vi.stubEnv("LINKEDIN_API_VERSION", "202508")
    fetchMock.mockResolvedValueOnce(
      reply(201, "", { "x-restli-id": "urn:li:share:99" })
    )

    const result = await publisherFor("linkedin").publish(linkedInInput)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.linkedin.com/rest/posts")
    expect(
      (init.headers as Record<string, string>)["LinkedIn-Version"]
    ).toBe("202508")
    expect(JSON.parse(init.body as string).author).toBe(
      "urn:li:person:sub-7"
    )

    expect(result).toEqual({
      ok: true,
      externalId: "urn:li:share:99",
      url: "https://www.linkedin.com/feed/update/urn:li:share:99/",
    })
  })

  it("falls back to /v2/ugcPosts on exactly the gated 403", async () => {
    // The endpoint question plan 027 item 2b settles with the first real
    // LinkedIn post. Until then both paths stay, and this pins that the
    // fallback is still reached only by an ACCESS_DENIED 403 — which creates
    // nothing, so it cannot double-post.
    vi.stubEnv("LINKEDIN_API_VERSION", "202508")
    fetchMock
      .mockResolvedValueOnce(reply(403, '{"code":"ACCESS_DENIED"}'))
      .mockResolvedValueOnce(
        reply(201, "", { "x-restli-id": "urn:li:share:42" })
      )

    const result = await publisherFor("linkedin").publish(linkedInInput)

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.linkedin.com/v2/ugcPosts"
    )
    expect(result.ok && result.externalId).toBe("urn:li:share:42")
  })

  it("does not fall back on a 403 that is not ACCESS_DENIED", async () => {
    vi.stubEnv("LINKEDIN_API_VERSION", "202508")
    fetchMock.mockResolvedValueOnce(reply(403, '{"code":"SOMETHING_ELSE"}'))

    const result = await publisherFor("linkedin").publish(linkedInInput)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.ok === false && result.reason).toBe("rejected")
  })

  it("calls a 2xx with no id unconfirmed", async () => {
    vi.stubEnv("LINKEDIN_API_VERSION", "202508")
    fetchMock.mockResolvedValueOnce(reply(201, "{}"))

    const result = await publisherFor("linkedin").publish(linkedInInput)

    expect(result.ok === false && result.reason).toBe("unconfirmed")
  })
})
