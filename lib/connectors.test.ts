import { describe, expect, it } from "vitest"

import { metricFor } from "./connector-metric"
import {
  actionOwner,
  countConnectors,
  fallbackOpen,
  heldLine,
  filterFromParam,
  groupConnectors,
  isConnected,
  later,
  latestLine,
  LIVE,
  matches,
  needsYou,
  ordered,
  primaryLabel,
  stateSentence,
  stateWord,
  usualText,
  type Connector,
  type ConnectorStatus,
} from "./connectors"

const entry = (id: string) => LIVE.find((e) => e.id === id)!

function make(id: string, status: ConnectorStatus): Connector {
  const e = LIVE.find((x) => x.id === id) ?? later(id, id, "source", "")
  return { ...e, status, detail: { id: "none" } }
}

/** A first run: nothing connected, the register listed. */
function firstRun(): Connector[] {
  return [
    make("github", { s: "available" }),
    make("circleback", { s: "available" }),
    make("x-posts", { s: "needs", on: "x", onName: "X" }),
    make("x-bookmarks", { s: "needs", on: "x", onName: "X" }),
    make("voice", { s: "builtin" }),
    make("x", { s: "available" }),
    make("linkedin", { s: "available" }),
    { ...later("slack", "Slack", "source", "Threads"), status: { s: "soon" }, detail: { id: "none" } },
    { ...later("threads", "Threads", "channel", "Posts"), status: { s: "soon" }, detail: { id: "none" } },
  ]
}

const EVERY_STATUS: ConnectorStatus[] = [
  { s: "connected", last: "Last merge today" },
  { s: "waiting", since: "Today" },
  { s: "setup", step: "Installed on acme. Say which username is yours." },
  { s: "asks", why: "I couldn't find the story in a merge." },
  { s: "failed", why: "GitHub stopped sending merges.", fix: "Install again" },
  { s: "reauth", why: "LinkedIn access ends every 60 days.", fix: "Reconnect" },
  { s: "paused", last: "Last merge 3 Nov" },
  { s: "available" },
  { s: "needs", on: "x", onName: "X" },
  { s: "off", why: "This deployment has no X credentials." },
  { s: "builtin" },
  { s: "soon" },
]

describe("grouping", () => {
  it("puts every connector in exactly one group, in the page's order", () => {
    const list = EVERY_STATUS.map((s, i) => ({ ...make("github", s), id: `c${i}` }))
    const groups = groupConnectors(list)
    expect(groups.map((g) => g.key)).toEqual(["you", "in", "built", "ready", "later"])
    const placed = groups.flatMap((g) => g.items.map((c) => c.id))
    expect(placed.sort()).toEqual(list.map((c) => c.id).sort())
  })

  it("draws no empty group", () => {
    expect(groupConnectors(firstRun()).map((g) => g.key)).toEqual(["built", "ready", "later"])
  })

  it("files a deployment without credentials under Coming later, not Ready", () => {
    const groups = groupConnectors([make("x", { s: "off", why: "No credentials." })])
    expect(groups.map((g) => g.key)).toEqual(["later"])
  })

  it("names a group as a sentence, singular and plural", () => {
    const one = groupConnectors([make("github", { s: "setup", step: "…" })])[0]!
    expect(one.name(1)).toBe("1 needs you")
    expect(one.name(2)).toBe("2 need you")
  })
})

describe("what needs you", () => {
  it("is a stop, a reconnect, a half setup or a question, and nothing else", () => {
    const needing = EVERY_STATUS.filter((s) => needsYou({ status: s })).map((s) => s.s)
    expect(needing).toEqual(["setup", "asks", "failed", "reauth"])
  })

  it("counts as connected, so the Connected tab still shows it", () => {
    for (const s of EVERY_STATUS.filter((x) => needsYou({ status: x }))) expect(isConnected({ status: s })).toBe(true)
  })

  it("sorts first, then connected, then ready with channels before sources", () => {
    const list = [
      make("github", { s: "available" }),
      make("voice", { s: "builtin" }),
      make("x", { s: "available" }),
      make("circleback", { s: "connected", last: "Last call today" }),
      make("linkedin", { s: "reauth", why: "…", fix: "Reconnect" }),
    ]
    expect(ordered(list).map((c) => c.id)).toEqual(["linkedin", "circleback", "x", "github", "voice"])
  })
})

describe("the one ink action", () => {
  it("goes to the first connector that needs you", () => {
    const list = [make("x", { s: "connected", last: "…" }), make("linkedin", { s: "reauth", why: "…", fix: "Reconnect" })]
    expect(actionOwner(list)).toBe("linkedin")
  })

  it("goes to X's Connect on a first run", () => {
    expect(actionOwner(firstRun())).toBe("x")
  })

  it("goes nowhere when something is connected and nothing waits on you", () => {
    const list = firstRun().map((c) => (c.id === "github" ? { ...c, status: { s: "connected", last: "…" } as const } : c))
    expect(actionOwner(list)).toBeNull()
  })

  it("goes nowhere on a first run where X cannot be connected", () => {
    const list = firstRun().map((c) => (c.id === "x" ? { ...c, status: { s: "off", why: "…" } as const } : c))
    expect(actionOwner(list)).toBeNull()
  })

  it("opens the ink's row first, else the first row", () => {
    const list = ordered(firstRun())
    expect(fallbackOpen(list, "x")).toBe("x")
    expect(fallbackOpen(list, null)).toBe(list[0]!.id)
    expect(fallbackOpen([], null)).toBeNull()
  })
})

