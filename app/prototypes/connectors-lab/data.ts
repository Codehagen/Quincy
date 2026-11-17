/**
 * The connectors, as the code has them today (2026-11-16), and the states
 * each one can really be in. Fictional numbers in the shapes the live tables
 * hold; DECISION.md has the read-only aggregates they were shaped from.
 *
 * Every action says whether it is `real` (a server action, route or link
 * that exists, named in `ref`) or `proposed` (nothing behind it yet). The
 * lab marks the proposed ones on screen while "Mark proposed" is on.
 */

export type Kind = "source" | "channel"

/**
 * What the card says about the connection. One per connector at a time.
 *
 * - `connected` — reading or able to publish. `last` is the newest fact.
 * - `waiting` — connected, nothing has come through yet (lib/sources.ts).
 * - `setup` — half done: Circleback's secret, GitHub's username on an org.
 * - `failed` — it stopped: a source marked `broken`, a rhythm run that failed.
 * - `reauth` — a channel in `needs_reauth`, or a source that needs it.
 * - `paused` — paused upstream (GitHub suspended the installation).
 * - `available` — can be connected on this deployment.
 * - `needs` — can be connected once another connector is (X first).
 * - `builtin` — nothing to connect: it is part of Quincy.
 * - `soon` — listed, nothing can connect it, nothing would read it.
 */
export type Status =
  | { s: "connected"; last: string }
  | { s: "waiting"; since: string }
  | { s: "setup"; step: string }
  | { s: "failed"; why: string; fix: string }
  | { s: "reauth"; why: string; fix: string }
  | { s: "paused"; last: string }
  | { s: "available" }
  | { s: "needs"; on: string; onName: string }
  | { s: "builtin" }
  | { s: "soon" }

export type Action = {
  id: string
  label: string
  /** real: exists today (ref names it); proposed: nothing behind it yet. */
  real: boolean
  ref: string
  /** A hold (removing.md): disconnects. */
  hold?: boolean
}

/** One operational fact, against the person's own use. Never a follower count. */
export type Metric = {
  label: string
  window: string
  value: number
  /** Their own usual for the same window, when the history holds one. */
  usual?: number
}

export type Connector = {
  id: string
  /** Which glyph: a platform mark id, or a material icon (voice, bookmarks). */
  glyph: string
  name: string
  kind: Kind
  /** The muted line under the name: what it does, in two or three words. */
  line: string
  /** Two lines at most: what it hands over, or what I do with it. */
  gives: string
  status: Status
  metric?: Metric
  /** What it hands over, as chips, on a card that is not connected. */
  tags?: string[]
  /** What connecting takes, in full: the open pane says it. */
  setup?: string
  /** The same in two or three words, for one-line places (the table's Latest, a card's foot), so it never truncates. */
  short?: string
  /** The footer link of a card not connected yet. */
  guide?: { label: string; real: boolean; ref: string }
  /** The switch on a connected card, where one maps to something. */
  reading?: { label: string; on: boolean; real: boolean; ref: string }
  actions: Action[]
}

export type Scenario = "today" | "all" | "first-run" | "failed" | "reauth" | "loading"

export const SCENARIOS: Scenario[] = ["today", "all", "first-run", "failed", "reauth", "loading"]

/* ── Actions, shared ─────────────────────────────────────────────── */

const ASK: Action = { id: "ask", label: "Ask for it", real: false, ref: "proposed: no request path exists" }

const channelActions = (p: "x" | "linkedin", label: string): Action[] => [
  { id: "strategy", label: "Topics and times", real: true, ref: `/channels/${p}` },
  { id: "reconnect", label: "Reconnect", real: true, ref: `/api/connect/${p}` },
  { id: "disconnect", label: `Disconnect ${label}`, real: true, ref: `POST /api/connect/${p}/disconnect`, hold: true },
]

/* ── The register ────────────────────────────────────────────────── */

