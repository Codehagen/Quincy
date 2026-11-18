/**
 * Connectors: Sources and Channels as one page (decided on the connectors
 * lab, 2026-11-17: the Table, grouped by what each one needs from you).
 *
 * The pure half: the shape the page reads, the catalogue's words, and every
 * rule that decides a group, an order, the one ink action and a sentence.
 * No React and no server imports, so lib/connectors-load.ts builds it, the
 * client draws it, and lib/connectors.test.ts pins it.
 */

import type { KeySource } from "./meeting-sources"

export type ConnectorKind = "source" | "channel"

/** Every connector the page lists. The live ones first, then the register. */
export type ConnectorId = string

/**
 * What a connector says about its connection. One at a time.
 *
 * - `connected`: reading, or able to publish. `last` is the newest fact.
 * - `waiting`: connected, nothing has come through yet.
 * - `setup`: half done (Circleback's secret, GitHub's username on an org).
 * - `asks`: connected, and Quincy is waiting on one answer from you.
 * - `failed`: it stopped (a source marked broken, a read that failed).
 * - `reauth`: a channel in `needs_reauth`, or bookmarks missing their scope.
 * - `paused`: paused upstream (GitHub suspended the installation).
 * - `available`: can be connected on this deployment.
 * - `needs`: can be connected once X is.
 * - `off`: this deployment holds no credentials for it.
 * - `builtin`: part of Quincy; nothing to connect.
 * - `soon`: listed so the roadmap shows; nothing can connect it yet.
 */
export type ConnectorStatus =
  | { s: "connected"; last: string }
  | { s: "waiting"; since: string }
  | { s: "setup"; step: string }
  | { s: "asks"; why: string }
  | { s: "failed"; why: string; fix: string }
  | { s: "reauth"; why: string; fix: string }
  | { s: "paused"; last: string }
  | { s: "available" }
  | { s: "needs"; on: "x"; onName: string }
  | { s: "off"; why: string }
  | { s: "builtin" }
  | { s: "soon" }

export type ConnectorState = ConnectorStatus["s"]

/**
 * One operational fact, against the person's own usual. Never a follower
 * count. The loader leaves it out when the history is too thin to hold a
 * usual (`MIN_WEEKS`), so a number never stands on its own.
 */
export type ConnectorMetric = {
  /** "Ideas from 291 merges". */
  label: string
  /** "30 days". */
  window: string
  value: number
  usual: number
}

/** What the verbs of one connector need, read on the server. Never a token. */
export type ConnectorDetail =
  | {
      id: "github"
      installUrl: string | null
      account: string
      login: string
      isOrganisation: boolean
      /** `?github=…` from the install callback. */
      outcome?: string
      question: { sourceItemId: string; text: string; about: string; url: string } | null
    }
  | { id: "circleback"; url: string | null; verified: boolean }
  /** Fathom and Granola: one API key, and Quincy registers the webhook. */
  | { id: "key-source"; source: KeySource; connected: boolean; account: string }
  | { id: "x-posts"; items: number; handle: string | null }
  | { id: "x-bookmarks"; enabled: boolean; cadence: string; scopeOk: boolean }
  | {
      id: "channel"
      platform: string
      handle: string | null
      displayName: string | null
      /** Milliseconds since the epoch. */
      expiresAt: number | null
      refreshable: boolean
      /** Has a strategy page (topics and times). */
      strategy: boolean
    }
  | { id: "none" }

export type Connector = {
  id: ConnectorId
  /** A platform mark id, or a material key (voice, bookmarks). */
  glyph: string
  name: string
  kind: ConnectorKind
  /** The muted line: what it does, in two or three words. */
  line: string
  /** What it hands over, or what I do with it. Wraps. */
  gives: string
  /** What it hands over, as chips, on a card not connected yet. */
  tags: readonly string[]
  /** What connecting takes, in full, after "What it takes: " in the pane (so lower case). */
  setup: string
  /** The same in two or three words, for one-line places. Never truncates. */
  short: string
  status: ConnectorStatus
  metric?: ConnectorMetric
  detail: ConnectorDetail
}

/* ── The catalogue: the words, per connector ──────────────────────── */

export type CatalogueEntry = Pick<
  Connector,
  "id" | "glyph" | "name" | "kind" | "line" | "gives" | "tags" | "setup" | "short"
>

/** Source ids whose mark is keyed under a brand name in platform-mark. */
const GLYPH_FOR: Record<string, string> = { calendar: "googlecalendar" }

