import { describe, expect, it } from "vitest"

import {
  DOMAIN_DOWN,
  DOMAIN_UP,
  UNIT_PX,
  angleOf,
  barLength,
  endsOf,
  formatMonth,
  formatMultiple,
  formatPostDate,
  hook,
  impressionsOf,
  isClipped,
  liveBaseline,
  median,
  metricOf,
  metricsFor,
  rollupByAngle,
  type NumbersView,
  type Reading,
  type ScoredPost,
} from "./numbers"

/**
 * Expected values are taken from the database, not from a fixture.
 *
 * The corpus behind /numbers is 57 X posts in `source_item` with a median of
 * 938 and a mean of 4,946 — verified with `percentile_disc(0.5)` and `avg()` in
 * Postgres. Pinning the arithmetic against those makes a hand-edited digit or a
 * broken re-import fail here rather than quietly redraw the page.
 *
 * Bodies quoted below are copied verbatim out of the column, entities, t.co
 * shortlinks and all. That is the point: the exploration at
 * /prototypes/numbers ran on a hand-cleaned fixture and neither of those two
 * defects was visible in it.
 */

function post(over: Partial<ScoredPost> & { id: string }): ScoredPost {
  return {
    url: "",
    hook: "",
    date: "Jan 1",
    impressions: 0,
    replies: 0,
    multiple: 1,
    live: false,
    ...over,
  }
}

/** A `post_metric` row as `readPostMetrics` hands it back. */
function reading(over: Partial<Reading> = {}): Reading {
  return {
    impressions: 0,
    likes: 0,
    replies: 0,
    reposts: 0,
    bookmarks: 0,
    quotes: 0,
    capturedAt: new Date("2026-08-26T00:00:00Z"),
    ...over,
  }
}

describe("median", () => {
  it("takes the middle of an odd count", () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it("averages the pair on an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(3)
  })

  it("does not assume its input is sorted", () => {
    expect(median([69560, 938, 287])).toBe(938)
  })

  it("is 0 rather than NaN on an empty corpus", () => {
    // The shape a new account hits first. NaN here reaches every multiple on
    // the page.
    expect(median([])).toBe(0)
  })

  it("matches the database on the real corpus", () => {
    // The 57 impression counts, as stored.
    const corpus = [
      69560, 55008, 22040, 18777, 10148, 10068, 9093, 8969, 6471, 6255, 4996,
      4468, 4247, 4166, 3653, 3560, 3549, 3250, 2281, 1858, 1767, 1561, 1471,
      1390, 1283, 1170, 1059, 978, 938, 931, 850, 848, 844, 769, 756, 752, 748,
      746, 743, 710, 698, 686, 644, 638, 629, 603, 581, 577, 554, 530, 522, 509,
      492, 477, 378, 358, 287,
    ]
    expect(corpus).toHaveLength(57)
    expect(median(corpus)).toBe(938)
    expect(
      Math.round(corpus.reduce((sum, n) => sum + n, 0) / corpus.length)
    ).toBe(4946)
  })
})

describe("impressionsOf", () => {
  it("reads the count out of the stored blob", () => {
    // `meta` exactly as `source_item` holds it.
    expect(
      impressionsOf({
        public_metrics: {
          like_count: 5,
          quote_count: 0,
          reply_count: 1,
          retweet_count: 0,
          bookmark_count: 1,
          impression_count: 287,
        },
      })
    ).toBe(287)
  })

  it("keeps a genuine zero", () => {
    expect(impressionsOf({ public_metrics: { impression_count: 0 } })).toBe(0)
  })

  it("refuses a row with no metrics — an archive import", () => {
    expect(impressionsOf({})).toBeNull()
    expect(impressionsOf({ public_metrics: null })).toBeNull()
    expect(impressionsOf(null)).toBeNull()
    expect(impressionsOf("not an object")).toBeNull()
  })

  it("refuses a count that is not a usable number", () => {
    // X has changed this shape before. A string here would sort as text and a
    // NaN would poison every multiple on the page.
    expect(impressionsOf({ public_metrics: { impression_count: "287" } })).toBeNull()
    expect(impressionsOf({ public_metrics: { impression_count: NaN } })).toBeNull()
    expect(impressionsOf({ public_metrics: { impression_count: -1 } })).toBeNull()
  })
})

