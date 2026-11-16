/**
 * Fixtures for the kit-test Riffs screen. The shape follows `Riff` and `Angle`
 * in lib/riffs.ts, trimmed to what this screen reads, plus three fields the
 * real model does not have (marked GUESS below) because the kit's editor marks
 * need something to point at.
 *
 * The account this describes publishes to X and LinkedIn only, so an essay
 * has nowhere to land: that is the one refusal on the page.
 */

export type Shape = "Short post" | "Thread" | "Carousel" | "Essay"

export type AngleStatus = "open" | "drafted" | "dismissed"

export type Angle = {
  id: string
  /** The opening line. */
  hook: string
  shape: Shape
  /** What the post is ("Story", "Opinion"), or "" when unknown. */
  kind: string
  /** Quincy's one line on why this angle is worth writing. */
  why: string
  status: AngleStatus
  /**
   * GUESS — not in lib/riffs.ts. The angle Quincy would start with. It gets
   * the page's one action button and the one margin note.
   */
  pick?: { note: string }
  /**
   * GUESS — stands in for `draftAngle` answering `ok: false`. The stub
   * returns this sentence instead of writing a draft.
   */
  refusal?: { reason: "no-channel" | "entitlement"; message: string }
}

export type RiffState = "working" | "ready" | "failed"

export type Riff = {
  id: string
  /** The raw material, close to verbatim. */
  scrap: string
  /**
   * GUESS — not in lib/riffs.ts. The one sentence of the scrap the angles
   * rest on, highlighted. Must be an exact substring of `scrap`.
   */
  keyLine?: string
  /** "Voice note", "Pasted post", "GitHub", "Meeting". */
  sourceLabel: string
  /** A duration or file name for Mono: "1:52", "PR #418". */
  sourceMeta?: string
  /** Pre-rendered day, as the server would render it. */
  capturedAt: string
  state: RiffState
  failure: string
  adaptedFrom: { url: string; handle: string } | null
  angles: Angle[]
}

/** How many drafts "Draft this" writes per shape, for X + LinkedIn. */
export const WRITES: Record<Shape, number> = {
  "Short post": 2,
  Thread: 1,
  Carousel: 1,
  Essay: 0,
}

/** Where each shape lands, for the line under the hook. */
export const DESTINATIONS: Record<Shape, string> = {
  "Short post": "X and LinkedIn",
  Thread: "X",
  Carousel: "LinkedIn",
  Essay: "no channel yet",
}

/**
 * The person's own baseline, so the waiting count is never a bare total.
 * Angles they decide on (draft or dismiss) in a median week.
 */
export const MEDIAN_DECIDED_PER_WEEK = 5

