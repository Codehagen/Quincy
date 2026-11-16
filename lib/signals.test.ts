import { describe, expect, it } from "vitest"

import {
  GITHUB_MIN_STARS,
  HN_MIN_POINTS,
  MAX_MATERIAL_CHARS,
  readGitHubRepos,
  readHackerNews,
  readSignalMaterial,
  readSignals,
  stripHtml,
} from "./signals"

/**
 * Everything below the selection is pure aside from the injected fetch, which
 * is the whole reason it takes one: this is third-party JSON from two APIs
 * nobody signs, and the failure that matters is not an exception — it is a
 * field arriving as null and being stored as a row that can never be
 * deduplicated or judged.
 *
 * The two properties worth pinning hardest:
 *
 * - **A Hacker News signal points at the discussion, never the submitted
 *   link.** The argument is on the thread, `readSignalMaterial` goes back
 *   there for the comments, and `createRiffFromPost` deduplicates on the URL —
 *   so storing the article URL would break the dedupe the day two people
 *   submit the same blog post.
 * - **One origin failing never costs the other one.** `readSignals` is the
 *   only thing standing between "GitHub rate-limited us" and a run that
 *   reports nothing when Hacker News answered fine.
 */

const NOW = new Date("2026-08-26T09:00:00.000Z")

/** A fetch that answers from a table of URL fragments, and records what it
 *  was asked for. */
function fakeFetch(routes: { match: string; body: unknown; status?: number }[]) {
  const calls: string[] = []

  const fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)

    const route = routes.find((r) => url.includes(r.match))

    if (!route) return { ok: false, status: 404, json: async () => ({}) }

    return {
      ok: (route.status ?? 200) < 400,
      status: route.status ?? 200,
      json: async () => route.body,
      text: async () => String(route.body),
    }
  }) as unknown as typeof globalThis.fetch

  return { fetch, calls }
}

function hnStory(over: Record<string, unknown> = {}) {
  return {
    objectID: "44100200",
    title: "Postgres is all you need",
    url: "https://example.com/postgres",
    author: "someone",
    points: 412,
    num_comments: 189,
    created_at: "2026-08-26T04:00:00.000Z",
    story_text: "",
    ...over,
  }
}

describe("readHackerNews", () => {
  it("points at the discussion rather than the submitted link", async () => {
    const { fetch } = fakeFetch([
      { match: "hn.algolia.com", body: { hits: [hnStory()] } },
    ])

    const [signal] = await readHackerNews({ now: NOW, deps: { fetch } })

    expect(signal.url).toBe("https://news.ycombinator.com/item?id=44100200")
    // The article is kept as a fact about the story, never as its identity.
    expect(signal.meta.link).toBe("https://example.com/postgres")
    expect(signal.externalId).toBe("44100200")
  })

  it("names both numbers in the origin's own units", async () => {
    const { fetch } = fakeFetch([
      { match: "hn.algolia.com", body: { hits: [hnStory()] } },
    ])

    const [signal] = await readHackerNews({ now: NOW, deps: { fetch } })

    expect(signal.heat).toBe("412 points, 189 comments")
  })

  it("asks only for the last day, above the points floor", async () => {
    const { fetch, calls } = fakeFetch([
      { match: "hn.algolia.com", body: { hits: [] } },
    ])

    await readHackerNews({ now: NOW, deps: { fetch } })

    const since = Math.floor(
      (NOW.getTime() - 24 * 60 * 60 * 1000) / 1000
    )
    expect(calls[0]).toContain(`created_at_i>${since}`)
    expect(calls[0]).toContain(`points>${HN_MIN_POINTS}`)
  })

  it("strips the markup out of a story body", async () => {
    const { fetch } = fakeFetch([
      {
        match: "hn.algolia.com",
        body: {
          hits: [
            hnStory({
              story_text:
                '<a href="https:&#x2F;&#x2F;example.com" rel="nofollow">' +
                "How we cut the bill in half</a>",
            }),
          ],
        },
      },
    ])

    const [signal] = await readHackerNews({ now: NOW, deps: { fetch } })

    // Caught on the first live scan: the raw fragment was being stored in
    // `source_item.body` and read into the selection prompt, where an href is
    // a hundred characters of markup pretending to be a description.
    // The anchor's text survives and its href does not, which is right: the
    // href is inside the tag, and a link the reader cannot see is not a
    // description of anything.
    expect(signal.blurb).toBe("How we cut the bill in half")
    expect(signal.blurb).not.toContain("<a")
  })

  it("drops a hit with no id and a hit with no title", async () => {
    const { fetch } = fakeFetch([
      {
        match: "hn.algolia.com",
        body: {
          hits: [
            hnStory({ objectID: "" }),
            hnStory({ objectID: "2", title: "   " }),
            hnStory({ objectID: "3" }),
          ],
        },
      },
    ])

    const signals = await readHackerNews({ now: NOW, deps: { fetch } })

    // An id-less row could never be deduplicated and a title-less row could
    // never be judged. Both are dropped rather than stored empty.
    expect(signals.map((s) => s.externalId)).toEqual(["3"])
  })

  it("survives a payload that is not the shape it promised", async () => {
    const { fetch } = fakeFetch([
      { match: "hn.algolia.com", body: { hits: "not an array" } },
    ])

    await expect(
      readHackerNews({ now: NOW, deps: { fetch } })
    ).resolves.toEqual([])
  })

  it("treats a bad status as an empty day rather than an error", async () => {
    const { fetch } = fakeFetch([
      { match: "hn.algolia.com", body: {}, status: 503 },
    ])

    await expect(
      readHackerNews({ now: NOW, deps: { fetch } })
    ).resolves.toEqual([])
  })
})

