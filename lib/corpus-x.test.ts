import { describe, expect, it } from "vitest"

import { classifyRead, collectTimeline, type XTweet } from "./corpus-x"

/**
 * The DB-touching paths (insert, meter, the two cursors) are exercised by
 * scripts/verify-corpus-x.ts against a real database, following the repo's
 * split: unit tests cover the pure parts, verify scripts cover the wiring.
 * collectTimeline is pure enough (no db, only an injected fetch) to belong
 * here instead — pagination and refusal handling is exactly the kind of
 * branching a real X call would make expensive to exercise directly.
 */

describe("classifyRead", () => {
  it("maps 401 to needs_reauth", () => {
    expect(classifyRead(401, "")).toBe("needs_reauth")
  })

  it("maps 402 to billing — the pay-per-use gate", () => {
    expect(classifyRead(402, "")).toBe("billing")
  })

  it("maps a 403 with a payment message to billing", () => {
    expect(
      classifyRead(403, '{"detail":"Your account needs a payment method"}')
    ).toBe("billing")
  })

  it("maps a plain 403 to rejected, not billing", () => {
    expect(classifyRead(403, '{"detail":"Forbidden"}')).toBe("rejected")
  })

  it("maps 429 to rate-limited", () => {
    expect(classifyRead(429, "")).toBe("rate-limited")
  })

  it("maps anything else to rejected", () => {
    expect(classifyRead(500, "")).toBe("rejected")
  })
})

function tweet(id: string): XTweet {
  return { id, text: `post ${id}`, created_at: "2026-08-01T08:00:00Z" }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

/**
 * A scripted fetch: each call consumes the next canned response (the last
 * one repeats if more calls happen than responses were given), and records
 * the URL it was asked for so tests can assert on query params.
 */
function scriptedFetch(
  responses: (Response | Error)[]
): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = []
  let call = 0
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(String(input))
    const next = responses[Math.min(call, responses.length - 1)]
    call += 1
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
  return { fetchImpl, urls }
}

describe("collectTimeline", () => {
  it("stitches pagination together across pages", async () => {
    const { fetchImpl, urls } = scriptedFetch([
      jsonResponse({
        data: [tweet("3"), tweet("2"), tweet("1")],
        meta: { next_token: "page2" },
      }),
      jsonResponse({ data: [tweet("0"), tweet("-1")], meta: {} }),
    ])

    const result = await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      maxPosts: 100,
    })

    expect(result.tweets).toHaveLength(5)
    expect(result.postsRead).toBe(5)
    expect(result.truncated).toBe(false)
    expect(urls[1]).toContain("pagination_token=page2")
  })

  it("forwards since_id on the request", async () => {
    const { fetchImpl, urls } = scriptedFetch([
      jsonResponse({ data: [], meta: {} }),
    ])

    await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      sinceId: "900",
      maxPosts: 10,
    })

    expect(urls[0]).toContain("since_id=900")
  })

  it("forwards until_id on the request — the backfill direction", async () => {
    const { fetchImpl, urls } = scriptedFetch([
      jsonResponse({ data: [], meta: {} }),
    ])

    await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      untilId: "100",
      maxPosts: 10,
    })

    expect(urls[0]).toContain("until_id=100")
  })

  it("truncates at the cap even when a next page is offered", async () => {
    const { fetchImpl } = scriptedFetch([
      jsonResponse({
        data: [tweet("3"), tweet("2"), tweet("1")],
        meta: { next_token: "more" },
      }),
    ])

    const result = await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      maxPosts: 3,
    })

    expect(result.tweets).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it("bills for a page that overshoots maxPosts but stores only up to it", async () => {
    const tenTweets = Array.from({ length: 10 }, (_, i) => tweet(String(i)))
    const { fetchImpl, urls } = scriptedFetch([
      jsonResponse({ data: tenTweets, meta: {} }),
    ])

    const result = await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      maxPosts: 6,
    })

    expect(result.tweets).toHaveLength(6)
    expect(result.postsRead).toBe(10)
    expect(
      Number(new URL(urls[0]).searchParams.get("max_results"))
    ).toBeGreaterThanOrEqual(5)
  })

  it("reports a first-page refusal as a failure, with no tweets", async () => {
    const { fetchImpl } = scriptedFetch([jsonResponse({}, 401)])

    const result = await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      maxPosts: 10,
    })

    expect(result.failure?.reason).toBe("needs_reauth")
    expect(result.tweets).toHaveLength(0)
  })

  it("keeps page-1 tweets and reports truncated on a page-2 refusal — not a silent clean success", async () => {
    const { fetchImpl } = scriptedFetch([
      jsonResponse({
        data: [tweet("3"), tweet("2"), tweet("1")],
        meta: { next_token: "page2" },
      }),
      jsonResponse({}, 429),
    ])

    const result = await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      maxPosts: 100,
    })

    // Against the pre-plan-013 loop this same scenario returned
    // `{ ok: true, truncated: false }` — a clean success that silently
    // stranded whatever was behind page 2. This assertion is the fix.
    expect(result.failure).toBeUndefined()
    expect(result.tweets).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it("keeps page-1 tweets and reports truncated on a mid-run network throw", async () => {
    const { fetchImpl } = scriptedFetch([
      jsonResponse({
        data: [tweet("3"), tweet("2"), tweet("1")],
        meta: { next_token: "page2" },
      }),
      new Error("network died"),
    ])

    const result = await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      maxPosts: 100,
    })

    expect(result.failure).toBeUndefined()
    expect(result.tweets).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it("floors max_results at 5 even when maxPosts is smaller", async () => {
    const fiveTweets = Array.from({ length: 5 }, (_, i) => tweet(String(i)))
    const { fetchImpl, urls } = scriptedFetch([
      jsonResponse({ data: fiveTweets, meta: {} }),
    ])

    const result = await collectTimeline({
      fetchImpl,
      accessToken: "t",
      xUserId: "1",
      maxPosts: 2,
    })

    expect(new URL(urls[0]).searchParams.get("max_results")).toBe("5")
    expect(result.tweets).toHaveLength(2)
  })
})