/** The live connectors, in the order the page reads them. */
export const LIVE: readonly CatalogueEntry[] = [
  {
    id: "github",
    glyph: "github",
    name: "GitHub",
    kind: "source",
    line: "Reads merges",
    gives:
      "Each pull request as it merges. I read the description you wrote, never the diff, and keep the merges that carry an idea.",
    tags: ["Pull requests", "Descriptions"],
    setup: "one link, and it posts nothing",
    short: "One link",
  },
  {
    id: "circleback",
    glyph: "circleback",
    name: "Circleback",
    kind: "source",
    line: "Reads calls",
    gives:
      "Each call as it ends. I read your half of the transcript, keep the passage worth posting, and store nothing anyone else said.",
    tags: ["Your half", "Transcripts"],
    setup: "two steps, a URL out and a secret back",
    short: "Two steps",
  },
  {
    id: "fathom",
    glyph: "fathom",
    name: "Fathom",
    kind: "source",
    line: "Reads calls",
    gives:
      "Each call you record as it ends. I read your half of the transcript, keep the passage worth posting, and store nothing anyone else said.",
    tags: ["Your half", "Transcripts"],
    setup: "your API key, pasted once",
    short: "One key",
  },
  {
    id: "granola",
    glyph: "granola",
    name: "Granola",
    kind: "source",
    line: "Reads calls",
    gives:
      "Each note as Granola finishes it. I read what you said in the transcript, keep the passage worth posting, and store nothing anyone else said.",
    tags: ["Your half", "Transcripts"],
    setup: "your API key, pasted once, on a Business or Enterprise plan",
    short: "One key",
  },
  {
    id: "x-posts",
    glyph: "x",
    name: "Your X posts",
    kind: "source",
    line: "Reads your writing",
    gives: "Your own posts, read back so I learn how you write. Up to 100 a read.",
    tags: ["Your posts", "Voice rules"],
    setup: "it comes with X, one read at a time",
    short: "Comes with X",
  },
  {
    id: "x-bookmarks",
    glyph: "bookmarks",
    name: "X bookmarks",
    kind: "source",
    line: "Reads saved posts daily",
    gives:
      "Posts you saved on X. I pick the few you have something of your own to say about. Their numbers and stories stay theirs.",
    tags: ["Bookmarks", "Daily"],
    setup: "it comes with X, read once a day",
    short: "Comes with X",
  },
  {
    id: "voice",
    glyph: "voice",
    name: "Voice notes",
    kind: "source",
    line: "Reads what you say",
    gives: "Say it out loud on Ideas. I transcribe it and bring you the angles in it.",
    tags: ["Transcripts"],
    setup: "nothing to connect",
    short: "Nothing to connect",
  },
  {
    id: "x",
    glyph: "x",
    name: "X",
    kind: "channel",
    line: "Posts as you",
    gives: "I publish what you approve, and read back the posts I published to tell you how they did.",
    tags: ["Posts", "Threads"],
    setup: "one click, and nothing goes out unapproved",
    short: "One click",
  },
  {
    id: "linkedin",
    glyph: "linkedin",
    name: "LinkedIn",
    kind: "channel",
    line: "Posts as you",
    gives: "I publish what you approve. I can't read your feed, your posts or how they did.",
    tags: ["Posts"],
    setup: "one click, renewed every 60 days",
    short: "One click · 60 days",
  },
  {
    id: "instagram",
    glyph: "instagram",
    name: "Instagram",
    kind: "channel",
    line: "Posts as you",
    gives:
      "I publish what you approve, as a picture of the words plus the caption, and read back how each one did against your own median.",
    tags: ["Posts", "Captions"],
    setup: "one click, on a professional account",
    short: "One click",
  },
]

/** The channels Quincy can name but not connect yet, in the order plan 005 takes them on. */
export const LATER_CHANNELS: readonly CatalogueEntry[] = [
  later("threads", "Threads", "channel", "Short posts and replies", ["Posts"]),
  later("bluesky", "Bluesky", "channel", "Short posts on an open network", ["Posts"]),
  later("youtube", "YouTube", "channel", "Videos and their descriptions", ["Videos"]),
  later("mastodon", "Mastodon", "channel", "Posts on your own instance", ["Posts"]),
  later("substack", "Substack", "channel", "Long posts and notes", ["Posts", "Notes"]),
  later("kit", "Kit", "channel", "Your newsletter", ["Issues"]),
]

/** A register entry: a source or channel listed, with nothing behind it yet. */
export function later(
  id: string,
  name: string,
  kind: ConnectorKind,
  gives: string,
  tags: readonly string[] = []
): CatalogueEntry {
  return {
    id,
    glyph: GLYPH_FOR[id] ?? id,
    name,
    kind,
    line: kind === "source" ? "Would read" : "Would post",
    gives,
    tags,
    setup: "it isn't wired up yet",
    short: "Not wired up yet",
  }
}

/* ── Rules ────────────────────────────────────────────────────────── */

export type ConnectorFilter = "all" | "connected" | "source" | "channel"