function repo(over: Record<string, unknown> = {}) {
  return {
    full_name: "acme/rocket",
    html_url: "https://github.com/acme/rocket",
    description: "A fast thing",
    stargazers_count: 4200,
    language: "Rust",
    topics: ["cli", "rust"],
    created_at: "2026-08-10T00:00:00.000Z",
    ...over,
  }
}

describe("readGitHubRepos", () => {
  it("identifies a repository by name, which is what a person reads", async () => {
    const { fetch } = fakeFetch([
      { match: "api.github.com/search", body: { items: [repo()] } },
    ])

    const [signal] = await readGitHubRepos({ now: NOW, deps: { fetch } })

    expect(signal.externalId).toBe("acme/rocket")
    expect(signal.handle).toBe("acme")
    expect(signal.heat).toContain("4200 stars")
    expect(signal.meta.topics).toEqual(["cli", "rust"])
  })

  it("searches inside the window, above the star floor", async () => {
    const { fetch, calls } = fakeFetch([
      { match: "api.github.com/search", body: { items: [] } },
    ])

    await readGitHubRepos({ now: NOW, deps: { fetch } })

    // 30 days before 2026-08-26.
    expect(decodeURIComponent(calls[0])).toContain("created:>2026-07-27")
    expect(decodeURIComponent(calls[0])).toContain(`stars:>${GITHUB_MIN_STARS}`)
  })

  it("runs unauthenticated, because the token is optional", async () => {
    const { fetch } = fakeFetch([
      { match: "api.github.com/search", body: { items: [repo()] } },
    ])

    // No token passed. A missing optional key is a degradation, never a throw
    // — the rule lib/env.ts states for every other optional capability.
    await expect(
      readGitHubRepos({ now: NOW, token: undefined, deps: { fetch } })
    ).resolves.toHaveLength(1)
  })

  it("drops a repository with no name", async () => {
    const { fetch } = fakeFetch([
      {
        match: "api.github.com/search",
        body: { items: [repo({ full_name: "" }), repo({ full_name: "a/b" })] },
      },
    ])

    const signals = await readGitHubRepos({ now: NOW, deps: { fetch } })

    expect(signals.map((s) => s.externalId)).toEqual(["a/b"])
  })
})

describe("readSignals", () => {
  it("keeps Hacker News when GitHub is rate-limited", async () => {
    const { fetch } = fakeFetch([
      { match: "hn.algolia.com", body: { hits: [hnStory()] } },
      { match: "api.github.com", body: {}, status: 403 },
    ])

    const signals = await readSignals({ now: NOW, deps: { fetch } })

    expect(signals).toHaveLength(1)
    expect(signals[0].origin).toBe("hacker-news")
  })

  it("keeps Hacker News when GitHub throws outright", async () => {
    const fetch = (async (input: string | URL | Request) => {
      if (String(input).includes("api.github.com")) {
        throw new Error("network is down")
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ hits: [hnStory()] }),
      }
    }) as unknown as typeof globalThis.fetch

    const signals = await readSignals({ now: NOW, deps: { fetch } })

    expect(signals).toHaveLength(1)
  })

  it("returns nothing, not an error, when both are unreachable", async () => {
    const { fetch } = fakeFetch([])

    await expect(readSignals({ now: NOW, deps: { fetch } })).resolves.toEqual(
      []
    )
  })
})

describe("readSignalMaterial", () => {
  it("appends the discussion to what was already stored", async () => {
    const { fetch, calls } = fakeFetch([
      {
        match: "tags=comment",
        body: {
          hits: [
            {
              comment_text:
                "<p>The benchmark is measuring the client, not the database. " +
                "I have run this exact thing at work and the numbers move by " +
                "an order of magnitude when you pool connections.</p>",
            },
            // Too short to carry an argument, and dropped for it.
            { comment_text: "<p>Agreed.</p>" },
          ],
        },
      },
    ])

    const material = await readSignalMaterial(
      {
        origin: "hacker-news",
        externalId: "44100200",
        stored: "Postgres is all you need",
      },
      { fetch }
    )

    expect(calls[0]).toContain("story_44100200")
    expect(material).toContain("Postgres is all you need")
    expect(material).toContain("What people are saying")
    expect(material).toContain("pool connections")
    expect(material).not.toContain("Agreed.")
    // Stripped rather than escaped: this is prompt input, never markup.
    expect(material).not.toContain("<p>")
  })

  it("returns what was stored when the discussion cannot be read", async () => {
    const { fetch } = fakeFetch([])

    const material = await readSignalMaterial(
      { origin: "hacker-news", externalId: "1", stored: "A title" },
      { fetch }
    )

    expect(material).toBe("A title")
  })

  it("bounds a very long README", async () => {
    const { fetch } = fakeFetch([
      { match: "/readme", body: "x".repeat(MAX_MATERIAL_CHARS * 3) },
    ])

    const material = await readSignalMaterial(
      { origin: "github-repo", externalId: "acme/rocket", stored: "acme/rocket" },
      { fetch }
    )

    expect(material.length).toBeLessThanOrEqual(MAX_MATERIAL_CHARS)
  })
})

describe("stripHtml", () => {
  it("decodes the entities Hacker News actually emits", () => {
    expect(stripHtml("<p>it&#x27;s 3 &gt; 2 &amp; always was</p>")).toBe(
      "it's 3 > 2 & always was"
    )
  })

  it("decodes an ampersand last, so a decode cannot produce an entity", () => {
    // "&amp;gt;" is a literal "&gt;" in the source text. Decoding the
    // ampersand first would turn it into ">", inventing markup the comment
    // never had.
    expect(stripHtml("&amp;gt;")).toBe("&gt;")
  })

  it("collapses the whitespace a stripped tag leaves behind", () => {
    expect(stripHtml("<i>a</i>   <b>b</b>")).toBe("a b")
  })
})