describe("metricOf", () => {
  it("reads a decoration metric", () => {
    expect(metricOf({ public_metrics: { reply_count: 61 } }, "reply_count")).toBe(61)
  })

  it("is 0 when absent, because it is decoration and not the subject", () => {
    expect(metricOf({}, "reply_count")).toBe(0)
    expect(metricOf({ public_metrics: { reply_count: "61" } }, "reply_count")).toBe(0)
  })
})

describe("metricsFor", () => {
  // The blob as `source_item.meta` froze it at import, and the reading the
  // daily refresh took of the same post three weeks later.
  const frozen = {
    public_metrics: { impression_count: 287, reply_count: 1 },
  }

  it("prefers the live reading over the frozen blob", () => {
    // The whole point of plans/027 2c: a post read on the day it went out was
    // being ranked against a post read three weeks later.
    expect(metricsFor(frozen, reading({ impressions: 4247, replies: 12 }))).toEqual({
      impressions: 4247,
      replies: 12,
      live: true,
    })
  })

  it("falls back to the frozen blob when nothing has measured the post", () => {
    // The corpus is two years old and the series covers thirty days, so this
    // is the majority case and stays the majority case forever.
    expect(metricsFor(frozen)).toEqual({
      impressions: 287,
      replies: 1,
      live: false,
    })
    expect(metricsFor(frozen, null)).toEqual({
      impressions: 287,
      replies: 1,
      live: false,
    })
  })

  it("keeps the frozen number when the reading withheld the field", () => {
    // `metricValuesFrom` reports an absent `impression_count` as 0. A post does
    // not lose views, so a 0 sitting under 287 is X not answering — not a flop.
    expect(metricsFor(frozen, reading({ impressions: 0 }))).toEqual({
      impressions: 287,
      replies: 1,
      live: false,
    })
  })

  it("keeps a genuine zero when there is nothing frozen behind it", () => {
    // An archive row carries no metrics at all, so the reading is the only
    // answer there is, and 0 is a real one.
    expect(metricsFor({}, reading({ impressions: 0 }))).toEqual({
      impressions: 0,
      replies: 0,
      live: true,
    })
  })

  it("leaves an unscorable row unscorable", () => {
    // Counted by `skipped` rather than dropped. Null here, never 0 — the page
    // would otherwise report an archive import as a corpus of flops.
    expect(metricsFor({}).impressions).toBeNull()
    expect(metricsFor(null).impressions).toBeNull()
  })
})

describe("liveBaseline", () => {
  it("is empty on a fresh account rather than a row of zeroes", () => {
    // Nothing measured is not the same fact as thirty days of posts that did
    // nothing, and rendering the second when the first is true is the most
    // convincing kind of lie this page can tell.
    const base = liveBaseline([], "UTC", { connected: false, matched: 0 })
    expect(base.empty).toBe(true)
    expect(base.count).toBe(0)
    expect(base.median).toBe(0)
    expect(base.since).toBeNull()
    expect(base.connected).toBe(false)
    expect(base.days).toBe(30)
  })

  it("medians the window and names the newest reading in the reader's zone", () => {
    const base = liveBaseline(
      [
        reading({
          impressions: 287,
          capturedAt: new Date("2026-08-24T00:00:00Z"),
        }),
        reading({
          impressions: 938,
          likes: 5,
          replies: 1,
          capturedAt: new Date("2026-08-26T00:00:00Z"),
        }),
        reading({
          impressions: 4247,
          capturedAt: new Date("2026-08-25T00:00:00Z"),
        }),
      ],
      "UTC",
      { connected: true, matched: 2 }
    )
    expect(base.empty).toBe(false)
    expect(base.count).toBe(3)
    expect(base.median).toBe(938)
    expect(base.best).toBe(4247)
    expect(base.medianEngagements).toBe(0)
    // The newest, not the last in the array — the rows arrive ordered by post.
    expect(base.since).toBe("Aug 26 2026")
    expect(base.matched).toBe(2)
  })

  it("reports the newest reading in the reader's zone, not the server's", () => {
    // 23:30 UTC is already tomorrow in Oslo. Same rule as every other date on
    // this page.
    const rows = [
      reading({ impressions: 1, capturedAt: new Date("2026-08-26T23:30:00Z") }),
    ]
    expect(
      liveBaseline(rows, "Europe/Oslo", { connected: true, matched: 1 }).since
    ).toBe("Aug 27 2026")
  })
})

