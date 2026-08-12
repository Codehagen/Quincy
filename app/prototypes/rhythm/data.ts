/**
 * The grammar, and the whole point of this exploration.
 *
 * Every rhythm — theirs, ours, and the ones nobody has built yet — is the same
 * four fields:
 *
 *     TRIGGER  what starts it        a clock, an event, a threshold
 *     FROM     what it reads         a channel, a source, Quincy’s own memory
 *     MAKES    what it produces      a brief, drafts, a repost, an alert
 *     TO       where that lands      drafts, the lineup, chat, a channel
 *
 * Name those four and adding a rhythm is filling in a row, not writing code.
 * It is also why grouping by platform is the wrong axis: "GitHub to X" and
 * "Substack to X" are the same rhythm with a different FROM, and filing them
 * under X buries that. Platform is a filter. Function is the taxonomy.
 *
 * The competing surface groups by platform and ends up with fourteen entries
 * under X and one under Instagram — a roadmap rendered as an information
 * architecture.
 */

export type Trigger =
  /** A clock. Predictable, the user can plan around it. */
  | { kind: "clock"; label: string }
  /** Something happened somewhere else. */
  | { kind: "event"; label: string }
  /** A number crossed a line. */
  | { kind: "threshold"; label: string }

/** Platforms are channels; the rest are Quincy’s own surfaces. */
export type Node =
  | "x"
  | "linkedin"
  | "threads"
  | "instagram"
  | "youtube"
  | "substack"
  | "tiktok"
  | "kit"
  | "github"
  | "granola"
  | "calendar"
  | "notes"
  | "voice"
  | "drafts"
  | "lineup"
  | "chat"
  | "brain"
  | "numbers"

export type Makes = "brief" | "drafts" | "repost" | "alert" | "report" | "list"

/** What the rhythm leaves behind, in words. An enum value is not copy. */
export const MAKES_LABEL: Record<Makes, string> = {
  brief: "A briefing",
  drafts: "Drafts",
  repost: "A repost",
  alert: "A heads-up",
  report: "A write-up",
  list: "A list",
}

/**
 * Function, not platform. Six buckets, in the order the work happens.
 *
 * "Place" and "Brief" were the first names for two of these and both were
 * jargon — a heading nobody arrives already using is a heading you have to
 * teach. Renamed to what the user would say.
 *
 * "Watch" became "Engage" after reading what Vaynerchuk actually argues in
 * 2026: his first rule is Depth, meaning reply to every comment and DM until
 * you have ten thousand real fans. Watching is passive and had no room for the
 * rule with the most evidence behind it.
 */
export type Family =
  | "capture" // raw material becomes something Quincy can use
  | "multiply" // one piece becomes many
  | "timing" // when it goes out, and where
  | "engage" // noticing, and answering
  | "learn" // turning what happened into what to do next
  | "checkin" // telling you about it

export const FAMILY_LABEL: Record<Family, string> = {
  capture: "Capture",
  multiply: "Multiply",
  timing: "Timing",
  engage: "Engage",
  learn: "Learn",
  checkin: "Check-ins",
}

/**
 * The note carries the principle, not the feature list. Where a number makes
 * the argument better than a sentence does, the number is in the note.
 */
export const FAMILY_NOTE: Record<Family, string> = {
  capture:
    "You already say interesting things. These catch them before they are gone — on a walk, in a call, in a pull request.",
  multiply:
    "One piece becomes many, adapted rather than copied. Vaynerchuk posted the same content to four platforms: three got 70,000 views, the fourth got 6.3 million. The gap is the hook, not the idea.",
  timing:
    "The feed is interest-based now, so a post lives or dies on its own merit rather than on your follower count. Timing is a lever you still control.",
  engage:
    "Reply to everyone until ten thousand people actually care. It is the least scalable thing on this page and the one with the most evidence behind it.",
  learn:
    "The same post can do 300,000 views on a 15-million-follower account and 9.4 million on a new one. What worked is a fact about the post, not about you — so it is worth extracting.",
  checkin: "What Quincy tells you, and when.",
}

