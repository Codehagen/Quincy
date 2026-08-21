import type { Node } from "../rhythm/data"

/**
 * One firing of Atomize: Sunday's essay, seventeen pieces, nine of them out.
 *
 * The numbers here are the same numbers the rhythm's card and its detail page
 * show. That sounds obvious; it is the third time in this exploration that a
 * screen has quietly disagreed with the screen that opened it, so the fixture
 * is deliberately shared rather than re-invented.
 */

export const RUN = {
  rhythm: "Atomize",
  rhythmId: "atomize",
  date: "Sun 2 Aug",
  source: "The quiet months",
  sourceChannel: "substack" as Node,
  sourceWords: 1840,
  /** Your usual first-day reach, so a number has something to mean against. */
  median: 1200,
}

export type PieceState = "published" | "scheduled" | "draft"

export type Piece = {
  id: string
  channel: Node
  form: string
  /** The first line. In an interest-based feed this is most of the outcome. */
  hook: string
  state: PieceState
  /** When it went out, or when it is due. */
  at?: string
  views?: number
}

export const PIECES: Piece[] = [
  {
    id: "x-1",
    channel: "x",
    form: "Thread",
    hook: "I had three quiet months. Here is what I actually learned.",
    state: "published",
    at: "Mon 09:00",
    views: 8400,
  },
  {
    id: "x-2",
    channel: "x",
    form: "Post",
    hook: "Nobody tells you the quiet months are the ones that compound.",
    state: "published",
    at: "Tue 09:00",
    views: 21300,
  },
  {
    id: "x-3",
    channel: "x",
    form: "Post",
    hook: "Revenue was flat for a quarter. I kept shipping anyway.",
    state: "published",
    at: "Wed 09:00",
    views: 1900,
  },
  {
    id: "x-4",
    channel: "x",
    form: "Post",
    hook: "The quiet months are not a plateau. They are the build.",
    state: "scheduled",
    at: "Thu 09:00",
  },
  {
    id: "x-5",
    channel: "x",
    form: "Post",
    hook: "Three months of no growth taught me more than the good quarter.",
    state: "draft",
  },
  {
    id: "li-1",
    channel: "linkedin",
    form: "Long post",
    hook: "For a quarter, nothing moved. Here is what I did with it.",
    state: "published",
    at: "Tue 08:00",
    views: 4700,
  },
  {
    id: "li-2",
    channel: "linkedin",
    form: "Carousel",
    hook: "Five things the flat quarter taught me",
    state: "scheduled",
    at: "Thu 08:00",
  },
  {
    id: "th-1",
    channel: "threads",
    form: "Opener",
    hook: "quiet months hit different when you stop counting",
    state: "published",
    at: "Mon 17:00",
    views: 3100,
  },
  {
    id: "th-2",
    channel: "threads",
    form: "Opener",
    hook: "flat quarter. still shipped every week. ask me anything",
    state: "published",
    at: "Wed 17:00",
    views: 900,
  },
  {
    id: "th-3",
    channel: "threads",
    form: "Opener",
    hook: "the build looks like nothing from the outside",
    state: "draft",
  },
  {
    id: "ig-1",
    channel: "instagram",
    form: "Carousel",
    hook: "What a flat quarter actually looks like",
    state: "published",
    at: "Tue 12:00",
    views: 6200,
  },
  {
    id: "ig-2",
    channel: "instagram",
    form: "Reel",
    hook: "Three months. No growth. Kept going.",
    state: "scheduled",
    at: "Fri 12:00",
  },
  {
    id: "ig-3",
    channel: "instagram",
    form: "Reel",
    hook: "Nobody posts about the quiet quarter",
    state: "draft",
  },
  {
    id: "tt-1",
    channel: "tiktok",
    form: "Vertical cut",
    hook: "My revenue did not move for three months",
    state: "published",
    at: "Mon 18:00",
    views: 34800,
  },
  {
    id: "tt-2",
    channel: "tiktok",
    form: "Vertical cut",
    hook: "The quiet months are the build",
    state: "draft",
  },
  {
    id: "yt-1",
    channel: "youtube",
    form: "Short",
    hook: "What a flat quarter teaches a founder",
    state: "published",
    at: "Tue 16:00",
    views: 2400,
  },
  {
    id: "sub-1",
    channel: "substack",
    form: "Note",
    hook: "New essay: the quiet months",
    state: "draft",
  },
]

export const STATE_LABEL: Record<PieceState, string> = {
  published: "Published",
  scheduled: "Scheduled",
  draft: "In drafts",
}

export const PUBLISHED = PIECES.filter((p) => p.state === "published")
export const SCHEDULED = PIECES.filter((p) => p.state === "scheduled")
export const DRAFTS = PIECES.filter((p) => p.state === "draft")

/** Where the piece lives now, so a row can deep-link instead of duplicating. */
export const STATE_HREF: Record<PieceState, string> = {
  published: "/numbers",
  scheduled: "/lineup",
  draft: "/drafts",
}
