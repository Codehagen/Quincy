/**
 * The lab's queue: the shipped fixture riffs (app/prototypes/ideas/data.ts)
 * plus the cases a pretty queue hides. All fictional; nothing here is a
 * real post or a real account.
 *
 * Added, and why:
 * - **#212**, first, with the three ideas the landing picture shows, so the
 *   reference and every direction can be read against the same material.
 * - **A long meeting** (over 600 characters, three ideas, a 90-character
 *   hook): the worst row title and the passage clip in RiffCard.
 * - **One being read** and **one that failed**: the two states a queue of
 *   ready riffs never shows.
 * - **Two older ones**, so the queue runs past the 6-row cap.
 *
 * `READINGS` is the sentence each idea stands on. Not on `Angle` yet
 * (quincy-riffs.md, "Data gaps"); written here so the directions that mark
 * the material up can be judged. A line that is not verbatim in its scrap
 * is dropped at load (`readingsFor`), the way the card would ignore it.
 */

import type { Riff } from "@/lib/riffs"
import type { AngleReading } from "@/components/quincy"

import { RIFFS as SHIPPED } from "../ideas/data"

const PR_212: Riff = {
  id: "pr-212",
  scrap:
    "Merged #212: onboarding goes from nine screens to three. We deleted six questions we had asked every new person since launch: team size, role, goals, how they heard of us, what they post, how often. People who finished signup went from 41% to 68% in the week after. None of the six answers was ever read by anything. Onboarding had become a list of things we were afraid to skip.",
  sourceId: "github",
  sourceLabel: "GitHub",
  capturedAt: "Today",
  state: "ready",
  failure: "",
  stuck: false,
  adaptedFrom: null,
  angles: [
    {
      id: "pr-212-1",
      hook: "The six questions we stopped asking",
      shape: "Thread",
      kind: "Story",
      why: "Six named questions is a list people check against their own signup. Each one is a post in the thread.",
    },
    {
      id: "pr-212-2",
      hook: "41% → 68% in a week",
      shape: "Short post",
      kind: "Behind the scenes",
      why: "A number against your own before, and one sentence on what changed. The shape that gets read to the end.",
    },
    {
      id: "pr-212-3",
      hook: "Onboarding is a list of things you’re afraid to skip",
      shape: "Short post",
      kind: "Opinion",
      why: "Your last line is already a claim other founders will argue with. That is the reply thread you want.",
    },
  ],
}

const MEETING: Riff = {
  id: "meeting",
  scrap:
    "…so, the agency call. Mette said the thing that keeps coming up: their clients don't want more posts, they want to stop being embarrassed by the posts they already have. Every account they take over has eighteen months of half-finished drafts in a Notion page nobody opens. They spend the first two weeks just reading. She asked if Quincy could do that reading, and I said it already does, but we never say so. We sell the writing. Nobody buys writing, they buy not having to think about it. The other thing: three of her five clients post from the founder's account, never the company page, because the company page gets nothing. That matches what we see. Then twenty minutes on invoicing, which is not a post.",
  sourceId: "calendar",
  sourceLabel: "Meeting",
  capturedAt: "Today",
  state: "ready",
  failure: "",
  stuck: false,
  adaptedFrom: null,
  angles: [
    {
      id: "meeting-1",
      hook: "Every agency we talk to spends its first two weeks reading eighteen months of half-finished drafts",
      shape: "Thread",
      kind: "Story",
      why: "A specific number of months and a specific place (the Notion page) makes this recognisable to anyone who has inherited an account.",
    },
    {
      id: "meeting-2",
      hook: "Nobody buys writing. They buy not having to think about it.",
      shape: "Short post",
      kind: "Opinion",
      why: "Two short sentences that disagree with how the category sells itself. You said it out loud; it already sounds like you.",
    },
    {
      id: "meeting-3",
      hook: "Three of five clients post from the founder, never the company page",
      shape: "Carousel",
      kind: "Behind the scenes",
      why: "A count from real accounts. One slide per client is the proof, and the last slide is the rule.",
    },
  ],
}

const WORKING: Riff = {
  id: "working",
  scrap: "…ok, so the thing about the pricing page is that nobody reads past the first plan, and",
  sourceId: "voice",
  sourceLabel: "Voice notes",
  capturedAt: "Today",
  state: "working",
  failure: "",
  stuck: false,
  adaptedFrom: null,
  angles: [],
}

const FAILED: Riff = {
  id: "failed",
  scrap: "Standup. Moved the release to Thursday. Lars is out Friday. Need the new invoices before the 20th.",
  sourceId: "slack",
  sourceLabel: "Slack",
  capturedAt: "2 days ago",
  state: "failed",
  failure: "It was mostly scheduling, with nothing that happened in it.",
  stuck: false,
  adaptedFrom: null,
  angles: [],
}

