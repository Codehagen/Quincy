import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { db } from "./db"
import { hasHandler } from "./rhythm-handlers"
import { weekdayLabel } from "./slots"
import {
  brainEvent,
  brainPage,
  rhythmRun,
  rhythmSubscription,
  type RhythmRunState,
} from "./schema-app"

/**
 * What Quincy does on its own.
 *
 * Every rhythm — the one that runs today and the twenty-three that do not yet —
 * is the same four fields:
 *
 *     TRIGGER  what starts it     a clock, an event, a threshold
 *     FROM     what it reads      a channel, a source, Quincy's own memory
 *     MAKES    what it produces   a briefing, drafts, a repost, an alert
 *     TO       where that lands   drafts, the lineup, chat, a channel
 *
 * Naming those four is what makes adding one a row in this file rather than a
 * component. It is also why the page groups by `family` and never by platform:
 * "GitHub to X" and "Substack to X" are one rhythm with a different FROM, and
 * filing them under X hides that. Platform is a filter, not a taxonomy.
 *
 * **Four run today**, and only one of them the way it used to. `heartbeat` is
 * the weekly memory compile in lib/heartbeat.ts, scheduled system-wide from
 * vercel.json and switched on for everyone — it is maintenance, not something
 * you choose, which is why its card stays checked and disabled. The other three
 * — `bookmarks-to-posts`, `voice-refresh` and `trend-alerts` — are
 * subscriptions: a row in `rhythm_subscription` with a time the user picked,
 * fired by lib/rhythm-run.ts. See plans/016.
 *
 * Everything else is still listed with `available: false` and rendered inert,
 * because a catalogue you can read beats a page that pretends the product is
 * smaller than the plan — and a switch that cannot switch anything is worse
 * than no switch.
 *
 * **`available` is the catalogue's claim; the handler registry is the code's.**
 * `isRunnable` below reads lib/rhythm-handlers.ts rather than this flag, so a
 * rhythm cannot be offered a switch it has no way to honour.
 */

export type Trigger =
  | { kind: "clock"; label: string }
  | { kind: "event"; label: string }
  | { kind: "threshold"; label: string }

/** Platforms are channels; the rest are Quincy's own surfaces. */
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
  // Replaces `granola` as the node Meeting Notes reads. The catalogue names
  // the vendor that actually hands material over (plans/019), not the category
  // — a node is drawn on the rhythm diagram, and "Granola" on a diagram nobody
  // has connected to Granola is a picture of a thing that does not happen.
  | "circleback"
  | "notes"
  | "voice"
  /**
   * Public, and the first node here that nobody connects.
   *
   * Every other source node names something a user has to go and authorise —
   * which is what makes the catalogue's rule ("a node has to name a thing you
   * can go and connect") work. Hacker News has no account, no key and no
   * grant, so the diagram draws a real edge to a thing that is simply always
   * available. GitHub keeps the node it already had: Shipped Work reads your
   * merges through it, Trend Alerts reads public repositories, and both are
   * GitHub — a rhythm's `how` says which.
   */
  | "hackernews"
  | "drafts"
  | "riffs"
  | "lineup"
  | "chat"
  | "brain"
  | "numbers"

export type Makes =
  | "brief"
  | "drafts"
  | "riffs"
  | "repost"
  | "alert"
  | "report"
  | "list"

/** What the rhythm leaves behind, in words. An enum value is not copy. */
export const MAKES_LABEL: Record<Makes, string> = {
  brief: "A briefing",
  drafts: "Drafts",
  // Distinct from `drafts`, and the distinction is the product: a draft is
  // writing waiting for approval, an angle is a direction waiting for a
  // decision. A rhythm that reads somebody else's material should leave the
  // second, because the first has already decided you are entering the topic.
  riffs: "Angles",
  repost: "A repost",
  alert: "A heads-up",
  report: "A write-up",
  list: "A list",
}

/**
 * Function, not platform. Six buckets in the order the work happens.
 *
 * "Engage" covers noticing *and* answering. Watching alone would have left no
 * room for replying to everyone, which is the least scalable thing on the page
 * and the one with the most evidence behind it.
 */
export type Family =
  "capture" | "multiply" | "timing" | "engage" | "learn" | "checkin"

export const FAMILY_LABEL: Record<Family, string> = {
  capture: "Capture",
  multiply: "Multiply",
  timing: "Timing",
  engage: "Engage",
  learn: "Learn",
  checkin: "Check-ins",
}

