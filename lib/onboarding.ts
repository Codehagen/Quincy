import { asc, desc, eq } from "drizzle-orm"

import { getBrainByKind, getPage } from "./brain"
import {
  isChannelEnabled,
  isConnectableChannel,
  listConnections,
} from "./channels"
import { corpusSummary, DEFAULT_MAX_POSTS } from "./corpus-x"
import { db } from "./db"
import { riff, riffAngle } from "./schema-app"

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
    "Which is the problem: right now I know nothing about you, so anything I drafted would sound like a model wrote it. Three questions fixes most of that.\n\nA minute, maybe two. You can change any answer later, and none of this publishes anything.",
  ]
}

/**
 * What Quincy says once the three are answered, before the wiring appears
 * underneath it.
 *
 * The transition used to be a hard swap — the last answer went in and the
 * screen became a settings page mid-sentence. The conversation stays on
 * screen and this is the turn that hands over.
 *
 * **It no longer claims a riff exists.** It used to open "That is in your riffs
 * now, with a few angles on it", because the fourth question had just made one.
 * The material ask moved after the read, so at this moment there is nothing in
 * riffs — and a closing line that describes work Quincy has not done is the one
 * kind of sentence this product cannot afford.
 */
export const CLOSING =
  "That is the talking done, and it is the last of the questions.\n\nOne thing I need from you before I can write anything: somewhere to publish, and permission to read how you already write."

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
] as const

/**
 * The material ask, which is no longer one of the questions.
 *
 * **It used to be question four, and being fourth was the whole problem.** A
 * product somebody met sixty seconds ago asked them to produce this week's work
 * from memory, before it had done a single thing for them. The real answer on
 * 2026-08-16 was "Shipped about Quincy" — four words — and the angle model
 * could only hand them back in a full sentence. Nobody should be blamed for
 * that answer; it is what a cold ask earns.
 *
 * It is asked after the corpus read now, and the read is what makes it a
 * different question. Quincy can name the themes it just found and ask what is
 * new against them, which is a question somebody wants to answer because the
 * asker has demonstrably been listening. It also means the angles are cut once,
 * against a brain that holds the voice — rather than cut cold and re-cut later,
 * which is the model call this move deletes.
 *
 * The plain form is not a fallback for failure. Somebody who never connects X
 * gets it, and it is the same question minus the evidence.
 */
export function materialAsk(receipt: CorpusReceipt | null): string {
  const themes = receipt?.stories.map((story) => story.title.trim()).filter(Boolean) ?? []

  if (themes.length < 2) {
    return "So — what did you ship or figure out this week? Tell me what changed and what it was like. The detail is what I write from, so a couple of sentences beats a headline."
  }

  const last = themes[themes.length - 1]
  const rest = themes.slice(0, -1)

  return `So — you keep coming back to ${rest.join(", ")} and ${last}. What happened this week? Tell me what changed and what it was like; the detail is what I write from.`
}

/**
 * The shortest answer worth spending a model call on.
 *
 * Not a style rule — a floor under the input. Below this there is nothing in
 * the scrap but a topic, and the angle that comes back is the topic again in a
 * full sentence.
 *
 * **Kept, but expected to stop firing.** The guard was written when this was a
 * cold question and thin answers were the norm; asked after the read it should
 * be rare. It stays for a release so we can see whether it ever fires. If it
 * does not, it goes — a validation error that never fires is a rule nobody
 * needed, and one that fires often would mean the move above did not work.
 */
export const MIN_MATERIAL_CHARS = 80

export function isThinMaterial(text: string): boolean {
  return text.trim().length < MIN_MATERIAL_CHARS
}

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
/**
 * The newest riff's id, for the re-cut after the corpus read.
 *
 * Same row `latestRiffScrap` reads, and separate rather than widened because
 * that function is on the interview's hot path and returns exactly what the
 * transcript renders. A caller wanting the id is asking a different question.
 */
export async function latestRiffId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: riff.id })
    .from(riff)
    .where(eq(riff.userId, userId))
    .orderBy(desc(riff.createdAt))
    .limit(1)

  return row ? row.id : null
}

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
/**
 * **Every question is a brain page again**, which is what moving the material
 * ask out bought. There used to be a fourth whose answer was a riff, so this
 * function took it as an argument and broke its own loop on it — progress
 * derived from two sources with a special case joining them. Now the three
 * pages are the three answers.
 */
export async function readInterview(userId: string): Promise<InterviewState> {
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
  /**
   * Held back from first run on purpose, whatever the credentials say.
   *
   * This is not `!connectable` under another name. That field answers "can this
   * deployment do it"; this one answers "should first run ask for it yet", and
   * the two disagree for LinkedIn right now — the credentials exist and the
   * handshake works, and it is still the wrong second ask. First run has one
   * job, which is to get X connected so the corpus read can happen and Quincy
   * can show it knows who you are. A second consent screen before that has paid
   * off is the ask that gets both refused.
   *
   * LinkedIn stays connectable from /channels for anyone who wants it there.
   */
  soon?: boolean
}

const CHANNEL_COPY: Record<
  string,
  { label: string; grant: string; alsoBuys?: string; soon?: boolean }
