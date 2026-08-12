import { describe, expect, it } from "vitest"

import {
  collectBookmarks,
  MAX_POSTS_READ,
  type BookmarkPage,
} from "./bookmarks-x"

/**
 * `collectBookmarks` is pure aside from the injected fetch, which is the whole
 * reason it takes one — the pagination is where the money is spent, and money
 * spent in a loop is not something to find out about from a bill.
 *
 * The first version of this file did not exist, and the function shipped with
 * a bug the review caught: a self-authored bookmark was dropped from
 * `collected` and never stored, so it was never `known` either. The page never
 * looked exhausted, the walk carried on, and `maxPosts` bounded what was kept
 * while nothing bounded what was read. The `self-authored` tests below are
 * that bug, pinned.
 */

const ME = "me-123"

/** A page of bookmarks, in the shape X actually returns. */
function page(
  tweets: { id: string; author?: string }[],
  nextToken?: string
): BookmarkPage {
  const authors = [...new Set(tweets.map((t) => t.author ?? "someone"))]

  return {
    data: tweets.map((t) => ({
      id: t.id,
      text: `post ${t.id}`,
      author_id: t.author ?? "someone",
      created_at: "2026-08-01T00:00:00.000Z",
    })),
    includes: {
      users: authors.map((id) => ({ id, username: `user_${id}` })),
    },
    ...(nextToken ? { meta: { next_token: nextToken } } : {}),
  }
}

/** Serves the given pages in order and counts how many were requested. */
function server(pages: BookmarkPage[]) {
  let calls = 0

  const fetchImpl = (async () => {
    const body = pages[Math.min(calls, pages.length - 1)]
    calls += 1
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch

  return {
    fetchImpl,
    get calls() {
      return calls
    },
  }
}

const storedNone = async () => new Set<string>()
const storedAll = async (ids: string[]) => new Set(ids)

describe("collectBookmarks — the happy path", () => {
  it("keeps other people's posts and reads their handles from the expansion", async () => {
    const s = server([page([{ id: "1" }, { id: "2" }])])

    const result = await collectBookmarks({
      fetchImpl: s.fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 10,
      alreadyStored: storedNone,
    })

    expect(result.bookmarks.map((b) => b.id)).toEqual(["1", "2"])
    expect(result.bookmarks[0].handle).toBe("user_someone")
    expect(result.postsRead).toBe(2)
  })

  it("stops on the first page when everything is already stored", async () => {
    // The steady state. A daily run must cost one page, not the whole list.
    const s = server([page([{ id: "1" }], "next"), page([{ id: "2" }])])

    const result = await collectBookmarks({
      fetchImpl: s.fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 10,
      alreadyStored: storedAll,
    })

    expect(s.calls).toBe(1)
    expect(result.bookmarks).toHaveLength(0)
  })
})

describe("collectBookmarks — self-authored bookmarks", () => {
  it("never adapts your own post", async () => {
    const s = server([page([{ id: "1", author: ME }, { id: "2" }])])

    const result = await collectBookmarks({
      fetchImpl: s.fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 10,
      alreadyStored: storedNone,
    })

    expect(result.bookmarks.map((b) => b.id)).toEqual(["2"])
  })

  it("stops when a page is entirely your own posts", async () => {
    /**
     * The regression. Before the fix, a page of self-bookmarks was neither
     * `known` nor `collected`, so the exhaustion test was false and the walk
     * continued — re-reading and re-paying for the user's entire bookmark
     * list on every run.
     */
    const s = server([
      page([{ id: "1", author: ME }, { id: "2", author: ME }], "next"),
      page([{ id: "3" }], "next"),
      page([{ id: "4" }]),
    ])

    const result = await collectBookmarks({
      fetchImpl: s.fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 50,
      alreadyStored: storedNone,
    })

    expect(s.calls).toBe(1)
    expect(result.bookmarks).toHaveLength(0)
    expect(result.postsRead).toBe(2)
  })

  it("stops when a page mixes your own posts with already-stored ones", async () => {
    const s = server([
      page([{ id: "1", author: ME }, { id: "2" }], "next"),
      page([{ id: "3" }]),
    ])

    const result = await collectBookmarks({
      fetchImpl: s.fetchImpl,
      accessToken: "t",
      xUserId: ME,
      // "2" is stored, "1" is the user's own — nothing on the page is new.
      alreadyStored: async () => new Set(["2"]),
      maxPosts: 50,
    })

    expect(s.calls).toBe(1)
    expect(result.bookmarks).toHaveLength(0)
  })
})

describe("collectBookmarks — spending ceilings", () => {
  it("stops reading at MAX_POSTS_READ however many pages are left", async () => {
    // Every page is new, so nothing else would ever stop the walk. `maxPosts`
    // is set high on purpose: it bounds what is KEPT, and this test is about
    // what is BOUGHT.
    let n = 0
    const fetchImpl = (async () => {
      const tweets = Array.from({ length: 100 }, () => ({ id: `t${n++}` }))
      return new Response(JSON.stringify(page(tweets, "more")), { status: 200 })
    }) as unknown as typeof fetch

    const result = await collectBookmarks({
      fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 100_000,
      alreadyStored: storedNone,
    })

    expect(result.postsRead).toBeLessThanOrEqual(MAX_POSTS_READ + 100)
    expect(result.truncated).toBe(true)
  })

  it("keeps at most maxPosts even when the page is bigger", async () => {
    const tweets = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}` }))
    const s = server([page(tweets, "more")])

    const result = await collectBookmarks({
      fetchImpl: s.fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 5,
      alreadyStored: storedNone,
    })

    expect(result.bookmarks).toHaveLength(5)
    expect(result.truncated).toBe(true)
  })
})

describe("collectBookmarks — refusal", () => {
  it("reports a first-page refusal as a failure with the platform's words", async () => {
    const fetchImpl = (async () =>
      new Response("missing scope: bookmark.read", {
        status: 403,
      })) as unknown as typeof fetch

    const result = await collectBookmarks({
      fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 10,
      alreadyStored: storedNone,
    })

    expect(result.failure?.reason).toBe("rejected")
    expect(result.failure?.message).toContain("bookmark.read")
    expect(result.postsRead).toBe(0)
  })

  it("keeps what it already paid for when a LATER page refuses", async () => {
    // The rows already read are real and were charged. Throwing them away
    // would mean paying twice for the same posts.
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls === 1) {
        return new Response(JSON.stringify(page([{ id: "1" }], "next")), {
          status: 200,
        })
      }
      return new Response("rate limited", { status: 429 })
    }) as unknown as typeof fetch

    const result = await collectBookmarks({
      fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 50,
      alreadyStored: storedNone,
    })

    expect(result.failure).toBeUndefined()
    expect(result.bookmarks.map((b) => b.id)).toEqual(["1"])
    expect(result.truncated).toBe(true)
  })

  it("does not treat a network failure as a clean empty result", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket hang up")
    }) as unknown as typeof fetch

    const result = await collectBookmarks({
      fetchImpl,
      accessToken: "t",
      xUserId: ME,
      maxPosts: 10,
      alreadyStored: storedNone,
    })

    expect(result.truncated).toBe(true)
  })
})