describe("NumbersView", () => {
  it("carries the live baseline beside the corpus median, not instead of it", () => {
    // Typed on purpose: the corpus median answers "what does a post of mine
    // normally do" over two years, and `live` answers "what am I doing now"
    // over thirty days. One field overwriting the other would restate the
    // first question as the second and nobody would see it happen.
    const view: Pick<NumbersView, "median" | "mean" | "live"> = {
      median: 938,
      mean: 4946,
      live: liveBaseline([reading({ impressions: 4247 })], "UTC", {
        connected: true,
        matched: 1,
      }),
    }

    expect(view.median).toBe(938)
    expect(view.live.median).toBe(4247)
    expect(view.live.empty).toBe(false)
  })
})

describe("hook", () => {
  it("takes the first line only", () => {
    expect(hook("I built a money printer in two days🤯\n\nIm 100% sure")).toBe(
      "I built a money printer in two days🤯"
    )
  })

  it("strips the t.co shortlink X appends", () => {
    // 43 of the 57 rows carry one; 9 of them at the end of the opening line.
    expect(hook("Love it ✨ https://t.co/Q0UPNKUsJO")).toBe("Love it ✨")
  })

  it("strips more than one trailing link", () => {
    expect(hook("Repo 🔗 https://t.co/aaa https://t.co/bbb")).toBe("Repo 🔗")
  })

  it("keeps a link that is inside the sentence", () => {
    // Mid-sentence a link is grammar. Cutting it leaves a hole in the line.
    expect(hook("see https://t.co/aaa for the repo")).toBe(
      "see https://t.co/aaa for the repo"
    )
  })

  it("unescapes the entities X sends", () => {
    expect(
      hook("Is it possible to migrate icons. From Lucide -&gt; Hugeicons ?")
    ).toBe("Is it possible to migrate icons. From Lucide -> Hugeicons ?")
  })

  it("unwinds &amp; last, so a typed ampersand survives", () => {
    // "&amp;gt;" is a literal "&gt;" the user typed. Decoding & first would
    // turn it into ">".
    expect(hook("R&amp;D and &amp;gt; too")).toBe("R&D and &gt; too")
  })

  it("falls back rather than returning nothing when the line is only a link", () => {
    // Nothing in the corpus does this today. A live import eventually will, and
    // an empty cell reads as a failed load.
    expect(hook("https://t.co/aaa")).toBe("https://t.co/aaa")
  })

  it("caps with a real ellipsis and no trailing space", () => {
    expect(hook("aaaa bbbb cccc", 10)).toBe("aaaa bbbb…")
  })

  it("leaves a line exactly at the cap alone", () => {
    expect(hook("abcdefghij", 10)).toBe("abcdefghij")
  })
})

describe("formatMultiple", () => {
  it("drops the decimal once the number is large enough not to need it", () => {
    expect(formatMultiple(74.16)).toBe("74×")
    expect(formatMultiple(10)).toBe("10×")
  })

  it("keeps one decimal in the band where it carries meaning", () => {
    expect(formatMultiple(6.2)).toBe("6.2×")
    expect(formatMultiple(1)).toBe("1.0×")
  })

  it("keeps two below the line, where one would round everything to 0.9", () => {
    expect(formatMultiple(0.31)).toBe("0.31×")
  })

  it("says nothing rather than NaN when there is no median to divide by", () => {
    expect(formatMultiple(Number.NaN)).toBe("—")
    expect(formatMultiple(Number.POSITIVE_INFINITY)).toBe("—")
  })
})

