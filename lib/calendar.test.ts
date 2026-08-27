import { describe, expect, it, vi } from "vitest"

import {
  CALENDAR_COOLDOWN_MS,
  CALENDAR_PAGE_SIZE,
  CALENDAR_READ_LABEL,
  CALENDAR_SCOPE,
  CALENDAR_WINDOW_MS,
  calendarWindow,
  collectCalendarPage,
  hasEnded,
  matchStoryTheme,
  MIN_THEME_WORDS,
  parseCalendarEvent,
  questionFor,
  readCalendars,
  storedEventFrom,
  themeWords,
  type CalendarDeps,
  type CalendarEvent,
  type StoryPage,
} from "./calendar"

/**
 * The whole read is driven here rather than only its pure parts.
 *
 * Three things can go wrong in this file and every one of them is invisible in
 * review: a window that reads the wrong hour, a cooldown that does not cool,
 * and an attendee's address ending up in a row. lib/corpus-x.ts leaves its
 * DB-touching paths to `scripts/verify-*.ts`; that split cannot work here,
 * because there is exactly one production database (AGENTS.md) and no way to
 * verify a calendar read live without reading somebody's real calendar. So the
 * store is injected and the assertions are about what was *asked for*.
 *
 * `listDueCalendars`, `claimCalendar` and the SQL upsert stay unexercised on
 * purpose — the report says so. What is pinned here is every decision made
 * before a query is built, plus the cooldown arithmetic itself through a stub
 * that runs the same rule the conditional UPDATE runs.
 */

const NOW = new Date("2026-08-27T15:00:00.000Z")

function googleEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    status: "confirmed",
    summary: "Pricing call with Acme",
    description: "Walk them through the new tiers.",
    start: { dateTime: "2026-08-27T14:00:00.000Z" },
    end: { dateTime: "2026-08-27T14:45:00.000Z" },
    attendees: [
      { email: "christer@example.com", displayName: "Christer", self: true },
      { email: "buyer@acme.example", displayName: "A Buyer" },
    ],
    organizer: { email: "christer@example.com", self: true },
    ...overrides,
  }
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    eventId: "evt_1",
    title: "Pricing call with Acme",
    description: "",
    startAt: new Date("2026-08-27T14:00:00.000Z"),
    endAt: new Date("2026-08-27T14:45:00.000Z"),
    attendees: 2,
    organised: true,
    ...overrides,
  }
}

const PRICING_STORY: StoryPage = {
  title: "The day we tripled the price",
  data: { theme: "pricing", useFor: ["objections"], point: "Nobody left." },
}

/**
 * The same rule the conditional UPDATE in `claimCalendar` runs, expressed in
 * TypeScript so the stub is not a canned boolean agreeing with itself.
 */
function cooledDown(lastReadAt: Date | null, now: Date): boolean {
  if (!lastReadAt) return true
  return now.getTime() - lastReadAt.getTime() >= CALENDAR_COOLDOWN_MS
}

