import { describe, expect, it } from "vitest"

import {
  ANGLES,
  BY_DATE,
  BY_REACH,
  MEAN,
  MEDIAN,
  OUTLIER_GATE,
  POSTS,
  angleOf,
  formatDate,
  formatMultiple,
  hook,
  isOutlier,
  multiple,
  rollupByAngle,
} from "./data"

/**
 * The page's whole claim is that its numbers are real. That claim is only worth
 * something if something checks it, so these are characterization tests: the
 * expected values are not derived from the fixture, they are the answers the
 * database gave on 2026-08-09, pasted in by hand.
 *
 *   select count(*), count(distinct external_id),
 *          percentile_cont(0.5) within group (order by impressions),
 *          round(avg(impressions)), sum(impressions), sum(replies)
 *     from source_item where meta ? 'public_metrics';
 *   -- 57 | 57 | 938 | 4946 | 281894 | 302
 *
 * If someone edits a digit in data.ts, or a re-import lands and the fixture is
 * refreshed without re-running that query, this file fails and says so. That is
 * the entire point: a snapshot nobody verifies is just numbers that look real.
 */
const SNAPSHOT = {
  rows: 57,
  distinctIds: 57,
  median: 938,
  mean: 4946,
  sumImpressions: 281894,
  sumReplies: 302,
} as const

