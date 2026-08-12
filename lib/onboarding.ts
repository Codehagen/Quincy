import { desc, eq } from "drizzle-orm"

import { getPage } from "./brain"
import {
  isChannelEnabled,
  isConnectableChannel,
  listConnections,
} from "./channels"
import { corpusSummary } from "./corpus-x"
import { db } from "./db"
import { riff } from "./schema-app"

/**
 * First run: what to ask next, and what is still unwired. See plans/022.
 *
 * The design was decided across two prototype rounds. Two of the things it
 * settled are structural rather than cosmetic, and this module is where they
 * live:
 *
 * **Progress is derived, never stored.** Which question comes next is a
 * function of which brain pages exist, so abandoning first run halfway is
 * survivable by construction — a closed laptop, a crashed tab, or the redirect
 * out to X and back all resume in the right place with no progress column to
 * keep in sync. The one piece of first-run state on the user row is
 * `onboardedAt`, and it answers a different question: have they been asked.
 *
 * **The wiring screen reads the database, not component state.** Connecting a
 * channel leaves the site entirely, so anything held in React is gone by the
 * time the person comes back. Every value below is resolved server-side on
 * each render.
 */

/**
 * What Quincy says before the first question.
 *
 * Without this the person is asked something personal by a product they have
 * met four seconds ago, with no idea how many questions are coming or what
 * happens to the answers. Tested on the first real user: "I just got RAMMED
 * into it. I didn't understand what I needed to do."
 *
 * Three things it has to establish, and no more: who is asking, why the asking
 * is necessary at all, and what it costs — length, reversibility, and that
 * none of it publishes. Anything beyond that is a wall of text in front of a
 * question.
 *
 * **The name is never asked for.** Signup requires one and Google supplies
 * one, so every account on the database has a name before it reaches here.
 * Asking for something already known is the classic onboarding tell.
 */
export function intro(firstName: string): string[] {
  return [
    `${firstName}. I'm Quincy, and I write in your name.`,
    "Which is the problem: right now I know nothing about you, so anything I drafted would sound like a model wrote it. Four questions fixes most of that.\n\nA minute, maybe two. You can change any answer later, and none of this publishes anything.",
  ]
}

/**
 * What Quincy says once the four are answered, before the wiring appears
 * underneath it.
 *
 * The transition used to be a hard swap — the last answer went in and the
 * screen became a settings page mid-sentence. The conversation stays on
 * screen and this is the turn that hands over.
 */
export const CLOSING =
  "Good. That is in your riffs now, with a few angles on it.\n\nThat is the talking done. Two practical things left, and both of them can wait."

/** The name a person is called, out of whatever they signed up with. */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0]
  // "there" rather than a blank or the email local part: an account with no
  // name should not make Quincy open with an empty string or an address.
  return first || "there"
}

/**
 * The four questions, in the order the brain needs them: who, for whom, in
 * what language, and what you have this week.
 *
 * `slug` is where the answer lands, and is also how progress is derived —
 * which is why question four has none. Its answer becomes a riff, and riffs
 * are not brain pages. It is last for that reason.
 */
export const QUESTIONS = [
  {
    id: "human",
    slug: "human",
    // No longer opens with "before I write anything in your name" — the intro
    // says that now, and a question that repeats its own preamble reads as
    // though nobody read it back.
    ask: "So: what do you actually do? One line is enough. I will get the rest wrong and you can correct me.",
    chips: [
      "I build in public and ship fast",
      "I run a company and want to write about it",
    ],
    page: "My Human",
  },
  {
    id: "reader",
    slug: "memory/who-you-write-for",
    ask: "Who is on the other end? Not a demographic. The actual person you want reading this.",
    chips: [
      "Founders and operators building real businesses",
      "Product-minded engineers",
    ],
    page: "Who you write for",
  },
  {
    id: "language",
    slug: "voice",
    ask: "One more. What language should the posts be in? However you talk to me here, the posting language is its own decision.",
    chips: ["English", "Norwegian"],
    page: "Voice",
  },
  {
    id: "material",
    slug: null,
    ask: "Last one. What did you ship or figure out this week? Anything. I will turn it into the first draft.",
    chips: [],
    page: "Riffs",
  },
] as const

export type Question = (typeof QUESTIONS)[number]
export type QuestionId = Question["id"]

export const QUESTION_IDS = QUESTIONS.map((q) => q.id) as readonly QuestionId[]

export function isQuestionId(value: string): value is QuestionId {
  return (QUESTION_IDS as readonly string[]).includes(value)
}

/**
 * Question four's answer, or null if it has not been given.
 *
 * The scrap rather than a boolean, because the transcript and the rail both
 * have to show it. Returning `true` was enough to advance past the question
 * and produced two visible faults: the last user turn rendered as an empty
 * bubble, and the rail's Riffs entry read "Saved." instead of what the person
 * had actually said. The one place first run claims to be a record of a
 * conversation cannot have a blank where the last answer goes.
 *
 * "The newest riff" rather than "the riff first run made". A brand-new account
 * has none by definition, and remembering an id would be the progress state
 * this module exists not to keep. Somebody who arrives with a riff already in
 * hand skips the last question, which is the right outcome: they have given
 * Quincy material.
 */