function harness({
  connections = [{ id: "sc_1", userId: "u_1", timezone: "Europe/Oslo" }],
  items = [googleEvent()] as unknown[],
  nextPageToken,
  lastReadAt = new Map<string, Date | null>(),
  stories = [PRICING_STORY],
  refreshToken = "refresh" as string | null,
  refresh,
  status = 200,
  openQuestion = false,
}: {
  connections?: { id: string; userId: string; timezone: string | null }[]
  items?: unknown[]
  nextPageToken?: string
  lastReadAt?: Map<string, Date | null>
  stories?: StoryPage[]
  refreshToken?: string | null
  refresh?: CalendarDeps["refresh"]
  status?: number
  /** Simulates a question already open, which is the ceiling under test. */
  openQuestion?: boolean
} = {}) {
  const urls: string[] = []
  const stored: { userId: string; events: CalendarEvent[] }[] = []
  const asked: { userId: string; sourceItemId: string; text: string }[] = []
  const metered: { userId: string; eventsRead: number }[] = []
  const broken: { id: string; message: string }[] = []
  const arrived: string[] = []
  let anyOpen = openQuestion

  const deps: CalendarDeps = {
    fetch: (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response(
        JSON.stringify({ items, ...(nextPageToken ? { nextPageToken } : {}) }),
        { status }
      )
    }) as typeof fetch,
    listDue: async (limit) => connections.slice(0, limit + 1),
    claim: async (id, now) => {
      if (!cooledDown(lastReadAt.get(id) ?? null, now)) return false
      lastReadAt.set(id, now)
      return true
    },
    refreshToken: async () => refreshToken,
    refresh:
      refresh ??
      (async () => ({
        accessToken: "access",
        refreshToken: null,
        expiresAt: null,
      })),
    stories: async () => stories,
    store: async (userId, events) => {
      stored.push({ userId, events })
      return events.map((event, index) => ({
        sourceItemId: `si_${index}`,
        event,
      }))
    },
    ask: async (input) => {
      if (anyOpen) return false
      anyOpen = true
      asked.push(input)
      return true
    },
    arrived: async (id) => {
      arrived.push(id)
    },
    broken: async (id, message) => {
      broken.push({ id, message })
    },
    meter: async (userId, eventsRead) => {
      metered.push({ userId, eventsRead })
    },
  }

  return { deps, urls, stored, asked, metered, broken, arrived }
}

describe("the scope", () => {
  /**
   * Pinned as a literal, because a typo here is not a compile error and not a
   * test failure anywhere else — it is a consent screen that asks for nothing
   * and a read that answers 403 the first time the cron runs, in production,
   * with nobody watching.
   */
  it("is the read-only events scope, exactly", () => {
    expect(CALENDAR_SCOPE).toBe(
      "https://www.googleapis.com/auth/calendar.events.readonly"
    )
  })

  it("is not the writable one, and not the whole calendar", () => {
    expect(CALENDAR_SCOPE).not.toBe(
      "https://www.googleapis.com/auth/calendar.events"
    )
    expect(CALENDAR_SCOPE).not.toContain("calendar.readonly")
  })
})

describe("calendarWindow", () => {
  it("asks for the hour that just ended", () => {
    const window = calendarWindow(NOW)

    expect(window.timeMax).toEqual(NOW)
    expect(window.timeMin).toEqual(new Date("2026-08-27T14:00:00.000Z"))
    expect(window.timeMax.getTime() - window.timeMin.getTime()).toBe(
      CALENDAR_WINDOW_MS
    )
  })

  /**
   * The window is a property of the schedule, not of the person. Two users in
   * different zones must have the same hour read for one cron tick — otherwise
   * a tick would cover an hour for one of them and part of two for the other.
   * The user's zone appears exactly once, in `questionFor`.
   */
  it("is absolute, whatever zone anybody is in", () => {
    expect(calendarWindow(NOW).timeMin.toISOString()).toBe(
      "2026-08-27T14:00:00.000Z"
    )
  })
})

describe("questionFor", () => {
  it("reads the clock back in the user's zone, not the server's", () => {
    expect(
      questionFor({
        title: "Pricing call with Acme",
        startAt: new Date("2026-08-27T12:00:00.000Z"),
        theme: "pricing",
        timezone: "Europe/Oslo",
      })
    ).toBe(
      "You had “Pricing call with Acme” at 14:00 and you keep a story about pricing. What happened?"
    )
  })

  it("falls back to UTC rather than to the server, on an unknown zone", () => {
    expect(
      questionFor({
        title: "Retro",
        startAt: new Date("2026-08-27T12:00:00.000Z"),
        theme: "shipping",
        timezone: "Mars/Olympus",
      })
    ).toContain("at 12:00")
  })
})