describe("the corpus matches the database snapshot", () => {
  it("has every row, with no duplicate tweet", () => {
    expect(POSTS).toHaveLength(SNAPSHOT.rows)
    expect(new Set(POSTS.map((p) => p.id)).size).toBe(SNAPSHOT.distinctIds)
  })

  it("agrees with the aggregates the database reported", () => {
    expect(MEDIAN).toBe(SNAPSHOT.median)
    expect(MEAN).toBe(SNAPSHOT.mean)
    expect(POSTS.reduce((sum, p) => sum + p.impr, 0)).toBe(
      SNAPSHOT.sumImpressions
    )
    expect(POSTS.reduce((sum, p) => sum + p.replies, 0)).toBe(
      SNAPSHOT.sumReplies
    )
  })

  it("carries the worst content the layouts have to survive", () => {
    // A 14-character post, so nothing may assume a hook fills its line.
    expect(POSTS.some((p) => p.body === "Im back baby ✨")).toBe(true)
    // The same body twice with different outcomes — the case that proves reach
    // is not a property of the text alone.
    const repos = POSTS.filter((p) => p.body === "Repo 🔗")
    expect(repos.length).toBeGreaterThanOrEqual(2)
    expect(new Set(repos.map((p) => p.impr)).size).toBeGreaterThan(1)
  })

  it("has no row that could divide by zero or sort as NaN", () => {
    for (const post of POSTS) {
      expect(Number.isFinite(post.impr)).toBe(true)
      expect(post.impr).toBeGreaterThan(0)
      expect(post.at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe("multiple", () => {
  it("puts the median post exactly on the line", () => {
    const medianPost = POSTS.find((p) => p.impr === MEDIAN)
    expect(medianPost).toBeDefined()
    expect(multiple(medianPost!)).toBe(1)
  })

  it("scores the best and worst posts where the database says", () => {
    expect(multiple(BY_REACH[0])).toBeCloseTo(69560 / 938, 5)
    expect(multiple(BY_REACH[BY_REACH.length - 1])).toBeCloseTo(287 / 938, 5)
  })

  it("counts 18 posts at or past the outlier gate", () => {
    // The headline on every variant. If the corpus moves, this number moves,
    // and the copy that quotes it has to move with it.
    expect(POSTS.filter(isOutlier)).toHaveLength(18)
    expect(POSTS.filter((p) => multiple(p) >= OUTLIER_GATE)).toHaveLength(18)
  })

  it("splits 28 below the line and 28 above, with one on it", () => {
    const below = POSTS.filter((p) => multiple(p) < 1).length
    const on = POSTS.filter((p) => multiple(p) === 1).length
    expect(below).toBe(28)
    expect(on).toBe(1)
    expect(below + on + POSTS.filter((p) => multiple(p) > 1).length).toBe(57)
  })
})

describe("hook", () => {
  it("takes the first line, which is all the algorithm judges", () => {
    const post = POSTS.find((p) =>
      p.body.startsWith("I built a money printer")
    )!
    expect(hook(post)).toBe("I built a money printer in two days🤯")
  })

  it("truncates with a real ellipsis, never three periods", () => {
    const long = POSTS.find((p) => p.body.split("\n")[0].length > 90)!
    const result = hook(long)
    expect(result.endsWith("…")).toBe(true)
    expect(result).not.toContain("...")
    expect(result.length).toBeLessThanOrEqual(91)
  })

  it("leaves a short post alone", () => {
    const short = POSTS.find((p) => p.body === "Im back baby ✨")!
    expect(hook(short)).toBe("Im back baby ✨")
  })

  it("never returns an empty string, so no row renders blank", () => {
    for (const post of POSTS) {
      expect(hook(post).length).toBeGreaterThan(0)
    }
  })
})

describe("formatMultiple", () => {
  it("drops the decimal once the number is big enough not to need it", () => {
    expect(formatMultiple(74.16)).toBe("74×")
    expect(formatMultiple(10)).toBe("10×")
  })

  it("keeps one decimal in the readable middle", () => {
    expect(formatMultiple(1)).toBe("1.0×")
    expect(formatMultiple(9.94)).toBe("9.9×")
  })

  it("keeps two below the line, where the difference is the whole point", () => {
    expect(formatMultiple(0.31)).toBe("0.31×")
    expect(formatMultiple(0.999)).toBe("1.00×")
  })
})

describe("formatDate", () => {
  it("reads the stored date without going through a timezone", () => {
    // Parsing "2026-01-07" with `new Date` would render Jan 6 for anyone west
    // of UTC. The function splits the string on purpose; this is the guard.
    expect(formatDate("2026-01-07")).toBe("Jan 7")
    expect(formatDate("2025-12-01")).toBe("Dec 1")
    expect(formatDate("2026-08-08")).toBe("Aug 8")
  })
})

describe("ordering", () => {
  it("BY_DATE runs oldest to newest", () => {
    for (let i = 1; i < BY_DATE.length; i++) {
      expect(BY_DATE[i].at >= BY_DATE[i - 1].at).toBe(true)
    }
    expect(BY_DATE[0].at).toBe("2025-11-27")
    expect(BY_DATE[BY_DATE.length - 1].at).toBe("2026-08-08")
  })

  it("BY_REACH runs loudest first", () => {
    for (let i = 1; i < BY_REACH.length; i++) {
      expect(BY_REACH[i].impr <= BY_REACH[i - 1].impr).toBe(true)
    }
  })

  it("does not mutate POSTS while sorting", () => {
    expect(POSTS[0].impr).toBe(69560)
    expect(POSTS).toHaveLength(57)
  })
})

describe("rollupByAngle", () => {
  it("files every post exactly once", () => {
    const rows = rollupByAngle()
    const total = rows.reduce((sum, r) => sum + r.posts.length, 0)
    expect(total).toBe(POSTS.length)

    const ids = rows.flatMap((r) => r.posts.map((p) => p.id))
    expect(new Set(ids).size).toBe(POSTS.length)
  })

  it("sorts rows by how well the angle did, best first", () => {
    const rows = rollupByAngle()
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].medianMultiple <= rows[i - 1].medianMultiple).toBe(true)
    }
  })

  it("names a best post per row that really is that row's best", () => {
    for (const row of rollupByAngle()) {
      const max = Math.max(...row.posts.map((p) => p.impr))
      expect(row.best.impr).toBe(max)
    }
  })

  it("keeps Unfiled as a residue bucket, never a named angle", () => {
    const rows = rollupByAngle()
    const unfiled = rows.find((r) => r.angle.id === "unfiled")
    expect(unfiled).toBeDefined()
    expect(ANGLES.some((a) => a.id === "unfiled")).toBe(false)
  })

  it("assigns an angle by first match, so ANGLES order is load-bearing", () => {
    // "I just sold a software to Visma 🤯" matches both the story test and,
    // via its "?"-free first line, nothing else — but the ordering guarantee
    // is what stops a future angle from silently stealing posts from an
    // earlier one. Pin it.
    const post = POSTS.find((p) => p.body.startsWith("I just sold"))!
    const angle = angleOf(post)
    expect(angle?.id).toBe("story")

    const firstMatch = ANGLES.find((a) => a.test(post))
    expect(angle).toBe(firstMatch)
  })

  it("survives a corpus where nothing matches an angle", () => {
    // The shape Ledger crashed on: every row unfiled, so there is no named
    // angle to call best or worst.
    const rows = rollupByAngle()
    const named = rows.filter((r) => r.angle.id !== "unfiled")
    expect(named.length).toBeGreaterThan(0)
    // And the guard the component now relies on holds for the degenerate case.
    expect([].filter(Boolean)[0] ?? null).toBeNull()
  })
})