/** The note carries the principle, not the feature list. */
export const FAMILY_NOTE: Record<Family, string> = {
  capture:
    "You already say interesting things. These catch them before they are gone — on a walk, in a call, in a pull request.",
  multiply:
    "One piece becomes many, adapted rather than copied. The same post across four platforms can differ by two orders of magnitude in reach; the gap is the first line, not the idea.",
  timing:
    "Feeds are interest-based now, so a post lives or dies on its own merit rather than on your follower count. Timing is a lever you still control.",
  engage:
    "Reply to everyone until ten thousand people actually care. It is the least scalable thing here and the one worth automating the drafting of, never the sending.",
  learn:
    "What worked is a fact about the post, not about you. Worth extracting while it is still true.",
  checkin: "What Quincy tells you, and when.",
}

export const FAMILY_ORDER: Family[] = [
  "capture",
  "multiply",
  "timing",
  "engage",
  "learn",
  "checkin",
]

export type Rhythm = {
  id: string
  name: string
  /** One line, in the user's words, about what it does for them. */
  promise: string
  /** The mechanism in plain language: when it fires, what it reads, what it leaves. */
  how: string
  family: Family
  trigger: Trigger
  /** Empty for rhythms that read Quincy's own memory rather than a source. */
  from: Node[]
  makes: Makes
  to: Node[]
  /** False until the machinery behind it exists. Renders inert, never fake. */
  available: boolean
}

