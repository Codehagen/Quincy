import type {
  CorpusReceipt,
  InterviewState,
  Suggestion,
  WiringState,
} from "@/lib/onboarding"

/**
 * Fixtures for the first-run harness. Invented, and shaped exactly like what
 * app/(welcome)/welcome/page.tsx reads, so a state here is a state a new
 * account can be in. Nothing in this file is read by the real page.
 */

/**
 * The harness's states (harness.tsx says what each one is). Here rather than
 * in the harness: a constant imported from a "use client" module into the
 * server page is a reference proxy, not the array.
 */
export const STATES = [
  "intro",
  "interview",
  "wiring",
  "reading",
  "failed",
  "read",
  "thin",
  "ideas",
] as const
export type HarnessState = (typeof STATES)[number]

export const FIRST_NAME = "Ada"

export const ANSWERS: InterviewState["answered"] = [
  { id: "human", page: "My Human", answer: "I run a two-person studio that builds tools for small newsrooms." },
  { id: "reader", page: "Who you write for", answer: "Editors at local papers who are tired of software built for someone else." },
  { id: "language", page: "Voice", answer: "English" },
]

export const RECEIPT: CorpusReceipt = {
  portrait:
    "You write like someone explaining a fix to a colleague: plain, a little dry, specific about what broke. You lead with the thing that happened and leave the lesson for the last line.",
  rules: [
    "Open with what happened, not with the lesson.",
    "One idea per post. Cut the second one and save it.",
    "Name the tool, the paper, the number. Never 'a client'.",
    "No exclamation marks.",
  ],
  stories: [
    { slug: "story/the-cms-migration", title: "The CMS migration", point: "Moving a 40-year archive without losing a single byline." },
    { slug: "story/small-newsrooms", title: "Small newsrooms", point: "Why a four-person paper needs different tools, not cheaper ones." },
  ],
}

export const SUGGESTIONS: Suggestion[] = [
  {
    id: "s1",
    shape: "Story",
    hook: "We moved 40 years of archive in a weekend. The hard part was 212 bylines with no author.",
    why: "Your best posts open on a number and a problem.",
  },
  {
    id: "s2",
    shape: "Short post",
    hook: "A four-person paper does not need cheaper software. It needs software that assumes four people.",
    why: "A line you have said three times in replies.",
  },
  {
    id: "s3",
    shape: "Thread",
    hook: "What I would tell any small paper before it touches its archive.",
    why: "Practical, and it names the paper.",
  },
]

/** The two first-run channels, with the grant sentences lib/onboarding.ts uses. */
export function channels(xConnected: boolean): WiringState["channels"] {
  return [
    {
      id: "x",
      label: "X",
      grant:
        "Quincy will be able to publish posts as you, and read back the ones it published so it can report how they did.",
      alsoBuys: "Reading your last 100 posts to learn how you write",
      connected: xConnected,
      connectable: true,
      soon: false,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      grant:
        "Quincy will be able to publish posts as you. It cannot read your feed, your existing posts, or your engagement.",
      connected: false,
      connectable: true,
      soon: true,
    },
  ]
}
