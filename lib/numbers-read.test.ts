import { describe, expect, it } from "vitest"

import {
  againstMedianPost,
  againstUsual,
  freshness,
  isStale,
  median,
  readNumbers,
  shapeNumbers,
  usualOf,
  weekLabel,
  weeksBefore,
  type NumbersData,
  type Post,
  type Reading,
} from "./numbers-read"

const TODAY = "2026-11-16"

function post(day: number | null, views = 700, replies = 1, id = `p-${day}-${views}-${replies}`): Post {
  return { id, hook: "A post", body: null, day, views, replies, likes: 0, reposts: 0, bookmarks: 0, climb: [views], repliers: [] }
}

function data(over: Partial<NumbersData> = {}): NumbersData {
  return { today: TODAY, connected: true, historyWeeks: 12, posts: [], people: null, quincy: [], lastRead: TODAY, notes: [], ...over }
}

describe("median", () => {
  it("is the middle value of an odd count", () => {
    expect(median([5, 1, 3])).toBe(3)
  })
  it("averages the two middle values of an even count", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5)
  })
  it("is 0 for nothing, never NaN", () => {
    expect(median([])).toBe(0)
  })
})

describe("weeksBefore: the complete weeks a usual stands on", () => {
  it("starts at the first rolling week wholly before the window", () => {
    // 7 days is week 0; the usual starts at week 1.
    expect(weeksBefore(7, 5)).toEqual([1, 2, 3, 4])
    // 30 days covers weeks 0–4 (ceil(30/7) = 5); the usual starts at week 5.
    expect(weeksBefore(30, 8)).toEqual([5, 6, 7])
  })
  it("counts only weeks the history covers completely", () => {
    expect(weeksBefore(7, 1)).toEqual([])
    expect(weeksBefore(7, 3)).toEqual([1, 2])
  })
  it("stops at twelve weeks", () => {
    expect(weeksBefore(7, 40)).toHaveLength(12)
  })
})

describe("usualOf", () => {
  it("is the median of the weeks before the window, scaled to the window", () => {
    const perWeek = (w: number) => [0, 2, 4, 6, 100][w] ?? 0
    // 7 days: weeks 1..4 → 2, 4, 6, 100 → median 5, times 1.
    expect(usualOf(perWeek, 7, 5)).toEqual({ usual: 5, weeks: 4 })
    // 14 days: weeks 2..4 → 4, 6, 100 → median 6, times 2.
    expect(usualOf(perWeek, 14, 5)).toEqual({ usual: 12, weeks: 3 })
  })
  it("needs 3 weeks: below that there is no usual", () => {
    expect(usualOf(() => 4, 7, 3)).toEqual({ usual: null, weeks: 2 })
    expect(usualOf(() => 4, 7, 4).usual).toBe(4)
  })
  it("is not thrown by one outlier week", () => {
    const weeks = [0, 3, 3, 3, 90]
    expect(usualOf((w) => weeks[w]!, 7, 5).usual).toBe(3)
  })
})