export const RHYTHMS: Rhythm[] = [
  // ── Capture ────────────────────────────────────────────────────────────
  {
    id: "voice-notes",
    name: "Voice Notes",
    promise: "Turns what you said on a walk into material",
    how: "You send a voice note. Quincy transcribes it, finds the one idea worth keeping, and leaves a draft.",
    family: "capture",
    trigger: { kind: "event", label: "on voice note" },
    from: ["voice"],
    makes: "drafts",
    to: ["drafts"],
    available: false,
  },
  /**
   * Built in plans/019, and still `available: false` — which is not an
   * oversight and is the same state Voice Notes sits in having shipped.
   *
   * `available` and `isRunnable` both describe the switch on /rhythm, and
   * `isRunnable` requires `trigger.kind === "clock"`. An event rhythm has no
   * switch to offer: there is no hour to choose and nothing for the dispatcher
   * to fire. Its on/off lives where the event comes from — connecting or
   * disconnecting Circleback on /sources — and claiming a switch here would be
   * offering a second control over the same fact.
   *
   * For the same reason it is deliberately **not** in `RHYTHM_HANDLERS`. That
   * registry is what the cron dispatcher iterates, and a handler there would be
   * a clock trying to run something that only happens when a call ends.
   */
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    promise: "Pulls the quotable moments out of your calls",
    how: "After a recorded call, Quincy reads your own half of the transcript, keeps the passage worth publishing, and leaves the angles in it.",
    family: "capture",
    trigger: { kind: "event", label: "on transcript" },
    from: ["circleback"],
    makes: "drafts",
    to: ["drafts"],
    available: false,
  },
  /**
   * Built in plans/021, and `available: false` for the reason `meeting-notes`
   * directly above is — see the note there. An event rhythm has no switch to
   * offer: there is no hour to choose and nothing for the dispatcher to fire,
   * so its on and off live on /sources as connecting and disconnecting GitHub.
   * It is deliberately not in `RHYTHM_HANDLERS` either.
   */
  {
    id: "shipped-work",
    name: "Shipped Work",
    promise: "Turns merged pull requests into something worth reading",
    /**
     * "the diff and the description" was wrong and is corrected here rather
     * than left as an aspiration. The diff is not read and will not be: across
     * this repository's 27 merged pull requests the median diff is 51 times
     * larger than its description, and the description is the only place the
     * author already wrote down why. See plans/021 decision 1.
     */
    how: "When a pull request merges, Quincy reads the description you already wrote — never the diff — and keeps the ones carrying an idea worth publishing.",
    family: "capture",
    trigger: { kind: "event", label: "on merge" },
    from: ["github"],
    makes: "drafts",
    to: ["drafts"],
    available: false,
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
    available: false,
  },
  {
    /**
     * Runs. lib/rhythm-handlers.ts:bookmarksToPosts — read, select, draft.
     *
     * Filed under Capture rather than Multiply, and the distinction is the
     * product argument: Multiply is one of *your* pieces becoming many, and
     * this is material arriving. What it captures is somebody else's post,
     * which is why the promise says "you can answer" rather than "worth
     * posting" — docs/vision.md's bet is that the scarce thing is original
     * thought with a receipt, so a bookmark is a prompt and never the post.
     */
    id: "bookmarks-to-posts",
    name: "Bookmarks to Posts",
    promise: "Turns the posts you saved into ones only you could write",
    how: "Reads your X bookmarks, picks the few you have something of your own to say about, and drafts those in your voice. Their numbers and stories stay theirs.",
    family: "capture",
    trigger: { kind: "clock", label: "daily 14:00" },
    from: ["x"],
    makes: "drafts",
    to: ["drafts"],
    available: true,
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
    to: [
      "x",
      "linkedin",
      "threads",
      "instagram",
      "tiktok",
      "youtube",
      "substack",
    ],
    available: false,
  },
  {
    id: "five-hooks",
    name: "Five Hooks",
    promise: "Writes five openings for one idea and lets merit decide",
    how: "Takes one idea and writes five different first lines, posted as separate attempts. In an interest-based feed the post is judged on its own, so guessing the best hook up front is a worse strategy than trying five.",
    family: "multiply",
    trigger: { kind: "event", label: "on draft" },
    from: ["drafts"],
    makes: "drafts",
    to: ["x", "tiktok", "instagram"],
    available: false,
  },
  {
    id: "native-recut",
    name: "Native Recut",
    promise: "One vertical cut, three platforms, three different hooks",
    how: "One vertical video becomes three uploads with three different first seconds, so the platforms can each decide which hook works.",
    family: "multiply",
    trigger: { kind: "event", label: "on upload" },
    from: ["youtube"],
    makes: "drafts",
    to: ["tiktok", "instagram", "youtube"],
    available: false,
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
    available: false,
  },
  {
    id: "repurpose-winners",
    name: "Repurpose Winners",
    promise: "Spots a post that landed and rewrites it for somewhere else",
    how: "When a post beats your usual reach, Quincy rewrites it for a channel it has not run on yet.",
    family: "multiply",
    trigger: { kind: "threshold", label: "top 10% reach" },
    from: ["numbers"],
    makes: "drafts",
    to: ["linkedin", "threads"],
    available: false,
  },
  {
    id: "photo-carousels",
    name: "Photo Carousels",
    promise: "Turns a camera roll into a carousel with a written hook",
    how: "Photos in, a carousel out, with a written hook on the first frame.",
    family: "multiply",
    trigger: { kind: "event", label: "on upload" },
    from: ["notes"],
    makes: "drafts",
    to: ["instagram"],
    available: false,
  },

  // ── Timing ─────────────────────────────────────────────────────────────
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
    available: false,
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
    available: false,
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
    available: false,
  },

  // ── Engage ─────────────────────────────────────────────────────────────
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
    available: false,
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
    available: false,
  },
  {
    id: "post-momentum",
    name: "Post Momentum",
    promise: "Tells you the moment a post starts moving",
    how: "The moment a post doubles your usual first-hour reach, Quincy texts you, while you can still do something about it.",
    family: "engage",
    trigger: { kind: "threshold", label: "2× median in 1h" },
    from: ["numbers"],
    makes: "alert",
    to: ["chat"],
    available: false,
  },
  {
    id: "opportunity-watch",
    name: "Opportunity Watch",
    promise: "Flags the DM that is actually worth answering",
    how: "Quincy reads your DMs and flags the one that is a real opportunity rather than a pitch.",
    family: "engage",
    trigger: { kind: "clock", label: "every 30m" },
    from: ["x", "linkedin", "instagram"],
    makes: "alert",
    to: ["chat"],
    available: false,
  },
  {
    id: "people-radar",
    name: "People Radar",
    promise: "Tracks who keeps showing up in your replies",
    how: "Tracks who keeps showing up in your replies, so you know who your first thousand true fans actually are.",
    family: "engage",
    trigger: { kind: "clock", label: "daily 07:00" },
    from: ["x", "linkedin"],
    makes: "list",
    to: ["brain"],
    available: false,
  },
  {
    /**
     * Runs. lib/rhythm-handlers.ts:trendAlerts — read, select, riff.
     *
     * Three fields changed when the machinery landed, and each is a decision
     * rather than a correction:
     *
     * **`from` is no longer X.** X removed its free tier in February 2026 and
     * every post read is bought at `X_READ_COST_MICROS`. A trend scan is only
     * useful broad, and broad on X is roughly $45 a month against a $49 plan —
     * the one agent whose economics simply refuse. Hacker News and GitHub cost
     * nothing to read and Hacker News is *earlier*, which is what the promise
     * is actually about. lib/signals.ts holds the full argument, including why
     * Reddit is not here.
     *
     * **`trigger` is daily rather than every two hours.** A `Cadence` is a
     * wall-clock hour and minute (lib/rhythm-schedule.ts), so "every 2h" was
     * a label the dispatcher had no way to honour. Daily at 07:00 is the same
     * time People Radar takes, and it matches the promise better than a
     * two-hourly poll does: the angle wants reading with the morning, not
     * twelve times between meetings.
     *
     * **It makes riffs, not an alert.** "Hands you the angle early" is a riff
     * — one scrap plus the angles Quincy sees in it — and the decision stays
     * yours. An alert to chat would be a notification about somebody else's
     * news, which is a thing to feel behind on rather than a thing to write.
     */
    id: "trend-alerts",
    name: "Trend Alerts",
    promise: "Spots a live topic you have standing to talk about",
    how: "Every morning Quincy reads what Hacker News and GitHub are loud about, keeps only the topics you have first-hand standing on, and leaves the angles you could take. Most days it keeps nothing, which is the honest answer.",
    family: "engage",
    trigger: { kind: "clock", label: "daily 07:00" },
    from: ["hackernews", "github"],
    makes: "riffs",
    to: ["riffs"],
    available: true,
  },

  // ── Learn ──────────────────────────────────────────────────────────────
  {
    /**
     * The one that runs. lib/heartbeat.ts, scheduled Mondays from vercel.json.
     * Its history is real: every compile writes a `brainEvent` with
     * `source: "heartbeat"`, which is what `getHeartbeatRuns` reads.
     */
    id: "heartbeat",
    name: "Heartbeat",
    promise: "Turns what you told Quincy this week into what it remembers",
    how: "Once a week Quincy reads everything you said to it, pulls out the facts worth keeping, and writes them into the brain. Anything you wrote yourself is never overwritten.",
    family: "learn",
    trigger: { kind: "clock", label: "Mon 22:17 UTC" },
    from: ["chat"],
    makes: "list",
    to: ["brain"],
    available: true,
  },
  {
    /**
     * Runs. lib/rhythm-handlers.ts:refreshVoice — importXCorpus then
     * compileVoice, skipping the compile when nothing new came back.
     */
    id: "voice-refresh",
    name: "Voice Refresh",
    promise: "Keeps the voice it writes in current with the voice you have now",
    how: "Reads the posts you have published since last time and rewrites the voice rules from them. Anything you edited yourself is never overwritten.",
    family: "learn",
    trigger: { kind: "clock", label: "weekly" },
    from: ["x"],
    makes: "list",
    to: ["brain"],
    available: true,
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
    available: false,
  },
  {
    id: "receipt-watch",
    name: "Receipt Watch",
    promise: "Notices when a claim you made finally has a number behind it",
    how: "You claimed something six months ago. Quincy notices when there is finally a number behind it and tells you to say so.",
    family: "learn",
    trigger: { kind: "clock", label: "weekly" },
    from: ["numbers", "brain"],
    makes: "list",
    to: ["brain"],
    available: false,
  },

  // ── Check-ins ──────────────────────────────────────────────────────────
  {
    id: "morning-brief",
    name: "Morning Brief",
    promise: "Briefs you before the noise",
    how: "Before you open anything else, Quincy tells you what is going out today and what moved overnight.",
    family: "checkin",
    trigger: { kind: "clock", label: "daily 08:00" },
    from: ["lineup", "numbers"],
    makes: "brief",
    to: ["chat"],
    available: false,
  },
  {
    id: "evening-report",
    name: "Evening Report",
    promise: "Recaps what went out and how it did",
    how: "At the end of the day, what went out and how it did, in one message.",
    family: "checkin",
    trigger: { kind: "clock", label: "daily 20:30" },
    from: ["numbers"],
    makes: "brief",
    to: ["chat"],
    available: false,
  },
  {
    id: "weekly-analytics",
    name: "Weekly Analytics",
    promise: "Tells your week as one story, not a dashboard",
    how: "Monday morning, the week as one paragraph with the thing that mattered first.",
    family: "checkin",
    trigger: { kind: "clock", label: "Mon 09:00" },
    from: ["numbers"],
    makes: "report",
    to: ["chat"],
    available: false,
  },
]