describe("parseCalendarEvent", () => {
  it("keeps the six facts and nothing else", () => {
    const parsed = parseCalendarEvent(googleEvent())

    expect(parsed).toEqual({
      eventId: "evt_1",
      title: "Pricing call with Acme",
      description: "Walk them through the new tiers.",
      startAt: new Date("2026-08-27T14:00:00.000Z"),
      endAt: new Date("2026-08-27T14:45:00.000Z"),
      attendees: 2,
      organised: true,
    })
  })

  it("counts attendees and never reads one", () => {
    const parsed = parseCalendarEvent(googleEvent())!
    expect(parsed.attendees).toBe(2)
    expect(JSON.stringify(parsed)).not.toContain("acme.example")
    expect(JSON.stringify(parsed)).not.toContain("A Buyer")
  })

  it("refuses a cancelled meeting", () => {
    expect(parseCalendarEvent(googleEvent({ status: "cancelled" }))).toBeNull()
  })

  it("refuses an all-day entry, which did not end at a moment", () => {
    expect(
      parseCalendarEvent(
        googleEvent({
          start: { date: "2026-08-27" },
          end: { date: "2026-08-28" },
        })
      )
    ).toBeNull()
  })

  it("refuses the kinds Google says are not meetings", () => {
    for (const eventType of [
      "birthday",
      "focusTime",
      "outOfOffice",
      "workingLocation",
    ]) {
      expect(parseCalendarEvent(googleEvent({ eventType }))).toBeNull()
    }

    expect(parseCalendarEvent(googleEvent({ eventType: "default" }))).not.toBeNull()
  })

  it("refuses an untitled meeting, because the question is built from a title", () => {
    expect(parseCalendarEvent(googleEvent({ summary: "  " }))).toBeNull()
  })

  it("does not claim the owner organised a meeting somebody else called", () => {
    const parsed = parseCalendarEvent(
      googleEvent({ organizer: { email: "buyer@acme.example" } })
    )!
    expect(parsed.organised).toBe(false)
  })

  it("survives a payload that is not an event at all", () => {
    expect(parseCalendarEvent(null)).toBeNull()
    expect(parseCalendarEvent("evt_1")).toBeNull()
    expect(parseCalendarEvent({})).toBeNull()
    expect(parseCalendarEvent(googleEvent({ attendees: "many" }))!.attendees).toBe(0)
  })
})

describe("storedEventFrom", () => {
  /**
   * The privacy claim on the row, asserted rather than promised. The row is
   * built by naming what may be kept, so a field added to `CalendarEvent`
   * later is absent here by default — this pins that the description, which is
   * the one sensitive thing the parser does hold, never makes the crossing.
   */
  it("keeps five fields and drops the description", () => {
    expect(
      storedEventFrom(event({ description: "Their budget is 40k." }))
    ).toEqual({
      eventId: "evt_1",
      startAt: "2026-08-27T14:00:00.000Z",
      endAt: "2026-08-27T14:45:00.000Z",
      attendees: 2,
      organised: true,
    })
  })

  it("cannot carry an address, because it never holds one", () => {
    const stored = storedEventFrom(
      event({ description: "buyer@acme.example wants a discount" })
    )
    expect(JSON.stringify(stored)).not.toContain("acme.example")
  })
})

describe("hasEnded", () => {
  it("keeps a meeting that finished inside the window", () => {
    expect(hasEnded(event(), NOW)).toBe(true)
  })

  it("drops one that is still running", () => {
    expect(
      hasEnded(event({ endAt: new Date("2026-08-27T15:30:00.000Z") }), NOW)
    ).toBe(false)
  })

  it("counts a meeting that ends exactly now as ended", () => {
    expect(hasEnded(event({ endAt: NOW }), NOW)).toBe(true)
  })
})

describe("themeWords", () => {
  it("folds case, drops short words and drops the calendar's own vocabulary", () => {
    expect([...themeWords("Weekly sync about Pricing")].sort()).toEqual([
      "pricing",
    ])
  })

  it("does not cut a non-English word in half", () => {
    expect(themeWords("Årsmøte i Bergen").has("årsmøte")).toBe(true)
  })
})

