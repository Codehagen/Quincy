import { describe, expect, it } from "vitest"

import {
  classifyMetricsRead,
  collectMetricsPage,
  cooledDown,
  dedupeSameDay,
  MAX_PAGES_PER_USER,
  METRICS_COOLDOWN_MS,
  METRICS_PAGE_SIZE,
  metricsBaseline,
  metricValuesFrom,
  refreshPostMetrics,
  utcDay,
  wantsNonPublicMetrics,
  X_METRICS_LABEL,
  type MetricsConnection,
  type PostMetricsDeps,
  type PostMetricValues,
  type XMetricTweet,
} from "./post-metrics"

/**
 * The whole refresh is driven here rather than only its pure parts, because
 * the three things that can go wrong all cost money: a page cap that does not
 * cap, a cooldown that does not cool, and an upsert that writes a second row
 * for a post already measured today. lib/corpus-x.ts leaves the DB-touching
 * paths to scripts/verify-*.ts; that split does not work for this one, since
 * there is exactly one production database and a verify run would spend real
 * dollars at X to prove a guard exists. So the store is injected and the
 * assertions are about what was *asked for*, not about what Postgres did.
 *
 * `readPostMetrics` and the live SQL upsert stay unexercised on purpose — the
 * report says so. What is pinned here is every decision made before the query
 * is built.
 */

const NOW = new Date("2026-08-27T06:00:00.000Z")

function tweet(
  id: string,
  metrics: Record<string, number> = {},
  nonPublic?: Record<string, number>
): XMetricTweet {
  return {
    id,
    created_at: "2026-08-20T09:00:00.000Z",
    public_metrics: {
      impression_count: 1000,
      like_count: 10,
      reply_count: 2,
      retweet_count: 1,
      bookmark_count: 3,
      quote_count: 0,
      ...metrics,
    },
    ...(nonPublic ? { non_public_metrics: nonPublic } : {}),
  }
}

function connection(overrides: Partial<MetricsConnection> = {}): MetricsConnection {
  return {
    id: "cc_1",
    userId: "u_1",
    channel: "x",
    externalId: "x-123",
    scope: "offline.access bookmark.read tweet.write users.read tweet.read",
    ...overrides,
  }
}

/**
 * A fake store that records everything the refresh asked of it.
 *
 * `claim` runs the exported `cooledDown` against a stored timestamp rather
 * than answering a canned boolean — the live claim is a conditional UPDATE
 * against the same constant, so this is the closest a test without a database
 * gets to pinning the twenty hours themselves.
 */
function harness({
  connections = [connection()],
  pages = [{ data: [tweet("1")] }] as unknown[],
  lastMetricsAt = new Map<string, Date | null>(),
  items = new Map<string, string>(),
  token = { ok: true as const, accessToken: "tok" },
  status = 200,
}: {
  connections?: MetricsConnection[]
  pages?: unknown[]
  lastMetricsAt?: Map<string, Date | null>
  items?: Map<string, string>
  token?: { ok: true; accessToken: string } | { ok: false; reason: string }
  status?: number
} = {}) {
  const urls: string[] = []
  const upserted: PostMetricValues[][] = []
  const metered: { userId: string; postsRead: number }[] = []
  let fetches = 0

  const deps: PostMetricsDeps = {
    fetch: (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      const body = pages[Math.min(fetches, pages.length - 1)]
      fetches += 1
      return new Response(JSON.stringify(body), { status })
    }) as typeof fetch,
    listDue: async (limit) => connections.slice(0, limit + 1),
    claim: async (id, now) => {
      if (!cooledDown(lastMetricsAt.get(id) ?? null, now)) return false
      lastMetricsAt.set(id, now)
      return true
    },
    getToken: (async () => token) as unknown as PostMetricsDeps["getToken"],
    resolveItems: async () => items,
    upsert: async (rows) => {
      upserted.push(rows)
      return rows.length
    },
    meter: async (userId, postsRead) => {
      metered.push({ userId, postsRead })
    },
  }

  return {
    deps,
    urls,
    upserted,
    metered,
    get fetches() {
      return fetches
    },
  }
}

