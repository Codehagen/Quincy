/**
 * A synthetic corpus with the shape of a real one.
 *
 * 57 posts about Tidewell, a fictional booking tool for small harbours. The ids,
 * bodies and metrics are invented; the distribution is modelled on what an
 * imported X history actually looks like, because a prototype fed pretty,
 * evenly spread numbers makes every variant look fine and hides the decision.
 *
 * It carries the worst content on purpose:
 *   - "Back at it ✨" — 12 characters, and still near the median
 *   - three posts with the identical body "Repo 🔗" that did very different reach
 *   - 300-character bodies and a 100-character first line that have to
 *     truncate somewhere sensible
 *   - a 67× outlier that breaks any linear axis
 */

export type Post = {
  id: string
  body: string
  at: string
  impr: number
  likes: number
  replies: number
  marks: number
}

export const POSTS: Post[] = [
  {
    id: "fake-001",
    at: "2026-01-08",
    impr: 56687,
    likes: 617,
    replies: 51,
    marks: 1058,
    body: "I built a booking engine for small harbours in two days 🤯\n\nEvery marina I called still took berths by phone, so I wired a calendar to a payment link and handed it to one harbour master.\n\n412\n\nberths booked through it in the first week. The boring problem was the real one.",
  },
  {
    id: "fake-002",
    at: "2026-07-20",
    impr: 47725,
    likes: 512,
    replies: 11,
    marks: 207,
    body: "Story time - and it's about a harbour master called Olav 🤯\n\nI showed him Tidewell on a laptop balanced on a bollard. He scrolled for a minute and said nothing.\n\nThen he asked if it could text the boat owners. That one question became the whole roadmap.",
  },
  {
    id: "fake-003",
    at: "2026-06-25",
    impr: 18461,
    likes: 133,
    replies: 43,
    marks: 55,
    body: "I just sold Tidewell's first multi-harbour contract 🤯\n\nThree marinas on one fjord, one invoice, one login.\n\n◆ Shared berth map\n◆ One payout\n◆ A harbour master who no longer answers the phone at 11pm",
  },
  {
    id: "fake-004",
    at: "2026-07-02",
    impr: 16484,
    likes: 148,
    replies: 9,
    marks: 326,
    body: "This made me ship Tidewell features x3 faster 🤯\n\nI wrote down every screen before writing any code. One page, every component, nothing else.\n\n◆ Page shells\n◆ Booking states\n◆ Empty harbours",
  },
  {
    id: "fake-005",
    at: "2026-07-17",
    impr: 8947,
    likes: 61,
    replies: 3,
    marks: 28,
    body: "Is there a clean way to sync tide tables into a calendar feed without running one cron per harbour?",
  },
  {
    id: "fake-006",
    at: "2026-01-05",
    impr: 8234,
    likes: 90,
    replies: 15,
    marks: 65,
    body: "You can build this in 2 hours - I did 🤯\n\nA live berth map for a marina with 60 boats.\n\n◆ Map\n◆ Bookings\n◆ Payments\n\nThe harbour master printed it and pinned it to the wall.",
  },
  {
    id: "fake-007",
    at: "2026-07-30",
    impr: 7906,
    likes: 22,
    replies: 1,
    marks: 20,
    body: "Love this ✨",
  },
  {
    id: "fake-008",
    at: "2025-12-03",
    impr: 7059,
    likes: 84,
    replies: 8,
    marks: 89,
    body: "Somebody is going to run their marina on this 🤯\n\n◆ Reads the tide table\n◆ Moves bookings when the water is too low\n◆ Texts every owner the new time\n\nIt ran all weekend and nobody called the office.",
  },
  {
    id: "fake-009",
    at: "2025-11-30",
    impr: 5297,
    likes: 42,
    replies: 3,
    marks: 31,
    body: "Tidewell now takes payment at the dock\n\nTap a phone on the sign, pay for the night, walk away.\n\n38\n\npayments the first Saturday. Before this the harbour chased every one by email.",
  },
  {
    id: "fake-010",
    at: "2026-07-26",
    impr: 5093,
    likes: 55,
    replies: 7,
    marks: 82,
    body: "I built an open source tide predictor 🤯\n\nPublic harmonic data in, a 14-day table out.\n\nIt was off by 6 minutes against the official table. Good enough to plan a booking around.",
  },
  {
    id: "fake-011",
    at: "2025-12-08",
    impr: 4722,
    likes: 82,
    replies: 13,
    marks: 104,
    body: "You will never chase a berth deposit again 🤯\n\n◆ Holds the deposit at booking\n◆ Releases it when the boat leaves\n◆ Sends the receipt itself",
  },
  {
    id: "fake-012",
    at: "2026-01-10",
    impr: 3898,
    likes: 12,
    replies: 7,
    marks: 2,
    body: "Watched a talk on seasonal businesses and I'm sold ✨\n\nMarinas earn their year in fourteen weeks. Everything Tidewell does has to pay off inside that window.",
  },
  {
    id: "fake-013",
    at: "2026-01-09",
    impr: 3820,
    likes: 42,
    replies: 4,
    marks: 67,
    body: "Repo 🔗",
  },
  {
    id: "fake-014",
    at: "2026-07-07",
    impr: 3566,
    likes: 21,
    replies: 10,
    marks: 25,
    body: "What am I missing? 👀\n\nThe booking flow converts well on desktop, but 70% of harbour traffic is a phone on a pontoon in the wind.",
  },
  {
    id: "fake-015",
    at: "2025-11-29",
    impr: 3229,
    likes: 50,
    replies: 7,
    marks: 8,
    body: "Almost hit my hosting limits on Tidewell this month\n\nOne harbour put the berth map on a screen in the café and it refreshed every 5 seconds.\n\n2.1M\n\nrequests from one television.",
  },
  {
    id: "fake-016",
    at: "2026-01-05",
    impr: 3134,
    likes: 8,
    replies: 1,
    marks: 2,
    body: "Just tried a new linter on the Tidewell repo and the DX is off the charts\n\nOne config, formatting and linting in one pass.",
  },
  {
    id: "fake-017",
    at: "2026-01-25",
    impr: 3001,
    likes: 9,
    replies: 6,
    marks: 11,
    body: "Looking for a good tool for local SEO - anyone got something to recommend ✨",
  },
  {
    id: "fake-018",
    at: "2025-11-28",
    impr: 2848,
    likes: 27,
    replies: 4,
    marks: 14,
    body: "Most of my week is not code\n\nIt's phone calls with harbour masters who still keep the berth list in a ring binder. That binder is the spec.",
  },
  {
    id: "fake-019",
    at: "2026-04-03",
    impr: 1971,
    likes: 9,
    replies: 6,
    marks: 0,
    body: "Anybody else seeing build times double this week?\n\nNothing changed in the repo. 4 minutes became 9.",
  },
  {
    id: "fake-020",
    at: "2026-08-06",
    impr: 1675,
    likes: 18,
    replies: 3,
    marks: 35,
    body: "New workflow for Tidewell\n\nPrototype the screen, put it in front of one harbour master, then build. Three weeks of rework saved on the last feature alone.",
  },
  {
    id: "fake-021",
    at: "2026-01-02",
    impr: 1572,
    likes: 5,
    replies: 3,
    marks: 3,
    body: "Set up a new harbour in 5 minutes today. Last month it took an afternoon.",
  },
  {
    id: "fake-022",
    at: "2026-01-29",
    impr: 1330,
    likes: 7,
    replies: 4,
    marks: 1,
    body: "This year I'm writing down every number Tidewell moves ✨\n\nBookings, refunds, phone calls the harbour did not have to take.",
  },
  {
    id: "fake-023",
    at: "2025-12-08",
    impr: 1225,
    likes: 7,
    replies: 0,
    marks: 2,
    body: "Tidewell's year in numbers ✨\n\n📊 1,204 bookings\n📅 9 harbours\n🔥 longest streak: 41 days without a missed payout",
  },
  {
    id: "fake-024",
    at: "2026-07-30",
    impr: 1217,
    likes: 23,
    replies: 8,
    marks: 6,
    body: "I launched 4 products before this one 🤯\n\nThree were tools for developers. One was for boats. Only the boat one had customers who called me back.",
  },
  {
    id: "fake-025",
    at: "2026-02-15",
    impr: 1060,
    likes: 5,
    replies: 2,
    marks: 0,
    body: "My feed is all AI agents now - who should I follow for small-business software?",
  },
  {
    id: "fake-026",
    at: "2026-01-18",
    impr: 977,
    likes: 4,
    replies: 0,
    marks: 1,
    body: "It was finally time. Ordered the first dock sensors ✨",
  },
  {
    id: "fake-027",
    at: "2026-01-10",
    impr: 912,
    likes: 12,
    replies: 5,
    marks: 2,
    body: "Ready to film some content ✨",
  },
  {
    id: "fake-028",
    at: "2026-01-06",
    impr: 861,
    likes: 9,
    replies: 3,
    marks: 7,
    body: "Still shipping Tidewell updates over the holiday ✨\n\nAnd the harbours are closed, so nobody notices the bugs.",
  },
  {
    id: "fake-029",
    at: "2025-12-30",
    impr: 842,
    likes: 2,
    replies: 1,
    marks: 3,
    body: "This is the dashboard I wanted from day one ✨",
  },
  {
    id: "fake-030",
    at: "2026-02-12",
    impr: 836,
    likes: 7,
    replies: 2,
    marks: 1,
    body: "Working on the biggest Tidewell release yet - can't wait to share",
  },
  {
    id: "fake-031",
    at: "2026-04-14",
    impr: 791,
    likes: 1,
    replies: 0,
    marks: 0,
    body: "Back at it ✨",
  },
  {
    id: "fake-032",
    at: "2026-07-03",
    impr: 762,
    likes: 8,
    replies: 0,
    marks: 2,
    body: "The cofounder question is changing ✅\n\nI used to think a booking product needed someone technical and someone who knew boats. The tools covered the first half.",
  },
  {
    id: "fake-033",
    at: "2026-01-06",
    impr: 711,
    likes: 4,
    replies: 1,
    marks: 2,
    body: "been thinking about how seasonal businesses buy software\n\nThey buy in March, use it in July, and judge it in October.",
  },
  {
    id: "fake-034",
    at: "2026-01-04",
    impr: 703,
    likes: 2,
    replies: 0,
    marks: 0,
    body: "Sadly true story - the post about the broken pontoon got more replies than the launch.",
  },
  {
    id: "fake-035",
    at: "2025-12-05",
    impr: 701,
    likes: 1,
    replies: 0,
    marks: 1,
    body: "To get updates and be first in line to test 🔗",
  },
  {
    id: "fake-036",
    at: "2026-08-06",
    impr: 692,
    likes: 1,
    replies: 1,
    marks: 1,
    body: "So I found why I don't ship more content. It's not a lack of ideas, it's that every idea waits for a perfect screenshot.",
  },
  {
    id: "fake-037",
    at: "2026-01-04",
    impr: 656,
    likes: 4,
    replies: 3,
    marks: 0,
    body: "Who are the founders building for small harbours that I should follow? Tag them below 👇",
  },
  {
    id: "fake-038",
    at: "2026-08-08",
    impr: 643,
    likes: 11,
    replies: 1,
    marks: 1,
    body: "Are you building something for the water?\nPing me ✨",
  },
  {
    id: "fake-039",
    at: "2026-01-10",
    impr: 592,
    likes: 5,
    replies: 0,
    marks: 11,
    body: "Repo 🔗",
  },
  {
    id: "fake-040",
    at: "2025-11-27",
    impr: 590,
    likes: 7,
    replies: 0,
    marks: 1,
    body: "My two cents ✨\n\nNot talking to customers in 2025 is like building a marina without asking where the wind comes from.",
  },
  {
    id: "fake-041",
    at: "2026-01-12",
    impr: 582,
    likes: 8,
    replies: 1,
    marks: 0,
    body: "Tidewell is back on the roadmap",
  },
  {
    id: "fake-042",
    at: "2026-08-05",
    impr: 576,
    likes: 4,
    replies: 1,
    marks: 2,
    body: "My prediction for small software in 2026: the winners will be the ones a harbour master can set up without a call.",
  },
  {
    id: "fake-043",
    at: "2026-01-05",
    impr: 568,
    likes: 5,
    replies: 3,
    marks: 1,
    body: "I disconnected this holiday and here is what I got out of it\n\nNothing, and that was the point.",
  },
  {
    id: "fake-044",
    at: "2025-11-30",
    impr: 542,
    likes: 2,
    replies: 0,
    marks: 0,
    body: "If you want updates on what I build 🔗",
  },
  {
    id: "fake-045",
    at: "2026-08-03",
    impr: 527,
    likes: 6,
    replies: 0,
    marks: 2,
    body: "New mini-project coming along. This time I started from the invoice and worked backwards.",
  },
  {
    id: "fake-046",
    at: "2026-08-06",
    impr: 507,
    likes: 6,
    replies: 0,
    marks: 1,
    body: "Harbour visits are now content days ✨",
  },
  {
    id: "fake-047",
    at: "2026-01-12",
    impr: 505,
    likes: 4,
    replies: 2,
    marks: 0,
    body: "Prediction: will every marina take bookings online by 2027?",
  },
  {
    id: "fake-048",
    at: "2026-08-08",
    impr: 493,
    likes: 5,
    replies: 1,
    marks: 2,
    body: "I sold my first berth at 3am from a phone in a hotel lobby\n\nThe owner was on the water. The harbour was asleep. The booking went through anyway.",
  },
  {
    id: "fake-049",
    at: "2026-01-08",
    impr: 485,
    likes: 2,
    replies: 0,
    marks: 1,
    body: "Does anybody want to swap - I review your app, you review my videos? ✨",
  },
  {
    id: "fake-050",
    at: "2026-01-08",
    impr: 484,
    likes: 2,
    replies: 1,
    marks: 0,
    body: "Looking for video creators to follow ✨\n\nWant to get better at showing the product, not talking about it.",
  },
  {
    id: "fake-051",
    at: "2026-01-13",
    impr: 475,
    likes: 2,
    replies: 0,
    marks: 0,
    body: "A few harbours replied, still looking for the first pilot 🔥\n\nOne marina, one season, everything free.",
  },
  {
    id: "fake-052",
    at: "2026-01-10",
    impr: 465,
    likes: 4,
    replies: 2,
    marks: 1,
    body: "if you started posting everything you're building ✨\n\nthe half-done screens, the failed deploys, the customer who said no\n\nyou'd be surprised who shows up",
  },
  {
    id: "fake-053",
    at: "2026-07-29",
    impr: 453,
    likes: 2,
    replies: 1,
    marks: 4,
    body: "Repo 🔗",
  },
  {
    id: "fake-054",
    at: "2025-11-30",
    impr: 451,
    likes: 0,
    replies: 0,
    marks: 1,
    body: "Test it here 🔗",
  },
  {
    id: "fake-055",
    at: "2026-08-08",
    impr: 336,
    likes: 2,
    replies: 0,
    marks: 1,
    body: "Codename: Tidewell\n\nLaunching it in a week ✨",
  },
  {
    id: "fake-056",
    at: "2026-07-25",
    impr: 287,
    likes: 1,
    replies: 0,
    marks: 1,
    body: "Demo 🔗",
  },
  {
    id: "fake-057",
    at: "2026-08-07",
    impr: 265,
    likes: 4,
    replies: 1,
    marks: 1,
    body: "1,204 bookings in 2025\n\n3,980 so far in 2026 🤯\n\nSame harbours. Better tool.",
  },
]