export const FILTERS: readonly { value: ConnectorFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "connected", label: "Connected" },
  { value: "source", label: "Sources" },
  { value: "channel", label: "Channels" },
]

/** `?show=sources|channels|connected` → the tab. Anything else is All. */
export function filterFromParam(value: string | null | undefined): ConnectorFilter {
  if (value === "sources" || value === "source") return "source"
  if (value === "channels" || value === "channel") return "channel"
  if (value === "connected") return "connected"
  return "all"
}

/** A connection exists, whatever shape it is in. */
export function isConnected(c: Pick<Connector, "status">): boolean {
  switch (c.status.s) {
    case "connected":
    case "waiting":
    case "paused":
    case "setup":
    case "asks":
    case "failed":
    case "reauth":
      return true
    default:
      return false
  }
}

/** Its next step is waiting on you: it stopped, needs reconnecting, is half set up, or asks. */
export function needsYou(c: Pick<Connector, "status">): boolean {
  const s = c.status.s
  return s === "failed" || s === "reauth" || s === "setup" || s === "asks"
}

/** Reading (or publishing) as it should: the switch and the number belong here. */
export function isReading(c: Pick<Connector, "status">): boolean {
  const s = c.status.s
  return s === "connected" || s === "waiting" || s === "paused"
}

export function isLater(c: Pick<Connector, "status">): boolean {
  return c.status.s === "soon" || c.status.s === "off"
}

export function isReady(c: Pick<Connector, "status">): boolean {
  return c.status.s === "available" || c.status.s === "needs"
}

export function matches(c: Connector, filter: ConnectorFilter, q: string): boolean {
  const f = filter === "all" ? true : filter === "connected" ? isConnected(c) : c.kind === filter
  if (!f) return false
  const t = q.trim().toLowerCase()
  if (!t) return true
  return `${c.name} ${c.line} ${c.gives} ${c.tags.join(" ")}`.toLowerCase().includes(t)
}

/**
 * Order: what needs you, then connected, then ready (channels first: on a
 * first run X is the one to start with), then built in, then later.
 */
export function rank(c: Pick<Connector, "status" | "kind">): number {
  if (needsYou(c)) return 0
  if (isConnected(c)) return 1
  if (c.status.s === "available" && c.kind === "channel") return 2
  if (isReady(c)) return 3
  if (c.status.s === "builtin") return 4
  return 5
}

/** Stable sort by rank, keeping the catalogue's order inside a rank. */
export function ordered(list: readonly Connector[]): Connector[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c)
}

export type GroupKey = "you" | "in" | "built" | "ready" | "later"

export const GROUPS: readonly {
  key: GroupKey
  label: string
  /** The group said once as a sentence, for assistive tech. */
  name: (n: number) => string
  test: (c: Connector) => boolean
}[] = [
  { key: "you", label: "Needs you", name: (n) => `${n} ${n === 1 ? "needs" : "need"} you`, test: needsYou },
  { key: "in", label: "Connected", name: (n) => `${n} connected`, test: (c) => isConnected(c) && !needsYou(c) },
  { key: "built", label: "Built in", name: (n) => `${n} built in`, test: (c) => c.status.s === "builtin" },
  { key: "ready", label: "Ready to connect", name: (n) => `${n} ready to connect`, test: isReady },
  { key: "later", label: "Coming later", name: (n) => `${n} coming later`, test: isLater },
]

/** The groups with rows, in order; an empty group is not drawn. Every connector lands in exactly one. */
export function groupConnectors(list: readonly Connector[]) {
  return GROUPS.map((g) => ({ ...g, items: list.filter(g.test) })).filter((g) => g.items.length > 0)
}

export type ConnectorCounts = Record<ConnectorFilter, number> & {
  ready: number
  later: number
}

export function countConnectors(list: readonly Connector[]): ConnectorCounts {
  const n = (f: ConnectorFilter) => list.filter((c) => matches(c, f, "")).length
  return {
    all: n("all"),
    connected: n("connected"),
    source: n("source"),
    channel: n("channel"),
    ready: list.filter(isReady).length,
    later: list.filter(isLater).length,
  }
}

/**
 * Which connector holds the page's one ink pill (actions.md):
 *
 * 1. One that needs you: its fix. Its next step is waiting on you.
 * 2. Nothing connected at all (a first run): X's Connect, the one Quincy
 *    starts with. Posting is the point, and its read-back teaches the voice.
 * 3. Otherwise none. Nothing waits on you, so nothing is ink.
 */
export function actionOwner(list: readonly Connector[]): ConnectorId | null {
  const first = ordered(list.filter(needsYou))[0]
  if (first) return first.id
  if (!list.some(isConnected)) {
    const x = list.find((c) => c.id === "x" && c.status.s === "available")
    return x ? x.id : null
  }
  return null
}