/** Everything listed, in the order the page reads: live sources, live channels, then later. */
function base(): Connector[] {
  return [
    {
      id: "github",
      glyph: "github",
      name: "GitHub",
      kind: "source",
      line: "Reads merges",
      gives: "Each pull request as it merges. I read the description you wrote, never the diff, and keep the merges that carry an idea.",
      status: { s: "available" },
      tags: ["Pull requests", "Descriptions"],
      setup: "One link · posts nothing", short: "One link",
      guide: { label: "How it works", real: false, ref: "proposed: no guide page; plans/021 is the source" },
      reading: { label: "Reading", on: true, real: false, ref: "proposed: lib pauseSource exists, no server action calls it" },
      actions: [
        { id: "install", label: "Install on GitHub", real: true, ref: "GithubSetup.installUrl" },
        { id: "read-last", label: "Read my last merge", real: true, ref: "readLastMergedPull (one PR, own cooldown)" },
        { id: "login", label: "Which username is yours", real: true, ref: "saveGithubLogin" },
        { id: "rhythm", label: "What reads it", real: true, ref: "/rhythm (Ship Log, Shipped Work)" },
        { id: "disconnect", label: "Disconnect GitHub", real: true, ref: "disconnectGithub", hold: true },
      ],
    },
    {
      id: "circleback",
      glyph: "circleback",
      name: "Circleback",
      kind: "source",
      line: "Reads calls",
      gives: "Each call as it ends. I read your half of the transcript, keep the passage worth posting, and store nothing anyone else said.",
      status: { s: "available" },
      tags: ["Your half", "Transcripts"],
      setup: "Two steps · a URL out, a secret back", short: "Two steps",
      guide: { label: "How it works", real: false, ref: "proposed: the steps live in the row's panel today" },
      reading: { label: "Reading", on: true, real: false, ref: "proposed: lib pauseSource exists, no server action calls it" },
      actions: [
        { id: "connect", label: "Connect", real: true, ref: "startCirclebackSetup" },
        { id: "secret", label: "Paste the signing secret", real: true, ref: "saveCirclebackSecret" },
        { id: "disconnect", label: "Disconnect Circleback", real: true, ref: "disconnectCircleback", hold: true },
      ],
    },
    {
      id: "x-posts",
      glyph: "x",
      name: "Your X posts",
      kind: "source",
      line: "Reads your writing",
      gives: "Your own posts, read back so I learn how you write. Up to 100 a read.",
      status: { s: "needs", on: "x", onName: "X" },
      tags: ["Your posts", "Voice rules"],
      setup: "Comes with X · one read at a time", short: "Comes with X",
      actions: [
        { id: "import", label: "Import again", real: true, ref: "importFromX (10 min cooldown, 100 posts)" },
        { id: "brain", label: "See what I learned", real: true, ref: "/brain" },
      ],
    },
    {
      id: "x-bookmarks",
      glyph: "bookmarks",
      name: "X bookmarks",
      kind: "source",
      line: "Reads saved posts daily",
      gives: "Posts you saved on X. I pick the few you have something of your own to say about. Their numbers and stories stay theirs.",
      status: { s: "needs", on: "x", onName: "X" },
      tags: ["Bookmarks", "Daily"],
      setup: "Comes with X · read once a day", short: "Comes with X",
      reading: { label: "Read them daily", on: true, real: true, ref: "enableRhythm / disableRhythm('bookmarks-to-posts')" },
      actions: [
        { id: "run", label: "Read them now", real: true, ref: "runRhythmNow (MANUAL_RUN_COOLDOWN_MS, 200 posts read)" },
        { id: "time", label: "Change the time", real: true, ref: "/rhythm/bookmarks-to-posts (setRhythmTime)" },
      ],
    },
    {
      id: "voice",
      glyph: "voice",
      name: "Voice notes",
      kind: "source",
      line: "Built in",
      gives: "Say it out loud on Ideas. I transcribe it and bring you the angles in it.",
      status: { s: "builtin" },
      tags: ["Transcripts"],
      setup: "Nothing to connect", short: "Nothing to connect",
      guide: { label: "Record one", real: true, ref: "/ideas" },
      actions: [{ id: "record", label: "Record on Ideas", real: true, ref: "/ideas (POST /api/voice-notes)" }],
    },
    {
      id: "x",
      glyph: "x",
      name: "X",
      kind: "channel",
      line: "Posts as you",
      gives: "I publish what you approve, and read back the posts I published to tell you how they did.",
      status: { s: "available" },
      tags: ["Posts", "Threads"],
      setup: "One click · nothing goes out unapproved", short: "One click",
      guide: { label: "What it grants", real: true, ref: "ConnectionStrip GRANTS" },
      actions: [{ id: "connect", label: "Connect X", real: true, ref: "/api/connect/x" }, ...channelActions("x", "X")],
    },
    {
      id: "linkedin",
      glyph: "linkedin",
      name: "LinkedIn",
      kind: "channel",
      line: "Posts as you",
      gives: "I publish what you approve. I can't read your feed, your posts or how they did.",
      status: { s: "available" },
      tags: ["Posts"],
      setup: "One click · renews every 60 days", short: "One click · 60 days",
      guide: { label: "What it grants", real: true, ref: "ConnectionStrip GRANTS" },
      actions: [{ id: "connect", label: "Connect LinkedIn", real: true, ref: "/api/connect/linkedin" }, ...channelActions("linkedin", "LinkedIn")],
    },
    // Coming later: the register (lib/sources.ts SOURCES, channels page SUPPORTED_PLATFORMS).
    ...soon("slack", "slack", "Slack", "source", "How you already explain things to your team", ["Threads", "DMs"]),
    ...soon("loom", "loom", "Loom", "source", "Demos you narrated", ["Transcripts"]),
    ...soon("email", "email", "Email", "source", "Replies and threads you already wrote", ["Sent mail"]),
    ...soon("granola", "granola", "Granola", "source", "Notes and transcripts from calls", ["Notes"]),
    ...soon("fathom", "fathom", "Fathom", "source", "Recordings and transcripts from calls", ["Recordings"]),
    ...soon("photos", "photos", "Photos", "source", "Screenshots and camera roll", ["Screenshots"]),
    ...soon("notion", "notion", "Notion", "source", "Docs you already wrote", ["Docs"]),
    ...soon("calendar", "googlecalendar", "Google Calendar", "source", "What is on this week", ["Events"]),
    ...soon("rss", "rss", "RSS", "source", "Feeds you read", ["Feeds"]),
    ...soon("threads", "threads", "Threads", "channel", "Short posts and replies", ["Posts"]),
    ...soon("bluesky", "bluesky", "Bluesky", "channel", "Short posts on an open network", ["Posts"]),
    ...soon("instagram", "instagram", "Instagram", "channel", "Carousels and captions", ["Carousels"]),
    ...soon("youtube", "youtube", "YouTube", "channel", "Videos and their descriptions", ["Videos"]),
    ...soon("mastodon", "mastodon", "Mastodon", "channel", "Posts on your own instance", ["Posts"]),
    ...soon("substack", "substack", "Substack", "channel", "Long posts and notes", ["Posts", "Notes"]),
    ...soon("kit", "kit", "Kit", "channel", "Your newsletter", ["Issues"]),
  ]
}