/**
 * The median, computed rather than pasted, because the number is the page and a
 * stale constant would quietly lie the first time a row is added. 57 posts, so
 * this is the 29th — and it lands on an actual post ("This is the dashboard I
 * wanted from day one ✨", 842), which is worth saying out loud in the UI.
 */
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

export const MEDIAN = median(POSTS.map((p) => p.impr))
export const MEAN = Math.round(
  POSTS.reduce((sum, p) => sum + p.impr, 0) / POSTS.length
)

/** Every post as a multiple of the median. The only comparison the vision doc allows. */
export function multiple(post: Post) {
  return post.impr / MEDIAN
}

/** Beat the median by 3× or better. 18 of 57 at the time of writing. */
export const OUTLIER_GATE = 3
export function isOutlier(post: Post) {
  return multiple(post) >= OUTLIER_GATE
}

/**
 * The first line, which is the only part of a post the algorithm gets to judge
 * before someone decides to keep reading. Long single-line posts still have to
 * truncate somewhere, so they get a character cap and a real ellipsis.
 */
export function hook(post: Post, cap = 90) {
  const first = post.body.split("\n")[0].trim()
  return first.length > cap ? `${first.slice(0, cap).trimEnd()}…` : first
}

export function formatMultiple(m: number) {
  if (m >= 10) return `${Math.round(m)}×`
  if (m >= 1) return `${m.toFixed(1)}×`
  return `${m.toFixed(2)}×`
}