export const AVAILABLE_RHYTHMS = RHYTHMS.filter((r) => r.available)

export function getRhythm(id: string) {
  return RHYTHMS.find((r) => r.id === id) ?? null
}

/** Labels for every node. The chips render a mark; this is what text reads. */
export const NODE_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  threads: "Threads",
  instagram: "Instagram",
  youtube: "YouTube",
  substack: "Substack",
  tiktok: "TikTok",
  kit: "Kit",
  github: "GitHub",
  // The vendor, not "Meetings". This label sits on a diagram of where material
  // comes from, and a node has to name a thing you can go and connect.
  circleback: "Circleback",
  granola: "Granola",
  notes: "Photos",
  voice: "Voice",
  hackernews: "Hacker News",
  drafts: "Drafts",
  riffs: "Riffs",
  lineup: "Lineup",
  chat: "Studio",
  brain: "Brain",
  numbers: "Numbers",
}

/** Platforms only — what the filter offers, and what a channel can be. */
export const FILTERABLE_NODES = [
  "x",
  "linkedin",
  "threads",
  "instagram",
  "tiktok",
  "youtube",
  "substack",
] as const

export type RhythmRun = { at: Date; pages: number }

/**
 * Real run history for the one rhythm that runs.
 *
 * A compile writes one `brainEvent` per page it touched, all within the same
 * run, so the rows are bucketed to the minute — the alternative is a history
 * that shows one run as four.
 *
 * Returns an empty array rather than throwing for a user who has never had a
 * heartbeat fire: never having run is a state, not an error.
 */