export async function latestRiffScrap(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ scrap: riff.scrap })
    .from(riff)
    .where(eq(riff.userId, userId))
    .orderBy(desc(riff.createdAt))
    .limit(1)

  return row ? row.scrap : null
}

/** What has been answered, and therefore what to ask next. */
export type InterviewState = {
  /** Answered questions, in order, as the transcript renders them. */
  answered: { id: QuestionId; page: string; answer: string }[]
  /** Null once every question is done. */
  next: Question | null
}

/**
 * Reads progress out of the brain.
 *
 * Three `getPage` calls rather than one `getBrainByKind` sweep: the pages sit
 * in three different kinds (identity, memory, voice), so a kind-scoped read
 * would be three queries anyway, and each of these hits the unique constraint
 * on (user_id, slug). They run concurrently.
 */
export async function readInterview(
  userId: string,
  /**
   * Question four's answer, or null if it has not been given. It writes a riff
   * rather than a page, so it cannot be derived from the brain here — the
   * caller passes it in from `latestRiffScrap`.
   */
  material: string | null
): Promise<InterviewState> {
  const [human, reader, voice] = await Promise.all([
    getPage(userId, "human"),
    getPage(userId, "memory/who-you-write-for"),
    getPage(userId, "voice"),
  ])

  // Keyed by question id, not by slug. They differ for the third question —
  // the id is `language`, the page is `voice` — and keying by slug is what
  // made the lookup miss.
  const pages = { human, reader, language: voice }
  const answered: InterviewState["answered"] = []

  for (const question of QUESTIONS) {
    if (question.id === "material") {
      if (material !== null) {
        answered.push({ id: question.id, page: question.page, answer: material })
      }
      break
    }

    const page = pages[question.id]
    if (!page) break

    answered.push({
      id: question.id,
      page: question.page,
      /**
       * `body` on every page, including voice.
       *
       * The voice page's rules live in `data`, and reading `data.rules[0]`
       * here put Quincy's phrasing in the user's bubble — somebody who typed
       * "English" was shown saying "Write all posts and drafts in English."
       * The action keeps the raw answer in `body` precisely so the transcript
       * can be a record of what was said rather than of what was inferred.
       *
       * The fallback matters for pages written before that: an empty bubble
       * reads as a lost answer.
       */
      answer:
        page.body ||
        ((page.data as { rules?: string[] } | null)?.rules?.[0] ?? ""),
    })
  }

  return {
    answered,
    next: QUESTIONS[answered.length] ?? null,
  }
}

export type ChannelState = {
  id: string
  label: string
  /** Verbatim from GRANTS in components/channels/connection-strip.tsx. */
  grant: string
  /** What connecting buys beyond permission to publish. X only. */
  alsoBuys?: string
  connected: boolean
  /**
   * Whether this deployment holds credentials for the channel. One without
   * them must not render a live Connect — that is the button that looks live
   * and does nothing, which /channels and /sources both exist not to ship.
   */
  connectable: boolean
}

const CHANNEL_COPY: Record<
  string,
  { label: string; grant: string; alsoBuys?: string }
> = {
  x: {
    label: "X",
    grant:
      "Quincy will be able to publish posts as you, and read back the ones it published so it can report how they did.",
    alsoBuys: "Reading your last 200 posts to learn how you write",
  },
  linkedin: {
    label: "LinkedIn",
    grant:
      "Quincy will be able to publish posts as you. It cannot read your feed, your existing posts, or your engagement.",
  },
}

/** In the order plan 005 takes them on. */
export const FIRST_RUN_CHANNELS = ["x", "linkedin"] as const

export type WiringState = {
  channels: ChannelState[]
  /**
   * Whether the corpus read can be offered at all. It runs through the X
   * grant, so it cannot precede it — which is the whole reason the offer lives
   * inside the channels section rather than among the sources. One consent
   * buys both, and a first run that asks for X twice has misread the product.
   */
  corpusOfferable: boolean
  /** `source_item` rows already stored. Non-zero means it has been read. */
  corpusItems: number
}

export async function readWiring(userId: string): Promise<WiringState> {
  // One query for every connection, then a lookup per row — the same trade
  // /channels already makes, rather than a Neon round trip per channel.
  const [connections, corpus] = await Promise.all([
    listConnections(userId),
    corpusSummary(userId),
  ])

  const byChannel = new Map(connections.map((c) => [c.channel, c]))

  const channels: ChannelState[] = FIRST_RUN_CHANNELS.map((id) => {
    const connection = byChannel.get(id)
    return {
      id,
      ...CHANNEL_COPY[id],
      /**
       * `active` only. A revoked or expired grant is not a connection, and
       * showing one as connected during first run leaves somebody believing
       * they wired up a channel that cannot publish.
       */
      connected: connection?.state === "active",
      connectable: isConnectableChannel(id) && isChannelEnabled(id),
    }
  })

  return {
    channels,
    corpusOfferable: channels.some((c) => c.id === "x" && c.connected),
    corpusItems: corpus.items,
  }
}