describe("angleOf", () => {
  it("files the real openers", () => {
    // All five copied out of the column.
    expect(angleOf("I built a money printer in two days🤯")?.id).toBe("build-reveal")
    expect(angleOf("Story time - And its about @shadcn 🤯")?.id).toBe("story")
    expect(angleOf("Looking for a good MCP for SEO - Anyone got something ✨")?.id).toBe("ask")
    expect(angleOf("Repo 🔗")?.id).toBe("link-reply")
    expect(angleOf("My two cents ✨\n\nNot using AI for development")?.id).toBe("opinion")
  })

  it("reads the question mark on the first line only", () => {
    expect(angleOf("Prediction: Will Tailwind join Vercel?")?.id).toBe("ask")
    // A question buried in the body is not an opener asking the timeline for
    // something, and treating it as one would empty every other group.
    expect(angleOf("Meetings are now content days ✨\n\nRight?")).toBeNull()
  })

  it("gives a build reveal to the reveal, not to the question in it", () => {
    // Order in ANGLES is load-bearing: this opener matches both tests, and the
    // claim being made is what the page is scoring.
    expect(angleOf("I built this. What am i missing?")?.id).toBe("build-reveal")
  })

  it("leaves an opener that matches nothing unfiled", () => {
    expect(angleOf("Im back baby ✨")).toBeNull()
  })
})

describe("rollupByAngle", () => {
  const bodies = new Map([
    ["a", "I built a money printer in two days🤯"],
    ["b", "I built an open source AI hedge fund 🤯"],
    ["c", "Repo 🔗"],
    ["d", "Demo 🔗"],
    ["e", "Im back baby ✨"],
  ])

  const posts = [
    post({ id: "a", impressions: 69560, multiple: 74.16 }),
    post({ id: "b", impressions: 6255, multiple: 6.67 }),
    post({ id: "c", impressions: 4247, multiple: 4.53 }),
    post({ id: "d", impressions: 358, multiple: 0.38 }),
    post({ id: "e", impressions: 850, multiple: 0.91 }),
  ]

  it("scores a group by the median of its multiples, not its mean", () => {
    const rows = rollupByAngle(posts, bodies)
    const reveal = rows.find((r) => r.id === "build-reveal")
    // Mean would be 40.4× and would sell a one-off as a repeatable angle.
    expect(reveal?.medianMultiple).toBeCloseTo((74.16 + 6.67) / 2, 5)
  })

  it("sorts the named angles best first", () => {
    const rows = rollupByAngle(posts, bodies)
    expect(rows.map((r) => r.id).slice(0, 2)).toEqual(["build-reveal", "link-reply"])
  })

  it("pins Unfiled last however well it scores", () => {
    // A residue bucket at the top would recommend "write something matching
    // none of these" as a strategy.
    const rows = rollupByAngle(
      [post({ id: "e", impressions: 99999, multiple: 106 })],
      new Map([["e", "Im back baby ✨"]])
    )
    expect(rows.at(-1)?.id).toBe("unfiled")
  })

  it("orders the evidence inside a group by reach", () => {
    const rows = rollupByAngle(posts, bodies)
    const reveal = rows.find((r) => r.id === "build-reveal")
    expect(reveal?.posts.map((p) => p.id)).toEqual(["a", "b"])
  })

  it("returns no rows for an empty corpus rather than a row of nothing", () => {
    expect(rollupByAngle([], new Map())).toEqual([])
  })

  it("falls back to the hook when the body is missing", () => {
    // `bodies` is keyed by id; a caller that loses an entry should still file
    // the post rather than drop it into Unfiled.
    const rows = rollupByAngle(
      [post({ id: "z", hook: "Repo 🔗", multiple: 2 })],
      new Map()
    )
    expect(rows[0]?.id).toBe("link-reply")
  })
})