const OLDER: Riff[] = [
  {
    id: "older-1",
    scrap:
      "Ran the cost report for October. Model spend per published post went from 31 cents to 9 after we stopped drafting angles nobody picked. Same output, a third of the bill.",
    sourceId: "voice",
    sourceLabel: "Voice notes",
    capturedAt: "9 Nov",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: null,
    angles: [
      {
        id: "older-1-1",
        hook: "31¢ → 9¢ per post. We stopped writing what nobody picked.",
        shape: "Short post",
        kind: "Behind the scenes",
        why: "A cost number against your own last month. Founders save these.",
      },
    ],
  },
  {
    id: "older-2",
    scrap:
      "Saved a post about 'build in public is dead'. I don't think it's dead, I think the boring half of it is: the weekly MRR screenshot. The half that works is showing a decision while it is still a decision.",
    sourceId: "x",
    sourceLabel: "X",
    capturedAt: "7 Nov",
    state: "ready",
    failure: "",
    stuck: false,
    adaptedFrom: { url: "https://x.com/example/status/1", handle: "example" },
    angles: [
      {
        id: "older-2-1",
        hook: "Build in public isn’t dead. The MRR screenshot is.",
        shape: "Short post",
        kind: "Opinion",
        why: "A reply to a take people already saw, with a line they can quote.",
      },
      {
        id: "older-2-2",
        hook: "Show the decision while it is still a decision",
        shape: "Essay",
        kind: "Opinion",
        why: "Long enough to show two of your own undecided calls as examples.",
      },
    ],
  },
]

/** Newest first, as `listRiffs` orders them. */
export const LAB_RIFFS: Riff[] = [PR_212, MEETING, WORKING, ...SHIPPED.slice(0, 2), FAILED, ...SHIPPED.slice(2), ...OLDER]

const LINES: Record<string, AngleReading> = {
  "pr-212-1": { line: "We deleted six questions we had asked every new person since launch: team size, role, goals, how they heard of us, what they post, how often.", note: "name all six" },
  "pr-212-2": { line: "People who finished signup went from 41% to 68% in the week after.", note: "the number, on its own" },
  "pr-212-3": { line: "Onboarding had become a list of things we were afraid to skip.", note: "this is the claim" },
  "meeting-1": { line: "Every account they take over has eighteen months of half-finished drafts in a Notion page nobody opens.", note: "everyone has this page" },
  "meeting-2": { line: "Nobody buys writing, they buy not having to think about it.", note: "you said it first" },
  "meeting-3": { line: "three of her five clients post from the founder's account, never the company page, because the company page gets nothing.", note: "a count, not a hunch" },
  "pricing-1": { line: "Charging per seat would punish the exact customer we want.", note: "show the maths" },
  "pricing-2": { line: "the value does not scale with headcount, it scales with how much gets published.", note: "the argument" },
  "sources-1": { line: "Ett rutenett som blander output, input og chat blir en liste ingen kan lese: plattform er et filter, ikke en taksonomi.", note: "before and after" },
  "retreat-1": { line: "Skrivingen er den enkle delen nå.", note: "the turn" },
  "rhythm-1": { line: "24 rhythms grouped by function instead of by platform, nuqs for the filter state so a filtered view is shareable.", note: "one grid, two ways" },
  "onboarding-1": { line: "Aktivering gikk fra 31% til 58% på to uker.", note: "number on its own line" },
  "onboarding-2": { line: "Turen forklarte produktet; snarveien leverte det.", note: "the before and after" },
  "bug-1": { line: "we paid for the same work twice because nothing wrote down that it had already been done.", note: "both bugs, one shape" },
  "older-1-1": { line: "Model spend per published post went from 31 cents to 9 after we stopped drafting angles nobody picked.", note: "against last month" },
  "older-2-1": { line: "I think the boring half of it is: the weekly MRR screenshot.", note: "quotable" },
  "older-2-2": { line: "The half that works is showing a decision while it is still a decision.", note: "the essay" },
}

/** The readings for one riff, keeping only lines that are verbatim in its scrap. */
export function readingsFor(riff: Riff): Record<string, AngleReading> {
  const out: Record<string, AngleReading> = {}
  for (const a of riff.angles) {
    const r = LINES[a.id]
    if (r && riff.scrap.includes(r.line)) out[a.id] = r
  }
  return out
}

/** Posts each shape writes for the lab's account (X and LinkedIn connected). */
export const WRITES = { "Short post": 2, Thread: 1, Carousel: 1, Essay: 0 } as const

/** Channels each riff reaches none of, as the shipped fixture page has it. */
export const GAPS: Record<string, { id: string; label: string }[]> = {
  pricing: [{ id: "linkedin", label: "LinkedIn" }],
}