describe("readNumbers", () => {
  it("states replies against the median of the complete weeks before the window", () => {
    // Three replies in each of weeks 1..6, five this week.
    const posts = [post(2, 700, 5), ...[1, 2, 3, 4, 5, 6].map((w) => post(w * 7 + 1, 700, 3))]
    const read = readNumbers(data({ historyWeeks: 7, posts }), "7")
    const replies = read.tiles.find((t) => t.measure === "replies")!
    expect(replies.value).toBe(5)
    expect(replies.baseline).toEqual({ usual: 3, weeks: 6 })
    expect(read.enoughHistory).toBe(true)
  })

  it("has no usual and no median post with fewer than 3 weeks behind the window", () => {
    const posts = [post(1), post(8), post(9), post(10)]
    const read = readNumbers(data({ historyWeeks: 2, posts }), "7")
    expect(read.enoughHistory).toBe(false)
    expect(read.medianViews).toBeNull()
    for (const t of read.tiles) expect(t.baseline.usual).toBeNull()
  })

  it("takes the median post from posts before the window, undated ones included", () => {
    const posts = [post(1, 5000), post(null, 100), post(null, 300), post(20, 500)]
    const read = readNumbers(data({ posts }), "7")
    expect(read.medianViews).toBe(300)
    expect(read.scored).toEqual([{ post: posts[0], multiple: 5000 / 300 }])
  })

  it("scores only the posts in the window, newest first", () => {
    const posts = [post(5), post(1), post(40), post(null), post(null), post(null)]
    const read = readNumbers(data({ posts }), "7")
    expect(read.scored.map((s) => s.post.day)).toEqual([1, 5])
  })

  it("says Came back is not read when who replied is unknown, and never a number", () => {
    const read = readNumbers(data({ posts: [post(1, 700, 4)] }), "30")
    const back = read.tiles.find((t) => t.measure === "people")!
    expect(back.value).toBeNull()
    expect(back.notRead).toBeTruthy()
    expect(back.weekly.every((v) => v === null)).toBe(true)
    expect(read.people).toBeNull()
  })

  it("puts Depth before Volume", () => {
    const read = readNumbers(data(), "30")
    expect(read.tiles.map((t) => t.kind)).toEqual(["depth", "depth", "volume", "volume"])
  })

  it("never totals views: reach is a median per post", () => {
    const posts = [post(1, 100), post(2, 300), post(3, 10_000)]
    const reach = readNumbers(data({ posts }), "7").tiles.find((t) => t.measure === "reach")!
    expect(reach.value).toBe(300)
  })

  it("counts people who came back when who replied is read", () => {
    const people = [
      { id: "a", name: "A B", handle: "ab", replyDays: [2, 40], answered: true },
      { id: "b", name: "C D", handle: "cd", replyDays: [3], answered: false },
    ]
    const read = readNumbers(data({ people }), "7")
    expect(read.tiles.find((t) => t.measure === "people")!.value).toBe(1)
    expect(read.people?.map((p) => p.person.id)).toEqual(["a", "b"])
  })
})

describe("againstUsual: the sentence, and its deltas", () => {
  it("needs 3 weeks when there is no usual", () => {
    expect(againstUsual(4, null, "replies", 30)).toBe("Needs 3 weeks before I can say what's usual.")
  })
  it("calls within 10% about your usual", () => {
    expect(againstUsual(10, 10.4, "replies", 7)).toBe("About your usual, 10 a week.")
    expect(againstUsual(9, 10, "replies", 30)).toBe("About your usual, 10 in 30 days.")
  })
  it("states above as a multiple", () => {
    expect(againstUsual(30, 12, "replies", 30)).toBe("2.5× your usual 12 in 30 days.")
  })
  it("states below in words, not as a fraction", () => {
    expect(againstUsual(5, 8.6, "replies", 30)).toBe("Under your usual 8.6 in 30 days.")
  })
  it("handles a usual of zero without dividing by it", () => {
    expect(againstUsual(2, 0, "replies", 7)).toBe("Usually none. Your usual is 0 replies.")
    expect(againstUsual(0, 0, "replies", 7)).toBe("About your usual.")
  })
})

describe("againstMedianPost", () => {
  it("needs 3 weeks for a median post", () => {
    expect(againstMedianPost(700, null)).toBe("Needs 3 weeks before there's a median post.")
  })
  it("states the multiple and the median", () => {
    expect(againstMedianPost(728, 662)).toBe("1.1× your median post, 662.")
    expect(againstMedianPost(165, 660)).toBe("0.25× your median post, 660.")
    expect(againstMedianPost(670, 665)).toBe("About your median post, 665.")
  })
})

describe("weekLabel", () => {
  it("names the rolling week, across a month", () => {
    expect(weekLabel(TODAY, 0)).toBe("Nov 10 – 16")
    expect(weekLabel(TODAY, 2)).toBe("Oct 27 – Nov 2")
  })
})