describe("endsOf", () => {
  const row = (id: string, medianMultiple: number) => ({
    id,
    label: id,
    note: "",
    medianMultiple,
    posts: [],
  })

  it("names the top and bottom named angles", () => {
    const { best, worst } = endsOf([row("a", 6), row("b", 2), row("c", 0.4)])
    expect(best?.id).toBe("a")
    expect(worst?.id).toBe("c")
  })

  it("never names Unfiled at either end", () => {
    const { best, worst } = endsOf([
      row("a", 6),
      row("b", 2),
      row("unfiled", 0.1),
    ])
    expect(best?.id).toBe("a")
    expect(worst?.id).toBe("b")
  })

  it("gives no comparison when there is only one angle to compare", () => {
    // The page renders no sentence rather than an empty one.
    const { best, worst } = endsOf([row("a", 6), row("unfiled", 0.1)])
    expect(best?.id).toBe("a")
    expect(worst).toBeNull()
  })

  it("gives neither end for an empty corpus", () => {
    expect(endsOf([])).toEqual({ best: null, worst: null })
  })
})

describe("barLength", () => {
  it("draws nothing at the median, which is the baseline itself", () => {
    // The median post is exactly 1.0×. Its length is 0, and the caller applies
    // the 2px floor — reading the raw length into `top` but the floored one
    // into `height` is what once hung this bar under the line it defines.
    expect(barLength(1)).toBe(0)
  })

  it("gives equal pixels to equal ratios on both sides of the line", () => {
    // 2× above and 0.5× below are the same distance from the median. Two
    // scales meeting at a baseline is the classic way a diverging chart lies.
    expect(barLength(2)).toBe(UNIT_PX)
    expect(barLength(0.5)).toBe(UNIT_PX)
  })

  it("doubles the ratio for each unit of length", () => {
    expect(barLength(4)).toBe(2 * UNIT_PX)
    expect(barLength(16)).toBe(4 * UNIT_PX)
  })

  it("clamps a post past the ceiling instead of drawing off the plot", () => {
    expect(barLength(2 ** 12)).toBe(DOMAIN_UP * UNIT_PX)
  })

  it("survives the numbers a zero median produces", () => {
    // `getNumbers` puts 0 in every multiple when nothing scored. NaN here would
    // reach a style attribute.
    expect(barLength(0)).toBe(0)
    expect(barLength(Number.NaN)).toBe(0)
    expect(barLength(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe("isClipped", () => {
  it("stays quiet for the whole of the current corpus", () => {
    // The best post is 74.16× against a 2^6.3 ≈ 79× ceiling.
    expect(isClipped(69560 / 938)).toBe(false)
    expect(isClipped(287 / 938)).toBe(false)
  })

  it("says so when the clamp actually bit", () => {
    // A clipped bar and one that genuinely reached the ceiling are drawn
    // identically. On a chart about outliers that is the one implication the
    // geometry must never make.
    expect(isClipped(2 ** (DOMAIN_UP + 1))).toBe(true)
    expect(isClipped(2 ** (DOMAIN_DOWN - 1))).toBe(true)
  })

  it("is false rather than throwing on an unusable multiple", () => {
    expect(isClipped(0)).toBe(false)
    expect(isClipped(Number.NaN)).toBe(false)
  })
})

describe("formatMonth", () => {
  it("labels an axis end in the reader's zone", () => {
    expect(formatMonth(new Date("2025-11-27T12:00:00Z"), "UTC")).toBe("Nov 2025")
    // 23:30 UTC on Dec 31 is already January in Oslo.
    expect(formatMonth(new Date("2025-12-31T23:30:00Z"), "Europe/Oslo")).toBe(
      "Jan 2026"
    )
  })
})

describe("formatPostDate", () => {
  it("formats in the reader's zone, not the server's", () => {
    // 23:30 UTC on the 7th is already the 8th in Oslo. Formatting this in the
    // server's zone is how a page tells a reader the wrong day.
    const at = new Date("2026-08-07T23:30:00Z")
    expect(formatPostDate(at, "Europe/Oslo", false)).toBe("Aug 8")
    expect(formatPostDate(at, "UTC", false)).toBe("Aug 7")
  })

  it("adds the year only when asked", () => {
    const at = new Date("2025-11-27T12:00:00Z")
    expect(formatPostDate(at, "UTC", false)).toBe("Nov 27")
    expect(formatPostDate(at, "UTC", true)).toBe("Nov 27 2025")
  })
})