function soon(id: string, glyph: string, name: string, kind: Kind, gives: string, tags: string[]): Connector[] {
  return [
    {
      id,
      glyph,
      name,
      kind,
      line: kind === "source" ? "Would read" : "Would post",
      gives,
      status: { s: "soon" },
      tags,
      setup: "Not wired up yet", short: "Not wired up yet",
      actions: [ASK],
    },
  ]
}

/* ── Scenarios ───────────────────────────────────────────────────── */

type Patch = Partial<Pick<Connector, "status" | "metric" | "reading">>

function apply(list: Connector[], patches: Record<string, Patch>): Connector[] {
  return list.map((c) => {
    const p = patches[c.id]
    if (!p) return c
    return { ...c, ...p, reading: p.reading ?? c.reading }
  })
}

/** The live account's shape (2026-11-16): GitHub and X in, bookmarks read daily, Circleback and LinkedIn not. */
const TODAY: Record<string, Patch> = {
  github: {
    status: { s: "connected", last: "Last merge 12 min ago" },
    metric: { label: "Ideas from 291 merges", window: "30 days", value: 27, usual: 22 },
  },
  x: {
    status: { s: "connected", last: "Read back today at 06:00" },
    metric: { label: "Drafts waiting for X", window: "now", value: 109 },
  },
  "x-posts": {
    status: { s: "connected", last: "Last read 21 Aug" },
    metric: { label: "Your posts read", window: "all time", value: 99 },
  },
  "x-bookmarks": {
    status: { s: "connected", last: "Read today at 12:00" },
    metric: { label: "Drafts from your bookmarks", window: "30 days", value: 35, usual: 24 },
  },
}