describe("wantsNonPublicMetrics", () => {
  it("allows the owner's own grant", () => {
    expect(
      wantsNonPublicMetrics(
        "offline.access bookmark.read tweet.write users.read tweet.read"
      )
    ).toBe(true)
  })

  it("refuses a grant made before the scope existed", () => {
    expect(wantsNonPublicMetrics("tweet.write users.read")).toBe(false)
    expect(wantsNonPublicMetrics(null)).toBe(false)
  })

  it("does not match a scope that merely starts the same way", () => {
    expect(wantsNonPublicMetrics("tweet.read.private")).toBe(false)
  })
})

describe("classifyMetricsRead", () => {
  it("reads the pay-per-use gate on both statuses X uses for it", () => {
    expect(classifyMetricsRead(402, "")).toBe("billing")
    expect(classifyMetricsRead(403, '{"detail":"needs a payment method"}')).toBe(
      "billing"
    )
    expect(classifyMetricsRead(403, '{"detail":"Forbidden"}')).toBe("rejected")
  })

  it("separates a dead token from a busy platform", () => {
    expect(classifyMetricsRead(401, "")).toBe("needs_reauth")
    expect(classifyMetricsRead(429, "")).toBe("rate-limited")
  })
})

describe("the page ceiling", () => {
  it("buys one page and stops, even when X offers another", async () => {
    const h = harness({
      pages: [
        { data: [tweet("1"), tweet("2")], meta: { next_token: "page2" } },
        { data: [tweet("3")] },
      ],
    })

    const run = await refreshPostMetrics({ deps: h.deps, now: NOW })

    expect(h.fetches).toBe(MAX_PAGES_PER_USER)
    expect(run.pages).toBe(1)
    expect(run.postsRead).toBe(2)
    // The cap bit, and the run says so rather than hiding it.
    expect(run.capped).toBe(true)
  })

  it("asks for at most one page's worth of posts", async () => {
    const h = harness()
    await refreshPostMetrics({ deps: h.deps, now: NOW })

    expect(h.urls[0]).toContain(`max_results=${METRICS_PAGE_SIZE}`)
    expect(h.urls[0]).toContain("start_time=")
    expect(h.urls[0]).toContain("non_public_metrics")
  })

  it("caps the number of users one run touches", async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      connection({ id: `cc_${i}`, userId: `u_${i}` })
    )
    const h = harness({ connections: many })

    const run = await refreshPostMetrics({ deps: h.deps, now: NOW, maxUsers: 2 })

    expect(run.due).toBe(2)
    expect(run.refreshed).toBe(2)
    expect(run.truncated).toBe(true)
    expect(h.fetches).toBe(2)
  })
})

describe("the cooldown", () => {
  it("skips a connection measured nineteen hours ago", async () => {
    const nineteenHours = new Date(NOW.getTime() - 19 * 60 * 60 * 1000)
    const h = harness({
      lastMetricsAt: new Map([["cc_1", nineteenHours]]),
    })

    const run = await refreshPostMetrics({ deps: h.deps, now: NOW })

    expect(run.cooldown).toBe(1)
    expect(run.refreshed).toBe(0)
    // Nothing was bought, which is the only assertion that matters.
    expect(h.fetches).toBe(0)
    expect(h.metered).toHaveLength(0)
  })

  it("runs one measured twenty-one hours ago", async () => {
    const h = harness({
      lastMetricsAt: new Map([
        ["cc_1", new Date(NOW.getTime() - 21 * 60 * 60 * 1000)],
      ]),
    })

    const run = await refreshPostMetrics({ deps: h.deps, now: NOW })

    expect(run.cooldown).toBe(0)
    expect(run.refreshed).toBe(1)
  })

  it("takes the claim before the token is fetched, so a failure still burns the window", async () => {
    const seen = new Map<string, Date | null>()
    const h = harness({
      lastMetricsAt: seen,
      token: { ok: false, reason: "needs_reauth" },
    })

    const first = await refreshPostMetrics({ deps: h.deps, now: NOW })
    expect(first.unavailable).toBe(1)
    expect(h.fetches).toBe(0)

    // A second invocation a minute later — a replayed cron — buys nothing.
    const second = await refreshPostMetrics({
      deps: h.deps,
      now: new Date(NOW.getTime() + 60_000),
    })
    expect(second.cooldown).toBe(1)
  })

  it("pins the window at twenty hours", () => {
    expect(METRICS_COOLDOWN_MS).toBe(20 * 60 * 60 * 1000)
    expect(cooledDown(null, NOW)).toBe(true)
    expect(
      cooledDown(new Date(NOW.getTime() - METRICS_COOLDOWN_MS), NOW)
    ).toBe(true)
    expect(
      cooledDown(new Date(NOW.getTime() - METRICS_COOLDOWN_MS + 1), NOW)
    ).toBe(false)
  })
})