/** The row that opens with nothing picked: the one holding the ink, else the first. */
export function fallbackOpen(shown: readonly Connector[], owner: ConnectorId | null): ConnectorId | null {
  if (owner && shown.some((c) => c.id === owner)) return owner
  return shown[0]?.id ?? null
}

/* ── Copy ─────────────────────────────────────────────────────────── */

/** The state in one or two words, for the State column and the card's chip. */
export function stateWord(c: Pick<Connector, "status">): string {
  const st = c.status
  switch (st.s) {
    case "connected":
      return "Connected"
    case "waiting":
      return "Nothing yet"
    case "paused":
      return "Paused"
    case "failed":
      return "Stopped"
    case "reauth":
      return "Reconnect"
    case "setup":
      return "Half set up"
    case "asks":
      return "Asks you"
    case "available":
      return "Ready"
    case "needs":
      return `Needs ${st.onName}`
    case "off":
      return "Not here"
    case "builtin":
      return "Built in"
    case "soon":
      return "Later"
  }
}

/** The newest fact, short enough for one line (the table's Latest, a card's foot). */
export function latestLine(c: Pick<Connector, "status" | "short">): string {
  const st = c.status
  switch (st.s) {
    case "connected":
    case "paused":
      return st.last
    case "waiting":
      return `Connected ${lower(st.since)}`
    case "failed":
    case "reauth":
      return st.fix
    case "setup":
      return "Finish setup"
    case "asks":
      return "Answer"
    default:
      return c.short
  }
}

/**
 * What is held up while it needs you, for a card's foot beside its fix (the
 * fix is the button, so the words say what waits on it, never the fix twice).
 * Null for a connector that needs nothing.
 */
export function heldLine(c: Pick<Connector, "kind" | "status">): string | null {
  switch (c.status.s) {
    case "failed":
      return c.kind === "channel" ? "Not publishing" : "Not reading"
    case "reauth":
      return c.kind === "channel" ? "Not publishing until you do" : "Not reading until you do"
    case "setup":
      return "One step left"
    case "asks":
      return "Waiting on you"
    default:
      return null
  }
}

/** The state as the sentence a person reads (states.md): first person, the fact, no red. */
export function stateSentence(c: Pick<Connector, "id" | "kind" | "name" | "status">): string {
  const st = c.status
  switch (st.s) {
    case "connected":
      return `${connectedLead(c)} ${st.last}.`
    case "waiting":
      return `Connected ${lower(st.since)}. Nothing has come through yet.`
    case "setup":
      return st.step
    case "asks":
      return st.why
    case "failed":
    case "reauth":
      return st.why
    case "paused":
      return `Paused on ${c.name}'s side. ${st.last}.`
    case "available":
      return c.kind === "channel"
        ? "Not connected. Nothing goes out without your approval."
        : "Not connected. Connecting never posts anything."
    case "needs":
      return `Comes with ${st.onName}. Connect ${st.onName} first.`
    case "off":
      return st.why
    case "builtin":
      return "Part of Quincy. Nothing to connect."
    case "soon":
      return c.kind === "channel"
        ? "I can't publish here yet."
        : "I can't read this yet, and nothing would read it if I could."
  }
}

function connectedLead(c: Pick<Connector, "id" | "kind">): string {
  if (c.kind === "channel") return "I can publish here."
  if (c.id === "x-posts") return "I read these when you ask."
  if (c.id === "x-bookmarks") return "Reading them daily."
  return "Reading."
}

/**
 * The connector's one verb, when its state has one: Connect, Install, a fix.
 * Null when the verbs below say it (a form, a switch) or there is none.
 */
export function primaryLabel(c: Pick<Connector, "id" | "status">): string | null {
  const st = c.status
  switch (st.s) {
    case "available":
      if (c.id === "github") return "Install"
      if (c.id === "x-posts") return "Import posts"
      if (c.id === "x-bookmarks") return "Read them daily"
      return "Connect"
    case "needs":
      return `Connect ${st.onName}`
    case "failed":
    case "reauth":
      return st.fix
    case "setup":
      return "Finish setup"
    case "asks":
      return "Answer"
    default:
      return null
  }
}

/** What disconnecting says, beside the hold. */
export function disconnectSentence(c: Pick<Connector, "kind" | "name">): string {
  return c.kind === "channel"
    ? `I stop publishing to ${c.name}. Drafts for it stay.`
    : `I stop reading ${c.name}. What I already read stays.`
}

/** "27 · usual 22": the number, then its usual, said the way /numbers says one. */
export function usualText(usual: number): string {
  return `usual ${usual < 10 ? Math.round(usual * 10) / 10 : Math.round(usual)}`
}

function lower(s: string): string {
  // "Today" → "today", but never a name ("3 Nov" stays).
  return /^(Today|Yesterday)$/.test(s) ? s.toLowerCase() : s
}