export async function getHeartbeatRuns(
  userId: string,
  limit = 5
): Promise<RhythmRun[]> {
  const minute = sql<Date>`date_trunc('minute', ${brainEvent.observedAt})`

  const rows = await db
    .select({ at: minute, pages: sql<number>`count(*)::int` })
    .from(brainEvent)
    .innerJoin(brainPage, eq(brainEvent.pageId, brainPage.id))
    .where(
      and(
        eq(brainPage.userId, userId),
        eq(brainEvent.source, "heartbeat"),
        eq(brainEvent.kind, "compile")
      )
    )
    .groupBy(minute)
    .orderBy(desc(minute))
    .limit(limit)

  return rows.map((row) => ({ at: new Date(row.at), pages: row.pages }))
}

/* ── Subscriptions ────────────────────────────────────────────────────────
   The catalogue above is what Quincy *can* do. This is what one person has
   actually switched on. See plans/016.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * A rhythm's default time, when somebody switches it on without choosing one.
 *
 * Keyed by rhythm id and read from the catalogue's own `trigger.label`
 * nowhere — that string is prose for a card ("daily 14:00", "weekly") and
 * parsing it would make a copy edit into a scheduling change. The times here
 * are the same ones the labels claim, and a mismatch between them is a copy
 * bug rather than a behaviour bug.
 */
export const DEFAULT_CADENCE: Record<
  string,
  { hour: number; minute: number; weekday: number | null }
> = {
  // Early afternoon: bookmarks accumulate over a morning's reading, and a
  // draft waiting at 14:00 is one you can still do something with today.
  "bookmarks-to-posts": { hour: 14, minute: 0, weekday: null },
  // Sunday evening, after the week's posting is done and before the next one
  // starts, so the voice it compiles is the voice you just used.
  "voice-refresh": { hour: 20, minute: 0, weekday: 7 },
  // Early, because the whole promise is "early". A discussion that broke
  // overnight is still worth entering at seven and is an old thread by two.
  "trend-alerts": { hour: 7, minute: 0, weekday: null },
}

/** What one card needs to render its switch, its time and its last receipt. */
export type RhythmState = {
  rhythmId: string
  subscriptionId: string | null
  enabled: boolean
  hour: number
  minute: number
  weekday: number | null
  /** Null when it has never been switched on. */
  nextRunAt: Date | null
  lastRun: {
    state: RhythmRunState
    summary: string
    at: Date
    manual: boolean
  } | null
}

/**
 * Whether a rhythm can be switched on at all.
 *
 * Reads the **handler registry**, not `Rhythm.available`. The catalogue's flag
 * is its own claim about what the product does; this is the code's. Reading
 * the registry is what makes it impossible for the UI to offer a switch that
 * cannot honour a press — the two can never disagree because only one of them
 * is consulted.
 */
export function isRunnable(rhythm: Rhythm): boolean {
  return rhythm.trigger.kind === "clock" && hasHandler(rhythm.id)
}