describe("matchStoryTheme", () => {
  /**
   * The case the feature was specified with, and the one a bare word count
   * gets wrong: "Pricing call with Acme" shares no word with "The day we
   * tripled the price". The curated vocabulary in lib/story-gaps.ts is what
   * makes those the same subject.
   */
  it("matches through the vocabulary when the words themselves differ", () => {
    expect(
      matchStoryTheme("Pricing call with Acme", [
        { title: "The day we tripled the price", data: { theme: "pricing" } },
      ])
    ).toEqual({ theme: "pricing", via: "vocabulary", overlap: MIN_THEME_WORDS })
  })

  it("will not match a vocabulary theme the story bank does not cover", () => {
    expect(
      matchStoryTheme("Pricing call with Acme", [
        { title: "Our first hire", data: { theme: "hiring" } },
      ])
    ).toBeNull()
  })

  it("matches a theme the vocabulary has never heard of, at two words", () => {
    expect(
      matchStoryTheme("Warehouse robotics demo in Bergen", [
        { title: "Warehouse robotics", data: { theme: "robotics" } },
      ])
    ).toEqual({ theme: "robotics", via: "overlap", overlap: 2 })
  })

  /** One shared word is a coincidence — see `MIN_THEME_WORDS`. */
  it("refuses a single shared word", () => {
    expect(
      matchStoryTheme("Warehouse tour", [
        { title: "Warehouse robotics", data: { theme: "robotics" } },
      ])
    ).toBeNull()
  })

  it("refuses a meeting that only shares the meeting-room vocabulary", () => {
    expect(
      matchStoryTheme("Weekly review call", [
        { title: "Weekly review", data: { theme: "reviews" } },
      ])
    ).toBeNull()
  })

  it("has nothing to match against when the story bank is empty", () => {
    expect(matchStoryTheme("Pricing call with Acme", [])).toBeNull()
  })

  it("prefers the story that shares the most", () => {
    const match = matchStoryTheme("Warehouse robotics safety audit", [
      { title: "Warehouse tour", data: { theme: "warehouse robotics" } },
      {
        title: "Robotics safety",
        data: { theme: "robotics safety", useFor: ["audit"] },
      },
    ])

    expect(match?.theme).toBe("robotics safety")
    expect(match?.overlap).toBe(3)
  })
})

describe("collectCalendarPage", () => {
  it("asks Google for one page, ordered, expanded, and capped", async () => {
    const { deps, urls } = harness()

    await collectCalendarPage({
      fetchImpl: deps.fetch,
      accessToken: "access",
      window: calendarWindow(NOW),
    })

    const url = new URL(urls[0])

    expect(url.pathname).toBe("/calendar/v3/calendars/primary/events")
    expect(url.searchParams.get("timeMin")).toBe("2026-08-27T14:00:00.000Z")
    expect(url.searchParams.get("timeMax")).toBe("2026-08-27T15:00:00.000Z")
    expect(url.searchParams.get("singleEvents")).toBe("true")
    expect(url.searchParams.get("orderBy")).toBe("startTime")
    expect(url.searchParams.get("maxResults")).toBe(String(CALENDAR_PAGE_SIZE))
  })

  /**
   * The ceiling counts the thing being bought. A caller asking for more than
   * the cap gets the cap, so there is no argument that widens the spend.
   */
  it("cannot be asked for more than the cap", async () => {
    const { deps, urls } = harness()

    await collectCalendarPage({
      fetchImpl: deps.fetch,
      accessToken: "access",
      window: calendarWindow(NOW),
      pageSize: 500,
    })

    expect(new URL(urls[0]).searchParams.get("maxResults")).toBe(
      String(CALENDAR_PAGE_SIZE)
    )
  })

  it("reports a second page rather than buying it", async () => {
    const { deps } = harness({ nextPageToken: "more" })

    const page = await collectCalendarPage({
      fetchImpl: deps.fetch,
      accessToken: "access",
      window: calendarWindow(NOW),
    })

    expect(page.more).toBe(true)
    expect(page.events).toHaveLength(1)
  })

  it("reads a refusal about the credential apart from a bad day upstream", async () => {
    for (const [status, reason] of [
      [401, "unauthorised"],
      [403, "unauthorised"],
      [429, "rejected"],
      [500, "rejected"],
    ] as const) {
      const { deps } = harness({ status })

      const page = await collectCalendarPage({
        fetchImpl: deps.fetch,
        accessToken: "access",
        window: calendarWindow(NOW),
      })

      expect(page.failure?.reason).toBe(reason)
    }
  })
})