describe("one row per post per day", () => {
  it("collapses a post X returned twice in one page", async () => {
    const h = harness({ pages: [{ data: [tweet("1"), tweet("2"), tweet("1")] }] })

    await refreshPostMetrics({ deps: h.deps, now: NOW })

    const rows = h.upserted[0]
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.externalId).sort()).toEqual(["1", "2"])
  })

  it("keeps the later reading when a post repeats", () => {
    const base = { userId: "u_1", channel: "x" as const, capturedAt: utcDay(NOW) }
    const rows = dedupeSameDay([
      metricValuesFrom(tweet("1", { impression_count: 100 }), base),
      metricValuesFrom(tweet("1", { impression_count: 140 }), base),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].impressions).toBe(140)
  })

  it("does not collapse the same post on two different days", () => {
    const rows = dedupeSameDay([
      metricValuesFrom(tweet("1"), {
        userId: "u_1",
        channel: "x",
        capturedAt: utcDay(NOW),
      }),
      metricValuesFrom(tweet("1"), {
        userId: "u_1",
        channel: "x",
        capturedAt: utcDay(new Date(NOW.getTime() + 24 * 60 * 60 * 1000)),
      }),
    ])

    expect(rows).toHaveLength(2)
  })

  it("normalises the capture day to UTC midnight, whatever hour the cron ran", async () => {
    const h = harness()
    await refreshPostMetrics({
      deps: h.deps,
      now: new Date("2026-08-27T23:41:12.000Z"),
    })

    expect(h.upserted[0][0].capturedAt.toISOString()).toBe(
      "2026-08-27T00:00:00.000Z"
    )
  })

  it("carries the source_item id when the corpus has the post, and empty when it does not", async () => {
    const h = harness({
      pages: [{ data: [tweet("1"), tweet("2")] }],
      items: new Map([["1", "si_abc"]]),
    })

    await refreshPostMetrics({ deps: h.deps, now: NOW })

    const rows = h.upserted[0]
    expect(rows.find((r) => r.externalId === "1")?.sourceItemId).toBe("si_abc")
    expect(rows.find((r) => r.externalId === "2")?.sourceItemId).toBe("")
  })
})

describe("the meter", () => {
  it("charges one event per page, priced by what X returned", async () => {
    const h = harness({ pages: [{ data: [tweet("1"), tweet("2"), tweet("3")] }] })

    const run = await refreshPostMetrics({ deps: h.deps, now: NOW })

    expect(h.metered).toEqual([{ userId: "u_1", postsRead: 3 }])
    // 3 posts × $0.005, in micro-dollars.
    expect(run.spentMicros).toBe(15_000)
    expect(X_METRICS_LABEL).toBe("x:metrics")
  })

  it("charges nothing when X refused before returning anything", async () => {
    const h = harness({ status: 429, pages: [{ title: "Too Many Requests" }] })

    const run = await refreshPostMetrics({ deps: h.deps, now: NOW })

    expect(h.metered).toHaveLength(0)
    expect(run.spentMicros).toBe(0)
    expect(run.failed).toBe(1)
    expect(run.stored).toBe(0)
  })

  it("fails soft: one refused connection does not end the run", async () => {
    let calls = 0
    const h = harness({
      connections: [
        connection({ id: "cc_a", userId: "u_a" }),
        connection({ id: "cc_b", userId: "u_b" }),
      ],
    })

    const deps: PostMetricsDeps = {
      ...h.deps,
      fetch: (async () => {
        calls += 1
        return calls === 1
          ? new Response("boom", { status: 500 })
          : new Response(JSON.stringify({ data: [tweet("9")] }), { status: 200 })
      }) as typeof fetch,
    }

    const run = await refreshPostMetrics({ deps, now: NOW })

    expect(run.failed).toBe(1)
    expect(run.refreshed).toBe(1)
  })
})