export function formatDate(at: string) {
  const [, month, day] = at.split("-")
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`
}

export const BY_DATE = [...POSTS].sort((a, b) => a.at.localeCompare(b.at))
export const BY_REACH = [...POSTS].sort((a, b) => b.impr - a.impr)

/**
 * Hook archetypes, derived from the body rather than declared.
 *
 * This is the honest stand-in for `riff_angle`: today nothing has been published
 * through Quincy (`scheduled_post` is empty), so there is no angle→post edge to
 * read. Grouping the imported history by the shape of its opening line answers
 * the same question with data that exists, and the Ledger variant says so on the
 * page rather than pretending the join is live.
 */
export type Angle = {
  id: string
  label: string
  note: string
  test: (p: Post) => boolean
}

export const ANGLES: Angle[] = [
  {
    id: "build-reveal",
    label: "Build reveal",
    note: "“I built X” with the shock emoji and a numbered teardown",
    test: (p) =>
      /^(i (built|just built)|you can build|this made me|somebody is going to)/i.test(
        p.body
      ),
  },
  {
    id: "story",
    label: "Story with a name in it",
    note: "A named person or company carries the anecdote",
    test: (p) =>
      /^(story time|i just sold|i launched \d+|i sold)/i.test(p.body),
  },
  {
    id: "ask",
    label: "Open question",
    note: "Asks the timeline for names, tools or advice",
    test: (p) =>
      /\?/.test(p.body.split("\n")[0]) ||
      /^(looking for|who is|does anybody|anybody else)/i.test(p.body),
  },
  {
    id: "link-reply",
    label: "Link in a reply",
    note: "The repo/demo/test link hung under a thread",
    test: (p) =>
      /^(repo|demo|test it here|to get updates|if you want updates)/i.test(
        p.body
      ),
  },
  {
    id: "opinion",
    label: "Opinion or principle",
    note: "A position stated flat, no artefact attached",
    test: (p) =>
      /^(my two cents|the cofounder|been thinking|my prediction|sadly true|if you started|prediction:)/i.test(
        p.body
      ),
  },
]

export function angleOf(post: Post): Angle | null {
  return ANGLES.find((a) => a.test(post)) ?? null
}

export type AngleRollup = {
  angle: Angle | { id: string; label: string; note: string }
  posts: Post[]
  medianMultiple: number
  best: Post
}

export function rollupByAngle(): AngleRollup[] {
  const buckets = new Map<string, Post[]>()
  const loose: Post[] = []

  for (const post of POSTS) {
    const angle = angleOf(post)
    if (!angle) {
      loose.push(post)
      continue
    }
    const existing = buckets.get(angle.id)
    if (existing) existing.push(post)
    else buckets.set(angle.id, [post])
  }

  const rows: AngleRollup[] = []
  for (const angle of ANGLES) {
    const posts = buckets.get(angle.id)
    if (!posts || posts.length === 0) continue
    rows.push({
      angle,
      posts: [...posts].sort((a, b) => b.impr - a.impr),
      medianMultiple: median(posts.map((p) => p.impr)) / MEDIAN,
      best: posts.reduce((a, b) => (a.impr >= b.impr ? a : b)),
    })
  }

  if (loose.length > 0) {
    rows.push({
      angle: {
        id: "unfiled",
        label: "Unfiled",
        note: "No angle matched. Quincy did not draft these, so nothing claims them",
      },
      posts: [...loose].sort((a, b) => b.impr - a.impr),
      medianMultiple: median(loose.map((p) => p.impr)) / MEDIAN,
      best: loose.reduce((a, b) => (a.impr >= b.impr ? a : b)),
    })
  }

  return rows.sort((a, b) => b.medianMultiple - a.medianMultiple)
}