describe("the copy for each state", () => {
  it("has a word, a sentence and a latest line for every state, never empty", () => {
    for (const status of EVERY_STATUS) {
      const c = make("github", status)
      expect(stateWord(c).length).toBeGreaterThan(0)
      expect(stateSentence(c).length).toBeGreaterThan(0)
      expect(latestLine(c).length).toBeGreaterThan(0)
    }
  })

  it("says connected in words, without a dot or a colour", () => {
    expect(stateWord({ status: { s: "connected", last: "…" } })).toBe("Connected")
  })

  it("says what needs you as the fix", () => {
    expect(stateWord({ status: { s: "failed", why: "…", fix: "Install again" } })).toBe("Stopped")
    expect(stateWord({ status: { s: "reauth", why: "…", fix: "Reconnect" } })).toBe("Reconnect")
    expect(stateWord({ status: { s: "setup", step: "…" } })).toBe("Half set up")
    expect(latestLine({ ...entry("github"), status: { s: "failed", why: "…", fix: "Install again" } })).toBe("Install again")
  })

  it("keeps one-line places short: a `short`, never the full setup", () => {
    for (const e of LIVE) {
      expect(e.short.length).toBeLessThanOrEqual(20)
      expect(latestLine({ ...e, status: { s: "available" } })).toBe(e.short)
    }
  })

  it("says what waits on a fix without repeating the fix", () => {
    for (const status of EVERY_STATUS) {
      const c = make("github", status)
      const held = heldLine(c)
      expect(held === null).toBe(!needsYou(c))
      if (held) expect(held).not.toBe(primaryLabel(c))
    }
    expect(heldLine(make("linkedin", { s: "reauth", why: "…", fix: "Reconnect" }))).toBe("Not publishing until you do")
  })

  it("leads a connected sentence with what the connector does", () => {
    const at = (id: string) => stateSentence(make(id, { s: "connected", last: "Last read today" }))
    expect(at("x")).toBe("I can publish here. Last read today.")
    expect(at("github")).toBe("Reading. Last read today.")
    expect(at("x-bookmarks")).toBe("Reading them daily. Last read today.")
  })

  it("lowers today mid-sentence and leaves a date alone", () => {
    expect(stateSentence(make("github", { s: "waiting", since: "Today" }))).toBe(
      "Connected today. Nothing has come through yet."
    )
    expect(latestLine({ short: "", status: { s: "waiting", since: "3 Nov" } })).toBe("Connected 3 Nov")
  })

  it("names the verb by connector and state", () => {
    expect(primaryLabel(make("github", { s: "available" }))).toBe("Install")
    expect(primaryLabel(make("x", { s: "available" }))).toBe("Connect")
    expect(primaryLabel(make("x-posts", { s: "available" }))).toBe("Import posts")
    expect(primaryLabel(make("x-bookmarks", { s: "available" }))).toBe("Read them daily")
    expect(primaryLabel(make("x-posts", { s: "needs", on: "x", onName: "X" }))).toBe("Connect X")
    expect(primaryLabel(make("github", { s: "connected", last: "…" }))).toBeNull()
    expect(primaryLabel(make("slack", { s: "soon" }))).toBeNull()
  })

  it("says a usual the way /numbers does", () => {
    expect(usualText(22.4)).toBe("usual 22")
    expect(usualText(4.26)).toBe("usual 4.3")
  })
})

describe("filters", () => {
  it("reads the old pages' tabs from ?show=", () => {
    expect(filterFromParam("sources")).toBe("source")
    expect(filterFromParam("channels")).toBe("channel")
    expect(filterFromParam("connected")).toBe("connected")
    expect(filterFromParam(undefined)).toBe("all")
    expect(filterFromParam("nonsense")).toBe("all")
  })

  it("counts every connector once per tab, and the tally adds up", () => {
    const counts = countConnectors(firstRun())
    expect(counts).toMatchObject({ all: 9, connected: 0, source: 6, channel: 3, ready: 6, later: 2 })
    expect(counts.connected + counts.ready + counts.later + 1).toBe(counts.all) // + Voice, built in
  })

  it("searches the name, the line, what it gives and its tags", () => {
    const github = make("github", { s: "available" })
    expect(matches(github, "all", "merge")).toBe(true)
    expect(matches(github, "all", "descriptions")).toBe(true)
    expect(matches(github, "channel", "")).toBe(false)
    expect(matches(github, "all", "zzz")).toBe(false)
  })
})

describe("the metric", () => {
  const now = new Date("2026-11-17T12:00:00Z")
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

  it("is left out until the history holds enough weeks for a usual", () => {
    expect(metricFor("Ideas", [daysAgo(1), daysAgo(2)], daysAgo(20), now)).toBeUndefined()
    expect(metricFor("Ideas", [daysAgo(1)], null, now)).toBeUndefined()
  })

  it("states the window's count against the usual for a window that long", () => {
    // Two a week, every week, for twenty weeks: the usual for 30 days is 2 × 30/7.
    const times = Array.from({ length: 20 }, (_, w) => [daysAgo(w * 7 + 1), daysAgo(w * 7 + 3)]).flat()
    const m = metricFor("Ideas", times, daysAgo(140), now)!
    expect(m.window).toBe("30 days")
    expect(m.value).toBe(9)
    expect(m.usual).toBeCloseTo((2 * 30) / 7)
  })

  it("is left out when there is nothing on either side", () => {
    expect(metricFor("Ideas", [], daysAgo(140), now)).toBeUndefined()
  })
})