describe("collectMetricsPage", () => {
  it("reads impressions from non_public_metrics when the public block has none", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "1",
              public_metrics: { like_count: 4 },
              non_public_metrics: { impression_count: 8_800 },
            },
          ],
        }),
        { status: 200 }
      )) as typeof fetch

    const page = await collectMetricsPage({
      fetchImpl,
      accessToken: "t",
      xUserId: "x-1",
      since: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
      nonPublic: true,
    })

    const row = metricValuesFrom(page.tweets[0], {
      userId: "u_1",
      channel: "x",
      capturedAt: utcDay(NOW),
    })

    expect(row.impressions).toBe(8_800)
    expect(row.likes).toBe(4)
    // Everything the platform did not return is zero, never NaN.
    expect(row.quotes).toBe(0)
  })

  it("leaves non_public_metrics out of the query when the scope cannot see it", async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ data: [] }), { status: 200 })
    }) as typeof fetch

    await collectMetricsPage({
      fetchImpl,
      accessToken: "t",
      xUserId: "x-1",
      since: NOW,
      nonPublic: false,
    })

    expect(urls[0]).toContain("public_metrics")
    expect(urls[0]).not.toContain("non_public_metrics")
  })

  it("treats an unparsable body as a refusal rather than a clean zero", async () => {
    const fetchImpl = (async () =>
      new Response("<html>maintenance</html>", { status: 200 })) as typeof fetch

    const page = await collectMetricsPage({
      fetchImpl,
      accessToken: "t",
      xUserId: "x-1",
      since: NOW,
      nonPublic: true,
    })

    expect(page.failure?.reason).toBe("rejected")
    expect(page.tweets).toHaveLength(0)
  })
})

describe("metricsBaseline", () => {
  const row = (impressions: number, likes = 0): PostMetricValues => ({
    userId: "u_1",
    sourceItemId: "",
    channel: "x",
    externalId: String(impressions),
    capturedAt: utcDay(NOW),
    impressions,
    likes,
    replies: 0,
    reposts: 0,
    bookmarks: 0,
    quotes: 0,
  })

  it("takes the middle value on an odd count", () => {
    const base = metricsBaseline([row(100), row(900), row(300)])
    expect(base.median).toBe(300)
    expect(base.posts).toBe(3)
    expect(base.best).toBe(900)
  })

  it("averages the middle pair on an even count", () => {
    const base = metricsBaseline([row(100), row(200), row(300), row(1000)])
    expect(base.median).toBe(250)
    expect(base.mean).toBe(400)
    expect(base.totalImpressions).toBe(1_600)
  })

  it("rounds a half rather than carrying a fraction into a multiple", () => {
    expect(metricsBaseline([row(100), row(101)]).median).toBe(101)
  })

  it("sums the five engagement counts at the median", () => {
    const base = metricsBaseline([row(10, 2), row(20, 8), row(30, 4)])
    expect(base.medianEngagements).toBe(4)
  })

  it("answers an empty window with zeroes and a flag, never NaN", () => {
    const base = metricsBaseline([])

    expect(base).toEqual({
      posts: 0,
      median: 0,
      mean: 0,
      best: 0,
      medianEngagements: 0,
      totalImpressions: 0,
      empty: true,
    })
    expect(Number.isNaN(base.mean)).toBe(false)
  })

  it("says a measured window is not empty even when every post did nothing", () => {
    const base = metricsBaseline([row(0), row(0)])
    expect(base.empty).toBe(false)
    expect(base.median).toBe(0)
  })
})