describe("shapeNumbers", () => {
  const now = new Date("2026-11-16T09:00:00Z")
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`)
  const reading = (externalId: string, day: string, impressions: number, over: Partial<Reading> = {}): Reading => ({
    externalId,
    sourceItemId: "",
    capturedAt: at(day),
    impressions,
    replies: 0,
    likes: 0,
    reposts: 0,
    bookmarks: 0,
    ...over,
  })
  const base = { now, bodies: new Map<string, string>(), connected: true, usage: [], drafted: [], approved: [], read: [], people: null }

  it("dates a post by its first reading, and leaves posts already out when readings began undated", () => {
    const shaped = shapeNumbers({
      ...base,
      readings: [reading("old", "2026-10-01", 500), reading("old", "2026-10-02", 600), reading("new", "2026-11-14", 100), reading("new", "2026-11-15", 900)],
    })
    const old = shaped.posts.find((p) => p.id === "old")!
    const fresh = shaped.posts.find((p) => p.id === "new")!
    expect(old.day).toBeNull()
    expect(old.views).toBe(600)
    expect(fresh.day).toBe(2)
    expect(fresh.views).toBe(900)
    expect(fresh.climb).toEqual([100, 900])
    expect(shaped.notes[0]).toMatch(/1 post was already out/)
  })

  it("counts complete weeks of history from the first reading", () => {
    // 2026-10-01 to 2026-11-16 is 46 days: 6 complete weeks.
    const shaped = shapeNumbers({ ...base, readings: [reading("a", "2026-10-01", 1)] })
    expect(shaped.historyWeeks).toBe(6)
    expect(shaped.lastRead).toBe("2026-10-01")
  })

  it("uses the post's text when the corpus has it, and says so when it has not", () => {
    const shaped = shapeNumbers({
      ...base,
      bodies: new Map([["si1", "I cut the form to two fields. https://t.co/abc\n\nSignups:\n61%"]]),
      readings: [reading("a", "2026-10-01", 1), reading("b", "2026-11-10", 1, { sourceItemId: "si1" }), reading("c", "2026-11-12", 1)],
    })
    expect(shaped.posts.find((p) => p.id === "b")!.hook).toBe("I cut the form to two fields.")
    expect(shaped.posts.find((p) => p.id === "c")!.hook).toBe("A post on X, first measured Nov 12")
    expect(shaped.posts.find((p) => p.id === "c")!.body).toBeNull()
  })

  it("buckets Quincy's work by rolling week and counts x:post as went out", () => {
    const shaped = shapeNumbers({
      ...base,
      readings: [reading("a", "2026-10-01", 1)],
      usage: [
        { model: "x:post", createdAt: at("2026-11-15"), costMicros: 10_000 },
        { model: "x:read", createdAt: at("2026-11-08"), costMicros: 5_000 },
      ],
      drafted: [at("2026-11-16"), at("2026-11-02")],
      approved: [at("2026-11-16")],
      read: [at("2026-11-09")],
    })
    expect(shaped.quincy[0]).toEqual({ read: 0, drafted: 1, approved: 1, posted: 1, costMicros: 10_000 })
    expect(shaped.quincy[1]).toEqual({ read: 1, drafted: 0, approved: 0, posted: 0, costMicros: 5_000 })
    expect(shaped.quincy[2]!.drafted).toBe(1)
  })

  it("is empty with no readings", () => {
    const shaped = shapeNumbers({ ...base, readings: [] })
    expect(shaped.posts).toEqual([])
    expect(shaped.historyWeeks).toBe(0)
    expect(shaped.lastRead).toBeNull()
  })
})

describe("freshness", () => {
  it("says this morning, or the last day read", () => {
    expect(freshness(data({ lastRead: TODAY }))).toBe("Against your own median. Read this morning.")
    expect(freshness(data({ lastRead: "2026-11-12" }))).toBe("Against your own median. Last read Nov 12.")
    expect(freshness(data({ lastRead: null }))).toBe("Against your own median. Nothing read yet.")
  })
  it("is stale only past a day, since the read runs at 06:00", () => {
    expect(isStale(data({ lastRead: "2026-11-15" }))).toBe(false)
    expect(isStale(data({ lastRead: "2026-11-14" }))).toBe(true)
  })
})