> = {
  x: {
    label: "X",
    grant:
      "Quincy will be able to publish posts as you, and read back the ones it published so it can report how they did.",
    /**
     * Interpolated, never typed out. This sentence is the consent somebody
     * reads before granting X, so it has to state the real cap — and a number
     * written by hand here would go stale the first time the cap moved, which
     * it did on 2026-08-16.
     */
    alsoBuys: `Reading your last ${DEFAULT_MAX_POSTS} posts to learn how you write`,
  },
  linkedin: {
    label: "LinkedIn",
    grant:
      "Quincy will be able to publish posts as you. It cannot read your feed, your existing posts, or your engagement.",
    soon: true,
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

/**
 * What the corpus read learned, in a shape the screen can read back.
 *
 * This is the answer to "who does Quincy think I am", and it is the whole
 * reason the read is worth a minute of somebody's first two. The read used to
 * report a count — "Read 187 posts. I wrote 9 voice rules and 4 stories." — and
 * a count is a receipt for work done, not evidence that anything was
 * understood. A person who has just handed over their timeline wants the second
 * one.
 *
 * The three parts are what `compileVoice` writes, read back rather than
 * re-derived: the portrait is the paragraph on `voice/x`, the rules are its
 * `data.rules`, and the stories are the `story` pages. Nothing here spends, and
 * nothing here is generated for the screen — every sentence shown is a sentence
 * that is now on a brain page the person can open and edit.
 */
export type CorpusReceipt = {
  /** The `voice/x` portrait: who Quincy now thinks it is writing as. */
  portrait: string
  rules: string[]
  stories: { slug: string; title: string; point: string }[]
}

export async function corpusReceipt(
  userId: string
): Promise<CorpusReceipt | null> {
  const [voice, stories] = await Promise.all([
    getPage(userId, "voice/x"),
    getBrainByKind(userId, "story"),
  ])

  // No `voice/x` means the compile never wrote one — a corpus too thin for any
  // rule at all. Null rather than an empty receipt, so the caller says "I could
  // not learn much" instead of rendering three empty headings.
  if (!voice) return null

  const rules = Array.isArray((voice.data as { rules?: unknown })?.rules)
    ? (voice.data as { rules: string[] }).rules.filter(Boolean)
    : []

  return {
    portrait: (voice.body ?? "").trim(),
    rules,
    stories: stories
      .map((page) => ({
        slug: page.slug,
        title: page.title ?? page.slug,
        point: String((page.data as { point?: unknown } | null)?.point ?? ""),
      }))
      // A story with no point is a page mid-write, not something to show off.
      .filter((story) => story.point.trim().length > 0),
  }
}

/**
 * The angles on the first riff — what Quincy would actually post.
 *
 * The read tells somebody Quincy understands them. This is the step that shows
 * it is *for* something, and it is the last beat of first run before the exits:
 * a portrait with no proposal is a personality test.
 *
 * **Nothing is generated here.** These angles were written when question four
 * was answered, by the model call `writeFirstRiff` already paid for. Reading
 * them back costs one query and no money — and generating a fresh set after the
 * corpus read would spend again to produce a worse list, because the material
 * has not changed.
 *
 * Empty is a real answer, not a failure: the angle call can fail while the riff
 * survives, which is deliberate (`writeFirstRiff` returns ok so the material is
 * never lost). The screen says nothing rather than showing an empty heading.
 */
export type Suggestion = {
  id: string
  hook: string
  shape: string
  why: string
}

export async function firstRiffSuggestions(
  userId: string
): Promise<Suggestion[]> {
  const [newest] = await db
    .select({ id: riff.id })
    .from(riff)
    .where(eq(riff.userId, userId))
    .orderBy(desc(riff.createdAt))
    .limit(1)

  if (!newest) return []

  return db
    .select({
      id: riffAngle.id,
      hook: riffAngle.hook,
      shape: riffAngle.shape,
      why: riffAngle.why,
    })
    .from(riffAngle)
    .where(eq(riffAngle.riffId, newest.id))
    .orderBy(asc(riffAngle.position))
}

/** At most this many themes in the proposed line. Four is a sentence; eight is a list. */
const THEME_CAP = 4

/**
 * What the read has learned about *who somebody is*, offered as an addition to
 * their own answer rather than a replacement for it.
 *
 * The first question's answer is often four words — "Im building Quincy" — and
 * after a 200-post read Quincy knows a great deal more than that. The rail goes
 * on showing the four words, which is the right default and the wrong resting
 * place.
 *
 * **It appends, and it never overwrites.** `human` is written
 * `provenance: "user"`, and `compileVoice` skips user-owned pages on purpose —
 * that rule is why a stated "English" survives a read that could infer
 * otherwise, and it is not worth trading for a better first paragraph. So this
 * returns a sentence for a person to accept, their own words stay first, and
 * the write only happens if they press the button.
 *
 * Derived from the story titles rather than composed by a model: the themes are
 * already the model's own reading of the corpus, and paying for a second call
 * to rephrase its own output is spend with no new information in it. It is also
 * visibly derived, which is the honest register for a claim about somebody.
 *
 * Null below two themes — one theme is a topic, not a portrait, and a sentence
 * built on it would overstate what the read found.
 */
export function humanAddition(receipt: CorpusReceipt | null): string | null {
  if (!receipt) return null

  /**
   * Titles are used exactly as the compile wrote them, capitals and all.
   *
   * Lowercasing the first letter reads better mid-sentence, and there is no
   * rule that can do it safely: "Weekend MVPs" wants it and "Quincy" does not,
   * and nothing in the string distinguishes a title-cased common word from
   * somebody's name. Getting a name wrong inside a sentence about who they are
   * is a worse failure than a capital letter in the middle of one — and left
   * alone, the capitals read as the theme names they are.
   */
  const themes = receipt.stories
    .map((story) => story.title.trim())
    .filter(Boolean)
    .slice(0, THEME_CAP)

  if (themes.length < 2) return null

  const last = themes[themes.length - 1]
  const rest = themes.slice(0, -1)

  return `Your posts keep coming back to ${rest.join(", ")} and ${last}.`
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