export type Rhythm = {
  id: string
  name: string
  /** One line, in the user’s words, about what it does for them. */
  promise: string
  /**
   * The mechanism in plain language: when it fires, what it reads, what it
   * leaves behind. Authored rather than derived — a sentence generated from
   * the four fields comes out as "On publish, reads Substack and puts drafts
   * in X", which is grammar rather than English. Two sentences per rhythm is
   * the authoring cost of a page a person can read at a glance.
   */
  how: string
  family: Family
  trigger: Trigger
  /** Empty for rhythms that read Quincy’s own memory rather than a source. */
  from: Node[]
  makes: Makes
  to: Node[]
  enabled: boolean
  lastRun?: string
  /** How many pieces one run produced, when that is the interesting number. */
  yield?: number
  /** Not shipped anywhere yet — ours, and the reason for the exploration. */
  novel?: boolean
}

export const RHYTHMS: Rhythm[] = [
  // ── Capture ────────────────────────────────────────────────────────────
  {
    id: "voice-capture",
    name: "Voice Notes",
    promise: "Turns what you said on a walk into material",
    how: "You send a voice note. Quincy transcribes it, finds the one idea worth keeping, and leaves a draft.",
    family: "capture",
    trigger: { kind: "event", label: "on voice note" },
    from: ["voice"],
    makes: "drafts",
    to: ["drafts"],
    enabled: true,
    lastRun: "2h ago",
  },
  {
    id: "meetings",
    name: "Meeting Notes",
    promise: "Pulls the quotable moments out of your calls",
    how: "After a recorded call, Quincy reads the transcript for the sentence you said well and turns it into a draft.",
    family: "capture",
    trigger: { kind: "event", label: "on transcript" },
    from: ["granola"],
    makes: "drafts",
    to: ["drafts"],
    enabled: true,
    lastRun: "yesterday",
  },
  {
    id: "shipped",
    name: "Shipped Work",
    promise: "Turns merged pull requests into something worth reading",
    how: "When a pull request merges, Quincy reads the diff and the description and writes what shipped in your voice.",
    family: "capture",
    trigger: { kind: "event", label: "on merge" },
    from: ["github"],
    makes: "drafts",
    to: ["drafts"],
    enabled: true,
    lastRun: "12m ago",
  },
  {
    id: "comment-mining",
    name: "Comment Mining",
    promise: "Reads yesterday’s replies for the question you keep getting",
    how: "Every morning Quincy reads yesterday’s replies across your channels and writes down the question people keep asking.",
    family: "capture",
    trigger: { kind: "clock", label: "daily 06:00" },
    from: ["x", "linkedin", "substack"],
    makes: "list",
    to: ["brain"],
    enabled: false,
    novel: true,
  },

  // ── Multiply ───────────────────────────────────────────────────────────
  {
    id: "atomize",
    name: "Atomize",
    promise: "One long piece becomes a week of posts, native to each platform",
    how: "When you publish something long, Quincy rewrites it for each channel — a thread for X, a carousel for LinkedIn, vertical cuts for TikTok — rather than pasting the same text everywhere.",
    family: "multiply",
    trigger: { kind: "event", label: "on publish" },
    from: ["substack", "youtube"],
    makes: "drafts",
    to: ["x", "linkedin", "threads", "instagram", "tiktok", "youtube", "substack"],
    enabled: true,
    lastRun: "Sun",
    yield: 17,
    novel: true,
  },
  {
    id: "recut",
    name: "Native Recut",
    promise: "One vertical cut, three platforms, three different hooks",
    how: "One vertical video becomes three uploads with three different first seconds, so the platforms can each decide which hook works.",
    family: "multiply",
    trigger: { kind: "event", label: "on upload" },
    from: ["youtube"],
    makes: "drafts",
    to: ["tiktok", "instagram", "youtube"],
    enabled: false,
    yield: 3,
    novel: true,
  },
  {
    id: "notes-ladder",
    name: "Notes Ladder",
    promise: "Tests an idea as a Note before it costs you an essay",
    how: "Quincy posts the idea as a Substack Note first. If it lands, it is worth the essay. If not, you saved a weekend.",
    family: "multiply",
    trigger: { kind: "clock", label: "daily 09:00" },
    from: ["brain"],
    makes: "drafts",
    to: ["substack"],
    enabled: false,
    novel: true,
  },
  {
    id: "repurpose",
    name: "Repurpose Winners",
    promise: "Spots a post that landed and rewrites it for somewhere else",
    how: "When a post beats your usual reach, Quincy rewrites it for a channel it has not run on yet.",
    family: "multiply",
    trigger: { kind: "threshold", label: "top 10% reach" },
    from: ["numbers"],
    makes: "drafts",
    to: ["linkedin", "threads"],
    enabled: true,
    lastRun: "3d ago",
    yield: 4,
  },
  {
    id: "repackage",
    name: "Repackage Old Posts",
    promise: "Revives something from a year ago that still holds",
    how: "Quincy looks a year back for something that still holds and rewrites it as new.",
    family: "multiply",
    trigger: { kind: "clock", label: "Sun 18:00" },
    from: ["numbers"],
    makes: "drafts",
    to: ["x"],
    enabled: false,
  },
  {
    id: "carousels",
    name: "Photo Carousels",
    promise: "Turns a camera roll into a carousel with a written hook",
    how: "Photos in, a carousel out, with a written hook on the first frame.",
    family: "multiply",
    trigger: { kind: "event", label: "on upload" },
    from: ["notes"],
    makes: "drafts",
    to: ["instagram"],
    enabled: false,
  },

  {
    id: "hooks",
    name: "Five Hooks",
    promise: "Writes five openings for one idea and lets merit decide",
    how: "Takes one idea and writes five different first lines, posted as separate attempts. In an interest-based feed the post is judged on its own, so guessing the best hook up front is a worse strategy than trying five.",
    family: "multiply",
    trigger: { kind: "event", label: "on draft" },
    from: ["drafts"],
    makes: "drafts",
    to: ["x", "tiktok", "instagram"],
    enabled: false,
    yield: 5,
    novel: true,
  },

  // ── Timing ──────────────────────────────────────────────────────────────
  {
    id: "week-plan",
    name: "Week Plan",
    promise: "Fills next week across every channel before Monday",
    how: "Sunday evening Quincy fills next week’s slots from the drafts you have, so Monday is not a blank calendar.",
    family: "timing",
    trigger: { kind: "clock", label: "Sun 17:00" },
    from: ["drafts"],
    makes: "report",
    to: ["lineup"],
    enabled: true,
    lastRun: "Sun",
  },
  {
    id: "second-wave",
    name: "Second Wave",
    promise: "Reposts a high performer when the audience has turned over",
    how: "Two weeks after a post did well, most of the audience never saw it. Quincy posts it again.",
    family: "timing",
    trigger: { kind: "threshold", label: "14 days after a hit" },
    from: ["numbers"],
    makes: "repost",
    to: ["x", "linkedin"],
    enabled: false,
  },
  {
    id: "auto-cta",
    name: "Auto-CTA",
    promise: "Adds your ask to a post that is already climbing",
    how: "When a post is climbing faster than your median, Quincy adds your ask to it while people are still reading.",
    family: "timing",
    trigger: { kind: "threshold", label: "2× median in 1h" },
    from: ["numbers"],
    makes: "drafts",
    to: ["x"],
    enabled: false,
  },

  // ── Engage ──────────────────────────────────────────────────────────────
  {
    id: "momentum",
    name: "Post Momentum",
    promise: "Tells you the moment a post starts moving",
    how: "The moment a post doubles your usual first-hour reach, Quincy texts you, while you can still do something about it.",
    family: "engage",
    trigger: { kind: "threshold", label: "2× median in 1h" },
    from: ["numbers"],
    makes: "alert",
    to: ["chat"],
    enabled: true,
    lastRun: "5h ago",
  },
  {
    id: "trends",
    name: "Trend Alerts",
    promise: "Spots a live topic you have standing to talk about",
    how: "Quincy watches for a topic going up that you have actually earned the right to talk about.",
    family: "engage",
    trigger: { kind: "clock", label: "every 2h" },
    from: ["x"],
    makes: "alert",
    to: ["chat"],
    enabled: false,
  },
  {
    id: "opportunity",
    name: "Opportunity Watch",
    promise: "Flags the DM that is actually worth answering",
    how: "Quincy reads your DMs and flags the one that is a real opportunity rather than a pitch.",
    family: "engage",
    trigger: { kind: "clock", label: "every 30m" },
    from: ["x", "linkedin", "instagram"],
    makes: "alert",
    to: ["chat"],
    enabled: true,
    lastRun: "20m ago",
  },
  {
    id: "people",
    name: "People Radar",
    promise: "Tracks who keeps showing up in your replies",
    how: "Tracks who keeps showing up in your replies, so you know who your first thousand true fans actually are.",
    family: "engage",
    trigger: { kind: "clock", label: "daily 07:00" },
    from: ["x", "linkedin"],
    makes: "list",
    to: ["brain"],
    enabled: true,
    lastRun: "4h ago",
  },

  {
    id: "every-comment",
    name: "Every Comment",
    promise: "Drafts a reply to every single comment you get",
    how: "Quincy drafts a reply to every comment you get and queues them for you to send. Under ten thousand followers this is the highest-leverage hour of your day.",
    family: "engage",
    trigger: { kind: "event", label: "on comment" },
    from: ["x", "linkedin", "instagram", "substack"],
    makes: "drafts",
    to: ["drafts"],
    enabled: false,
    novel: true,
  },
  {
    id: "reply-ideas",
    name: "Reply Ideas",
    promise: "Finds posts where you have something real to add",
    how: "Finds posts in your niche where you have something real to add, and drafts the reply.",
    family: "engage",
    trigger: { kind: "clock", label: "daily 07:30" },
    from: ["x", "linkedin"],
    makes: "drafts",
    to: ["drafts"],
    enabled: false,
  },

  // ── Learn ──────────────────────────────────────────────────────────────
  {
    id: "receipts",
    name: "Receipt Watch",
    promise: "Notices when a claim you made finally has a number behind it",
    how: "You claimed something six months ago. Quincy notices when there is finally a number behind it and tells you to say so.",
    family: "learn",
    trigger: { kind: "clock", label: "weekly" },
    from: ["numbers", "brain"],
    makes: "list",
    to: ["brain"],
    enabled: false,
    novel: true,
  },
  {
    id: "outliers",
    name: "Outliers",
    promise: "Works out why the one that hit, hit",
    how: "When a post far outperforms, Quincy works out what was different about it and writes that down where your drafts can use it.",
    family: "learn",
    trigger: { kind: "threshold", label: "top 5% reach" },
    from: ["numbers"],
    makes: "report",
    to: ["brain"],
    enabled: true,
    lastRun: "2d ago",
  },

  // ── Check-ins ──────────────────────────────────────────────────────────────
  {
    id: "morning",
    name: "Morning Brief",
    promise: "Briefs you before the noise",
    how: "Before you open anything else, Quincy tells you what is going out today and what moved overnight.",
    family: "checkin",
    trigger: { kind: "clock", label: "daily 08:00" },
    from: ["lineup", "numbers"],
    makes: "brief",
    to: ["chat"],
    enabled: true,
    lastRun: "3h ago",
  },
  {
    id: "evening",
    name: "Evening Report",
    promise: "Recaps what went out and how it did",
    how: "At the end of the day, what went out and how it did, in one message.",
    family: "checkin",
    trigger: { kind: "clock", label: "daily 20:30" },
    from: ["numbers"],
    makes: "brief",
    to: ["chat"],
    enabled: true,
    lastRun: "yesterday",
  },
  {
    id: "weekly",
    name: "Weekly Analytics",
    promise: "Tells your week as one story, not a dashboard",
    how: "Monday morning, the week as one paragraph with the thing that mattered first.",
    family: "checkin",
    trigger: { kind: "clock", label: "Mon 09:00" },
    from: ["numbers"],
    makes: "report",
    to: ["chat"],
    enabled: false,
  },
]

export const FAMILY_ORDER: Family[] = [
  "capture",
  "multiply",
  "timing",
  "engage",
  "learn",
  "checkin",
]

/**
 * Every node, platforms included. The chips render a logo, but the label is
 * what the screen-reader line and the derivative list read from — leaving
 * platforms out of here printed raw keys like "linkedin" on screen.
 */
export const NODE_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  threads: "Threads",
  instagram: "Instagram",
  youtube: "YouTube",
  substack: "Substack",
  kit: "Kit",
  github: "GitHub",
  granola: "Granola",
  calendar: "Calendar",
  notes: "Photos",
  voice: "Voice",
  drafts: "Drafts",
  lineup: "Lineup",
  chat: "Chat",
  brain: "Brain",
  numbers: "Numbers",
  tiktok: "TikTok",
}