const ALL: Record<string, Patch> = {
  ...TODAY,
  circleback: {
    status: { s: "connected", last: "Last call yesterday" },
    metric: { label: "Passages kept from 9 calls", window: "30 days", value: 6, usual: 4 },
  },
  linkedin: {
    status: { s: "connected", last: "Access ends in 9 days" },
    metric: { label: "Drafts waiting for LinkedIn", window: "now", value: 4 },
  },
}

const FAILED: Record<string, Patch> = {
  ...TODAY,
  github: {
    status: {
      s: "failed",
      why: "GitHub stopped sending merges on 14 Nov. The app was removed from the account.",
      fix: "Install again",
    },
  },
  circleback: {
    status: {
      s: "failed",
      why: "Circleback's last call didn't verify. The signing secret may have changed.",
      fix: "Paste the secret",
    },
  },
  "x-bookmarks": {
    status: { s: "failed", why: "The last read failed: X said the limit for today was reached.", fix: "Try again" },
    metric: { label: "Drafts from your bookmarks", window: "30 days", value: 35, usual: 24 },
  },
}

const REAUTH: Record<string, Patch> = {
  ...ALL,
  linkedin: {
    status: {
      s: "reauth",
      why: "LinkedIn access ends every 60 days and can't renew on its own. It usually takes one click.",
      fix: "Reconnect",
    },
    metric: { label: "Drafts waiting for LinkedIn", window: "now", value: 4 },
  },
  "x-bookmarks": {
    status: {
      s: "reauth",
      why: "Your X connection is older than bookmark reading. Reconnect X once and I can read them.",
      fix: "Reconnect X",
    },
  },
  github: {
    status: { s: "setup", step: "Installed on an organisation. Say which username is yours." },
  },
}

export function connectorsFor(scenario: Scenario): Connector[] {
  const list = base()
  switch (scenario) {
    case "today":
    case "loading":
      return apply(list, TODAY)
    case "all":
      return apply(list, ALL)
    case "first-run":
      return list
    case "failed":
      return apply(list, FAILED)
    case "reauth":
      return apply(list, REAUTH)
  }
}

/* ── Derived ─────────────────────────────────────────────────────── */

export type Filter = "all" | "connected" | "source" | "channel"

export function isConnected(c: Connector) {
  return c.status.s === "connected" || c.status.s === "waiting" || c.status.s === "paused" || c.status.s === "setup" || c.status.s === "failed" || c.status.s === "reauth"
}

export function isLater(c: Connector) {
  return c.status.s === "soon"
}

export function needsYou(c: Connector) {
  return c.status.s === "failed" || c.status.s === "reauth" || c.status.s === "setup"
}

export function matches(c: Connector, filter: Filter, q: string) {
  const f =
    filter === "all" ? true : filter === "connected" ? isConnected(c) : c.kind === filter
  if (!f) return false
  const t = q.trim().toLowerCase()
  if (!t) return true
  return `${c.name} ${c.line} ${c.gives} ${(c.tags ?? []).join(" ")}`.toLowerCase().includes(t)
}

/**
 * Order: what needs you, then connected, then ready (channels first: on a
 * first run X is the one to start with, so it leads), then built in, then later.
 */
export function rank(c: Connector) {
  if (needsYou(c)) return 0
  if (isConnected(c)) return 1
  if (c.status.s === "available" && c.kind === "channel") return 2
  if (c.status.s === "available" || c.status.s === "needs") return 3
  if (c.status.s === "builtin") return 4
  return 5
}