/**
 * Every switch on the page, in one pass.
 *
 * Two queries rather than one per card: the grid renders twenty-odd rhythms
 * and a per-card read would be twenty-odd round trips to Neon over HTTP on
 * every render of a page whose whole job is to be glanced at.
 */
export async function getRhythmStates(
  userId: string
): Promise<Map<string, RhythmState>> {
  const subscriptions = await db
    .select()
    .from(rhythmSubscription)
    .where(eq(rhythmSubscription.userId, userId))

  const states = new Map<string, RhythmState>()
  if (subscriptions.length === 0) return states

  /**
   * One row per subscription — asked of Postgres, not filtered here.
   *
   * This used to fetch *every* run the subscriptions ever recorded, newest
   * first, and keep the first per subscription in JS. The old comment called
   * the row count "bounded by how many rhythms one person has switched on";
   * it was actually bounded by run history, which grows by one row per
   * execution forever. `DISTINCT ON` returns exactly the rows this function
   * uses, and `rhythm_run_subscription_idx` on (subscription_id, started_at)
   * serves the required leading order.
   */
  const runs = await db
    .selectDistinctOn([rhythmRun.subscriptionId], {
      subscriptionId: rhythmRun.subscriptionId,
      state: rhythmRun.state,
      summary: rhythmRun.summary,
      startedAt: rhythmRun.startedAt,
      manual: rhythmRun.manual,
    })
    .from(rhythmRun)
    .where(
      inArray(
        rhythmRun.subscriptionId,
        subscriptions.map((s) => s.id)
      )
    )
    .orderBy(asc(rhythmRun.subscriptionId), desc(rhythmRun.startedAt))

  const latest = new Map(runs.map((run) => [run.subscriptionId, run]))

  for (const row of subscriptions) {
    const run = latest.get(row.id)

    states.set(row.rhythmId, {
      rhythmId: row.rhythmId,
      subscriptionId: row.id,
      enabled: row.enabled,
      hour: row.hour,
      minute: row.minute,
      weekday: row.weekday,
      nextRunAt: row.nextRunAt,
      lastRun: run
        ? {
            state: run.state,
            summary: run.summary,
            at: run.startedAt,
            manual: run.manual,
          }
        : null,
    })
  }

  return states
}

/**
 * The default state of a rhythm nobody has touched.
 *
 * A function rather than a constant so the caller gets a fresh object, and so
 * the default time comes from one table rather than being spelled out at each
 * call site.
 */
export function defaultRhythmState(rhythmId: string): RhythmState {
  const cadence = DEFAULT_CADENCE[rhythmId] ?? {
    hour: 9,
    minute: 0,
    weekday: null,
  }

  return {
    rhythmId,
    subscriptionId: null,
    enabled: false,
    ...cadence,
    nextRunAt: null,
    lastRun: null,
  }
}

/**
 * "every day at 14:00", or "every Monday at 22:17".
 *
 * The card and the detail page both say when a rhythm fires, and they must say
 * it the same way. Built from the stored wall clock rather than from
 * `trigger.label`, which is prose written for the catalogue and stops being
 * true the moment somebody moves the time.
 *
 * Padded through `String.padStart` rather than `Intl`: this is a wall clock the
 * user typed, not an instant, so there is no zone to format it in and nothing
 * to convert.
 */
export function describeCadence(state: {
  hour: number
  minute: number
  weekday: number | null
}): string {
  const time = `${String(state.hour).padStart(2, "0")}:${String(state.minute).padStart(2, "0")}`

  return state.weekday === null
    ? `every day at ${time}`
    : `every ${weekdayLabel(state.weekday)} at ${time}`
}

/** One rhythm's run history, newest first. The receipt half of the detail
 *  page — and the only honest reason to leave a rhythm on. */
export async function getRhythmRuns(
  userId: string,
  rhythmId: string,
  limit = 10
): Promise<
  {
    at: Date
    state: RhythmRunState
    summary: string
    manual: boolean
  }[]
> {
  const rows = await db
    .select({
      at: rhythmRun.startedAt,
      state: rhythmRun.state,
      summary: rhythmRun.summary,
      manual: rhythmRun.manual,
    })
    .from(rhythmRun)
    .where(and(eq(rhythmRun.userId, userId), eq(rhythmRun.rhythmId, rhythmId)))
    .orderBy(desc(rhythmRun.startedAt))
    .limit(limit)

  return rows
}
