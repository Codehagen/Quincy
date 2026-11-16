/**
 * Fixture data for the kit-test Riffs screen. Shaped after `Riff` and `Angle`
 * in lib/riffs.ts, trimmed to what this screen reads. No database.
 */

export type Shape = "Short post" | "Thread" | "Carousel" | "Essay"

export type Angle = {
  id: string
  /** The opening line: the whole bet. */
  hook: string
  /** One of ANGLE_KINDS in lib/adapt.ts, or "" when unknown. */
  kind: string
  shape: Shape
  /** Why this angle is worth writing. Quincy's reasoning, visible. */
  why: string
  /** Set once "Draft this" has written it into /drafts. */
  status?: "drafted"
}

export type Riff = {
  id: string
  /** What the row and the detail call it: "Voice note", "Pasted post". */
  sourceLabel: string
  /** The same source, lower case, for a sentence: "the voice note". */
  sourcePhrase: string
  /** Pre-rendered, as on the server: "Today", "Yesterday", "Mon". */
  capturedAt: string
  /** The same day inside a sentence: "today", "yesterday", "Monday". */
  capturedPhrase: string
  /** A voice note's length, mono: "4:12". */
  duration?: string
  /** The person's words, verbatim. Empty for a voice note still transcribing. */
  scrap: string
  state: "working" | "ready" | "failed"
  /** Why it failed. Empty otherwise. */
  failure: string
  /** The post someone else wrote that prompted this, if any. */
  adaptedFrom: { url: string; handle: string } | null
  angles: Angle[]
  /** The angle Quincy would start with, if it has one. */
  pickId?: string
  /** Quincy's margin note on the pick: ≤ 6 words, lower case. */
  pickNote?: string
}

/** Where each shape lands, as CHANNELS_FOR_SHAPE in lib/riffs.ts. */
export const CHANNELS_FOR_SHAPE: Record<Shape, { id: string; label: string }[]> = {
  "Short post": [
    { id: "x", label: "X" },
    { id: "linkedin", label: "LinkedIn" },
  ],
  Thread: [{ id: "x", label: "X" }],
  Carousel: [
    { id: "linkedin", label: "LinkedIn" },
    { id: "instagram", label: "Instagram" },
  ],
  Essay: [{ id: "substack", label: "Substack" }],
}

/** The channels this fixture account publishes to. Substack is not connected. */
export const CONNECTED = ["x", "linkedin"] as const

/**
 * The person's own baseline, so the page summary is stated against it
 * (README: "every number is against the person's own baseline").
 */
export const BASELINE = { anglesClearedPerWeek: 5 }

export const RIFFS: Riff[] = [
  {
    id: "r-walk",
    sourceLabel: "Voice note",
    sourcePhrase: "the voice note",
    capturedAt: "Today",
    capturedPhrase: "today",
    duration: "4:12",
    scrap:
      "So the call on Tuesday, the one with the Oslo agency. I had a whole deck ready and I just didn't open it. I asked them one question, what would make you fire us in six months, and they talked for forty minutes. We signed Thursday. I think the deck was for me, not for them.",
    state: "ready",
    failure: "",
    adaptedFrom: null,
    pickId: "a-walk-1",
    pickNote: "start here. it has the turn",
    angles: [
      {
        id: "a-walk-1",
        hook: "I had a 30-slide deck ready for the Oslo call. I never opened it.",
        kind: "Story",
        shape: "Short post",
        why: "You did one thing, something happened, and you already said what it meant. All three beats are in the take.",
      },
      {
        id: "a-walk-2",
        hook: "The one question I now ask every agency before I pitch them.",
        kind: "Opinion",
        shape: "Thread",
        why: "The question is reusable. People save a thread they can copy into their own next call.",
      },
      {
        id: "a-walk-3",
        hook: "Forty minutes of listening closed what a deck never had.",
        kind: "Behind the scenes",
        shape: "Carousel",
        why: "Shorter and less personal. Use it if the story feels like too much for LinkedIn.",
      },
    ],
  },
  {
    id: "r-pasted",
    sourceLabel: "Pasted post",
    sourcePhrase: "the pasted post",
    capturedAt: "Yesterday",
    capturedPhrase: "yesterday",
    scrap:
      "Hot take: weekly reporting is theatre. Nobody reads the deck. Send one number and one sentence and see who replies.",
    state: "ready",
    failure: "",
    adaptedFrom: { url: "https://x.com/maren_builds/status/1", handle: "maren_builds" },
    pickId: "a-pasted-1",
    angles: [
      {
        id: "a-pasted-1",
        hook: "I tried Maren's one-number report on my own team. Two people replied for the first time.",
        kind: "Story",
        shape: "Short post",
        why: "It is her idea and your result. The result is what makes it yours to post.",
      },
      {
        id: "a-pasted-2",
        hook: "What a weekly report is actually for, after eight years of writing them.",
        kind: "Opinion",
        shape: "Essay",
        why: "You have more to say than a post holds. This is the long version, for a newsletter.",
      },
    ],
  },
  {
    id: "r-merge",
    sourceLabel: "Merged pull request",
    sourcePhrase: "the merged pull request",
    capturedAt: "Mon",
    capturedPhrase: "Monday",
    scrap:
      "Cut onboarding email to one question. 28 assertions, green production build, zero lint warnings, 214 passing tests.",
    state: "ready",
    failure: "",
    adaptedFrom: null,
    pickId: "a-merge-1",
    angles: [
      {
        id: "a-merge-1",
        hook: "I cut our onboarding email down to one question. Replies went from 6 to 31.",
        kind: "Announcement",
        shape: "Short post",
        why: "The number carries it. Your median for a week is 6.",
        status: "drafted",
      },
      {
        id: "a-merge-2",
        hook: "214 tests and zero warnings, and the change that mattered was one sentence.",
        kind: "Teardown",
        shape: "Thread",
        why: "For the builders who follow you. It shows the work, not only the result.",
      },
    ],
  },
  {
    id: "r-failed",
    sourceLabel: "Voice note",
    sourcePhrase: "the voice note",
    capturedAt: "Sun",
    capturedPhrase: "Sunday",
    duration: "0:06",
    scrap: "Okay so the thing about the — hang on.",
    state: "failed",
    failure: "It stops after six seconds, before the thought does.",
    adaptedFrom: null,
    angles: [],
  },
]

/**
 * What comes back for a new riff in this prototype, in place of the model
 * call. Ids are derived from the riff so two recordings never collide.
 */
export function cannedAngles(riffId: string): { angles: Angle[]; pickId: string; pickNote: string } {
  return {
    pickId: `${riffId}-1`,
    pickNote: "this one. it has a number",
    angles: [
      {
        id: `${riffId}-1`,
        hook: "I moved our standup to 4pm for a month. Three people stopped skipping it.",
        kind: "Story",
        shape: "Short post",
        why: "One change, one result you can count. It reads in three beats as it is.",
      },
      {
        id: `${riffId}-2`,
        hook: "Why the morning standup is a habit, not a decision.",
        kind: "Opinion",
        shape: "Thread",
        why: "The argument under the story. Post it a few days after, if the first one lands.",
      },
    ],
  }
}

/** What a new voice note transcribes to, in this prototype. */
export const CANNED_TRANSCRIPT =
  "We moved standup to four in the afternoon, mostly as a joke. A month later the three people who always skipped it are there every day. I think the morning one was for me."