export const RIFFS: Riff[] = [
  {
    id: "r1",
    scrap:
      "So the thing from this week. We cut the onboarding email down to one question, just “what are you trying to ship this month”, and replies went from six a week to thirty-one. Nobody answers a brochure. They answer a question. I keep thinking we should do that everywhere, the trial expiry email too.",
    keyLine: "replies went from six a week to thirty-one",
    sourceLabel: "Voice note",
    sourceMeta: "1:52",
    capturedAt: "Today",
    state: "ready",
    failure: "",
    adaptedFrom: null,
    angles: [
      {
        id: "r1a1",
        hook: "I cut our onboarding email down to one question. Replies went from 6 a week to 31.",
        kind: "Story",
        shape: "Short post",
        why: "It has all three beats and a number you measured yourself. The 6 is your own baseline, so the 31 reads as earned.",
        status: "open",
        pick: { note: "start here. it has the number" },
      },
      {
        id: "r1a2",
        hook: "Nobody answers a brochure. They answer a question.",
        kind: "Opinion",
        shape: "Thread",
        why: "A line people repeat. It needs the email story as the second post, or it reads as a slogan.",
        status: "open",
      },
      {
        id: "r1a3",
        hook: "Every email we send now ends in one question. Here is the trial expiry one, before and after.",
        kind: "How-to",
        shape: "Carousel",
        why: "You said you want to do it everywhere. One more email, shown side by side, makes the idea something people can copy.",
        status: "open",
      },
    ],
  },
  {
    id: "r2",
    scrap:
      "Hot take: changelogs are marketing. If your changelog page has no replies, you are writing it for yourself. Ship notes people answer, or stop shipping notes.",
    keyLine: "If your changelog page has no replies, you are writing it for yourself.",
    sourceLabel: "Pasted post",
    capturedAt: "Yesterday",
    state: "ready",
    failure: "",
    adaptedFrom: { url: "https://x.com/mara_builds/status/1", handle: "mara_builds" },
    angles: [
      {
        id: "r2a1",
        hook: "Our changelog got three replies last month. One of them found a bug before we did.",
        kind: "Story",
        shape: "Short post",
        why: "You have a real case that answers her claim. Your own week is stronger than agreeing with her.",
        status: "open",
      },
      {
        id: "r2a2",
        hook: "Three things I changed so people reply to our changelog",
        kind: "How-to",
        shape: "Essay",
        why: "Long enough to show all three changes with the numbers. It needs a long-form channel.",
        status: "open",
        refusal: {
          reason: "no-channel",
          message: "No channel takes an essay yet. Connect Substack and I can draft it.",
        },
      },
    ],
  },
  {
    id: "r3",
    scrap:
      "Remove day estimates from the planning board.\n\nWe replace day estimates with three sizes: small, medium, large. Over the last six sprints, day estimates were off by a median of 2.4×, and for small tickets the estimate review took longer than the work.",
    keyLine: "day estimates were off by a median of 2.4×",
    sourceLabel: "GitHub",
    sourceMeta: "PR #418",
    capturedAt: "Yesterday",
    state: "ready",
    failure: "",
    adaptedFrom: null,
    angles: [
      {
        id: "r3a1",
        hook: "We stopped estimating in days. For six sprints we were off by 2.4×.",
        kind: "Story",
        shape: "Short post",
        why: "The merge says what you did and the 2.4× says what happened. The last beat is yours to say: what you do now.",
        status: "open",
      },
      {
        id: "r3a2",
        hook: "Small, medium, large: the only estimate scale we still use",
        kind: "How-to",
        shape: "Carousel",
        why: "Three sizes fit three slides. People save a format they can take to their own planning.",
        status: "drafted",
      },
    ],
  },
  {
    id: "r4",
    scrap:
      "Ingrid: The thing I did not expect is that the customers who churned never once opened the weekly report.\n\nMe: So the report is the product, for the ones who stay.\n\nIngrid: Pretty much. We could send it on day two instead of day seven.",
    keyLine: "the customers who churned never once opened the weekly report",
    sourceLabel: "Meeting",
    sourceMeta: "32:10",
    capturedAt: "Wed",
    state: "ready",
    failure: "",
    adaptedFrom: null,
    angles: [
      {
        id: "r4a1",
        hook: "Not one customer who churned had opened the weekly report. So we moved it to day two.",
        kind: "Story",
        shape: "Short post",
        why: "The finding is Ingrid’s, the change is yours. Say she found it; a post that takes credit for a call reads badly.",
        status: "open",
      },
      {
        id: "r4a2",
        hook: "The report is the product, for the customers who stay.",
        kind: "Opinion",
        shape: "Thread",
        why: "Your line from the call. It holds up as a thread if the churn number opens it.",
        status: "open",
      },
    ],
  },
  {
    id: "r5",
    scrap:
      "Okay, the pricing page thing. I think the… no. Start again. The pricing page, we changed the, the annual toggle, and…",
    sourceLabel: "Voice note",
    sourceMeta: "0:38",
    capturedAt: "Mon",
    state: "failed",
    failure:
      "I could not find a post in this one. It stops before anything happens. The transcript is kept; recording it again is the surest fix.",
    adaptedFrom: null,
    angles: [],
  },
]

/**
 * What the next recordings "say". The recorder is simulated (no microphone
 * opens), so each take is one of these, in turn.
 */
export const NEW_TAKES: Pick<Riff, "scrap" | "keyLine" | "angles">[] = [
  {
    scrap:
      "Quick one from the walk. We deleted the settings page on Monday, the whole advanced tab, and nobody noticed until Thursday. Four days. That is the review I wanted.",
    keyLine: "nobody noticed until Thursday",
    angles: [
      {
        id: "t1a1",
        hook: "We deleted a whole settings tab. Nobody noticed for four days.",
        kind: "Story",
        shape: "Short post",
        why: "A short story with a number in the middle. The four days is the proof; you do not need to argue the point.",
        status: "open",
        pick: { note: "the four days is the post" },
      },
      {
        id: "t1a2",
        hook: "The best product review I got this year was silence.",
        kind: "Opinion",
        shape: "Thread",
        why: "A strong first line. It needs the settings story under it, or it is a riddle.",
        status: "open",
      },
    ],
  },
  {
    scrap:
      "Thinking about the export rewrite. It was a support project, not a feature. Tickets about exports went from forty a month to three, and they just stopped asking.",
    keyLine: "Tickets about exports went from forty a month to three",
    angles: [
      {
        id: "t2a1",
        hook: "Our export rewrite was a support project. Tickets went from 40 a month to 3.",
        kind: "Story",
        shape: "Short post",
        why: "You framed it yourself: support, not feature. The ticket count is the happened beat.",
        status: "open",
        pick: { note: "your framing. keep it" },
      },
    ],
  },
]