describe("readCalendars", () => {
  it("stores an ended meeting and asks one question about it", async () => {
    const { deps, stored, asked, arrived } = harness()

    const run = await readCalendars({ deps, now: NOW })

    expect(run.read).toBe(1)
    expect(run.stored).toBe(1)
    expect(run.asked).toBe(1)
    expect(stored[0].events[0].title).toBe("Pricing call with Acme")
    expect(asked[0].text).toBe(
      "You had “Pricing call with Acme” at 16:00 and you keep a story about pricing. What happened?"
    )
    expect(arrived).toEqual(["sc_1"])
  })

  it("stores nothing for a meeting still in progress", async () => {
    const { deps, stored, asked } = harness({
      items: [
        googleEvent({
          start: { dateTime: "2026-08-27T14:30:00.000Z" },
          end: { dateTime: "2026-08-27T15:30:00.000Z" },
        }),
      ],
    })

    const run = await readCalendars({ deps, now: NOW })

    expect(run.read).toBe(1)
    expect(run.stored).toBe(0)
    expect(stored).toHaveLength(0)
    expect(asked).toHaveLength(0)
  })

  /** The ceiling is the product — see `recordCalendarQuestion`. */
  it("asks nothing while a question is already open", async () => {
    const { deps, asked } = harness({ openQuestion: true })

    const run = await readCalendars({ deps, now: NOW })

    expect(run.stored).toBe(1)
    expect(run.asked).toBe(0)
    expect(asked).toHaveLength(0)
  })

  it("asks about at most one of three matching meetings", async () => {
    const { deps, asked } = harness({
      items: [
        googleEvent({ id: "evt_1" }),
        googleEvent({ id: "evt_2", summary: "Pricing review" }),
        googleEvent({ id: "evt_3", summary: "Price objections" }),
      ],
    })

    const run = await readCalendars({ deps, now: NOW })

    expect(run.stored).toBe(3)
    expect(run.asked).toBe(1)
    expect(asked).toHaveLength(1)
  })

  it("stores a meeting that matches nothing, and asks nothing about it", async () => {
    const { deps, asked } = harness({
      items: [googleEvent({ summary: "Dentist", description: "" })],
    })

    const run = await readCalendars({ deps, now: NOW })

    expect(run.stored).toBe(1)
    expect(run.asked).toBe(0)
    expect(asked).toHaveLength(0)
  })

  it("holds a second run inside fifty minutes", async () => {
    const lastReadAt = new Map<string, Date | null>()

    const first = harness({ lastReadAt })
    await readCalendars({ deps: first.deps, now: NOW })

    const soon = harness({ lastReadAt })
    const run = await readCalendars({
      deps: soon.deps,
      now: new Date(NOW.getTime() + 49 * 60 * 1000),
    })

    expect(run.cooldown).toBe(1)
    expect(run.read).toBe(0)
    expect(soon.urls).toHaveLength(0)
  })

  it("lets the next hour through", async () => {
    const lastReadAt = new Map<string, Date | null>()

    const first = harness({ lastReadAt })
    await readCalendars({ deps: first.deps, now: NOW })

    const later = harness({ lastReadAt })
    const run = await readCalendars({
      deps: later.deps,
      now: new Date(NOW.getTime() + CALENDAR_COOLDOWN_MS),
    })

    expect(run.cooldown).toBe(0)
    expect(run.read).toBe(1)
  })

  it("buys exactly one page per user per run", async () => {
    const { deps, urls } = harness({
      connections: [
        { id: "sc_1", userId: "u_1", timezone: null },
        { id: "sc_2", userId: "u_2", timezone: null },
      ],
      nextPageToken: "more",
    })

    const run = await readCalendars({ deps, now: NOW })

    expect(urls).toHaveLength(2)
    expect(run.capped).toBe(true)
  })

  it("meters the read at zero money, counted in events", async () => {
    const { deps, metered } = harness({
      items: [googleEvent({ id: "evt_1" }), googleEvent({ id: "evt_2" })],
    })

    const run = await readCalendars({ deps, now: NOW })

    expect(metered).toEqual([{ userId: "u_1", eventsRead: 2 }])
    expect(run.eventsRead).toBe(2)
    // The label the /credits page groups by. Pinned because it is a string in
    // two files that must agree.
    expect(CALENDAR_READ_LABEL).toBe("calendar:read")
  })

  it("meters a page it could not use, because Google was still asked", async () => {
    const { deps, metered } = harness({
      items: [googleEvent({ status: "cancelled" })],
    })

    await readCalendars({ deps, now: NOW })

    expect(metered).toEqual([{ userId: "u_1", eventsRead: 1 }])
  })

  /**
   * The failure this test exists for is the one that would otherwise take down
   * the whole run to report a fact about one person's Google account.
   */
  it("marks a refused refresh broken rather than throwing", async () => {
    const { deps, broken, urls } = harness({
      refresh: async () => {
        throw new Error("invalid_grant")
      },
    })

    const run = await readCalendars({ deps, now: NOW })

    expect(run.failed).toBe(0)
    expect(run.unavailable).toBe(1)
    expect(broken).toHaveLength(1)
    expect(broken[0].id).toBe("sc_1")
    // Nothing was read: the token was never obtained.
    expect(urls).toHaveLength(0)
  })

  it("keeps reading for everybody behind a broken connection", async () => {
    let calls = 0

    const { deps, broken } = harness({
      connections: [
        { id: "sc_1", userId: "u_1", timezone: null },
        { id: "sc_2", userId: "u_2", timezone: null },
      ],
      refresh: async () => {
        calls += 1
        if (calls === 1) throw new Error("invalid_grant")
        return { accessToken: "access", refreshToken: null, expiresAt: null }
      },
    })

    const run = await readCalendars({ deps, now: NOW })

    expect(broken).toHaveLength(1)
    expect(run.read).toBe(1)
    expect(run.stored).toBe(1)
  })

  it("marks a 401 from the read broken too", async () => {
    const { deps, broken } = harness({ status: 401 })

    const run = await readCalendars({ deps, now: NOW })

    expect(run.unavailable).toBe(1)
    expect(broken).toHaveLength(1)
  })

  it("steps over a connection with no stored token", async () => {
    const { deps, urls, broken } = harness({ refreshToken: null })

    const run = await readCalendars({ deps, now: NOW })

    expect(run.unavailable).toBe(1)
    expect(urls).toHaveLength(0)
    // Not broken: there is nothing to reconnect from, and saying "reconnect"
    // about a row that never held a grant would be a lie with a button on it.
    expect(broken).toHaveLength(0)
  })

  it("reports a batch it could not finish", async () => {
    const { deps } = harness({
      connections: Array.from({ length: 3 }, (_, index) => ({
        id: `sc_${index}`,
        userId: `u_${index}`,
        timezone: null,
      })),
    })

    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const run = await readCalendars({ deps, now: NOW, maxUsers: 2 })
    spy.mockRestore()

    expect(run.truncated).toBe(true)
    expect(run.due).toBe(2)
  })

  it("does not ask an account with no stories anything", async () => {
    const { deps, asked } = harness({ stories: [] })

    const run = await readCalendars({ deps, now: NOW })

    expect(run.stored).toBe(1)
    expect(asked).toHaveLength(0)
  })
})
