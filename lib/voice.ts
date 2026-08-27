import { createIdGenerator, generateObject, jsonSchema } from "ai"
import { and, eq, inArray, sql } from "drizzle-orm"

import {
  appendEvent,
  getBrainByKind,
  getPage,
  putPage,
  RULE_CAP,
  type StoryData,
  type VoiceData,
} from "./brain"
import { db } from "./db"
import {
  classifyEdit,
  clearClass,
  normaliseRule,
  recordEdits,
  ruleOfferFor,
  RULE_FOR_CLASS,
  type EditClass,
  type EditLedger,
  type RuleOffer,
} from "./edit-classes"
import { brainPage, sourceItem, type SourceItemSource } from "./schema-app"
import {
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
} from "./structured-output"
import { recordUsage } from "./usage"
import { measureHabits, describeHabits } from "./voice-habits"
import { REASONING } from "./model-options"

/**
 * The voice compile: corpus in, brain pages out. See plans/011.
 *
 * The counterpart to lib/corpus-x.ts and the same split as capture/heartbeat:
 * ingest is deterministic and cheap to retry, judgment happens here, once,
 * deliberately. This is the only model call in the corpus pipeline.
 *
 * Everything written carries provenance `published` — the user did write these
 * posts, publicly — which is what lets a story page carry `proof` URLs under
 * lib/brain.ts's rule that unreviewed extraction may not.
 */

const MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"

/**
 * Enough posts to hear a voice, few enough to fit one call. The corpus import
 * caps what comes in; this caps what one compile reads, newest first, because
 * the recent posts are the voice the user has now rather than the one they
 * had in 2019.
 */
const MAX_ITEMS = 300

/** A post longer than this is truncated in the prompt. X long-form and
 *  LinkedIn articles land in the same table; the compile reads habits, not
 *  whole essays. */
const MAX_POST_CHARS = 4_000
/** Total prompt budget. Stops a large archive from becoming an unbounded
 *  (or context-overflowing) model call. */
const MAX_PROMPT_CHARS = 120_000

/**
 * The cap `RULE_CAP` is for rules, applied here to stories. Each story is
 * ~4 sequential Neon writes and, once written, a permanent line in every
 * future chat prompt's story index — an unbounded list from one compile
 * would grow that index forever. JSON-schema `minItems`/`maxItems` are
 * unusable through the Gateway (see lib/meetings.ts), so the bound has to
 * live in code, same as `RULE_CAP` does.
 */
const STORY_CAP = 12

const EXTRACT_PROMPT = `You study a writer's published posts and describe how they write.

From the posts below, produce:

1. "portrait" — two or three sentences describing how this person writes, in
   plain prose. Specific enough that a stranger could pick their post out of a
   lineup.
2. "rules" — up to ${RULE_CAP} short imperative rules a ghostwriter would need
   to sound like them. Each rule must be evidenced by the posts: habits of
   rhythm and structure, openers and closers they actually use, and observed
   absences ("never uses hashtags") only when the corpus shows them. No
   generic writing advice — a rule that would fit any competent writer is
   noise.

   A rule states a habit and how wide it runs. It never mandates one exact
   token on every post. If the corpus shows a recurring emoji, sign-off,
   opener or catchphrase, write the rule as a range with its frequency and
   the variants you actually saw — "closes maybe a third of posts with a
   short rallying line; observed: 'Lets gooo', 'Im back baby ✨', a bare '✨'"
   — never as "close every post with ✨". Count before you claim: a habit in
   a quarter of the posts is "sometimes", not "always". A rule that would
   make every future post open or close the same way is the one mistake this
   list must not contain.
3. "stories" — recurring narratives: things they keep returning to across
   multiple posts. For each: a short title, the point it makes, the hook they
   open it with (verbatim from a post where possible), quotes (verbatim, never
   paraphrased), the URLs of the posts it appears in, and a one-word theme.

Never invent a detail. If a date, number or name is not in the posts, leave it
out. Quote the user verbatim — do not clean up their phrasing. Returning few
rules and no stories is the correct answer for a thin corpus.`

export type VoiceExtraction = {
  portrait: string
  rules: string[]
  stories: {
    title: string
    point: string
    hook: string
    quotes: string[]
    proofUrls: string[]
    theme: string
  }[]
}

const EXTRACTION_SCHEMA = jsonSchema<VoiceExtraction>({
  type: "object",
  properties: {
    portrait: { type: "string" },
    rules: { type: "array", items: { type: "string" } },
    stories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          point: { type: "string" },
          hook: { type: "string" },
          quotes: { type: "array", items: { type: "string" } },
          proofUrls: { type: "array", items: { type: "string" } },
          theme: { type: "string" },
        },
        required: ["title", "point", "hook", "quotes", "proofUrls", "theme"],
        additionalProperties: false,
      },
    },
  },
  required: ["portrait", "rules", "stories"],
  additionalProperties: false,
})

export type VoiceUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export type VoiceExtractor = (
  posts: { url: string; postedAt: Date | null; body: string }[]
) => Promise<VoiceExtraction & { usage?: VoiceUsage }>

/** The keys EXTRACTION_SCHEMA requires, for the unwrap. */
const EXTRACTION_KEYS = ["portrait", "rules", "stories"] as const

/**
 * All three properties are checked, not just one.
 *
 * The Gateway's stringification puts the payload in the *first* property and
 * drops the rest, so on this schema `portrait` would be a plausible-looking
 * string of JSON while `rules` and `stories` were simply absent — and
 * `compileVoice` reads all three: `extraction.rules` is filtered,
 * `extraction.portrait` is trimmed into a brain page, `extraction.stories` is
 * iterated. A one-property predicate would pass a result that still throws two
 * frames later, which is the failure mode this whole file of defences exists
 * to stop.
 */
const modelExtractor: VoiceExtractor = async (posts) => {
  const spent = usageAccumulator()

  /**
   * Counted here rather than asked for in the prompt. See lib/voice-habits.ts:
   * the instruction to count has been in `EXTRACT_PROMPT` since it was written
   * and produced "close most posts with ✨" for a habit measured at 8%.
   *
   * Measured inside the default extractor rather than passed in, so
   * `VoiceExtractor` keeps its one-argument shape and every injected stub in
   * the tests and verify scripts goes on working untouched.
   */
  const habits = measureHabits(posts.map((p) => p.body))

  const { object } = await retryMalformed(
    async () => {
      const result = await generateObject({
        model: MODEL,
        providerOptions: REASONING,
        schema: EXTRACTION_SCHEMA,
        system: [EXTRACT_PROMPT, describeHabits(habits)]
          .filter(Boolean)
          .join("\n\n"),
        prompt: posts
          .map(
            (p) =>
              `[${p.postedAt?.toISOString().slice(0, 10) ?? "undated"}] ${p.url}\n${p.body}`
          )
          .join("\n\n---\n\n"),
      })

      spent.add(result.usage)

      return {
        ...result,
        object: unwrapStringifiedObject(result.object, EXTRACTION_KEYS, [
          "rules",
          "stories",
        ]),
      }
    },
    ({ object }) =>
      typeof object.portrait === "string" &&
      Array.isArray(object.rules) &&
      Array.isArray(object.stories),
    { label: "voice/extract" }
  )

  return {
    // A thin corpus legitimately produces few rules and no stories, so an
    // empty compile is a shape `compileVoice` already writes correctly. What
    // it cannot survive is a string where an array belongs.
    portrait: typeof object.portrait === "string" ? object.portrait : "",
    rules: Array.isArray(object.rules) ? object.rules : [],
    stories: Array.isArray(object.stories) ? object.stories : [],
    usage: spent.total,
  }
}

export type CompileVoiceResult = {
  userId: string
  items: number
  rulesWritten: number
  storiesWritten: number
  /** Pages left alone because the user owns them. The heartbeat rule. */
  skipped: string[]
}

/** Exported for the test, matching how the repo treats other internals. */
export function storySlug(title: string) {
  const leaf = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `story/x-${leaf || "untitled"}`
}

/**
 * Trims a compile's raw stories to `STORY_CAP`, keeping the model's own
 * order — it was asked to return the important ones first, the same
 * assumption `RULE_CAP`'s slice makes for rules.
 *
 * Exported for the test, matching how the repo treats other internals.
 */
export function capStories<T>(stories: T[]): T[] {
  return stories.slice(0, STORY_CAP)
}

/**
 * Trims the corpus to what one model call can actually read.
 *
 * `items` arrives newest first (compileVoice's ORDER BY); this preserves
 * that order rather than re-sorting, because the recent posts are the ones
 * worth keeping when something has to give. Each body is sliced to `maxPost`
 * before it counts against `maxTotal`, so one long post cannot by itself
 * crowd out everything after it.
 *
 * Exported for the test, matching how the repo treats other internals.
 */
export function budgetItems(
  items: { url: string; postedAt: Date | null; body: string }[],
  maxPost = MAX_POST_CHARS,
  maxTotal = MAX_PROMPT_CHARS
): { url: string; postedAt: Date | null; body: string }[] {
  const kept: { url: string; postedAt: Date | null; body: string }[] = []
  let total = 0

  for (const item of items) {
    const body = item.body.slice(0, maxPost)
    if (total + body.length > maxTotal) break
    kept.push({ ...item, body })
    total += body.length
  }

  return kept
}

/**
 * Compile the X corpus into the brain.
 *
 * Idempotent the way heartbeat is: nothing is consumed, and a re-run over an
 * unchanged corpus rewrites the same pages — putPage snapshots first, so even
 * a worse compile is one query from undone.
 *
 * The ownership rule is heartbeat's, verbatim (lib/heartbeat.ts:195): a page
 * whose provenance is `user` is theirs, and this function never overwrites
 * it. The new observation lands as an event on the page, needing review.
 */
export async function compileVoice({
  userId,
  extract = modelExtractor,
  sources = ["x", "x-archive"],
}: {
  userId: string
  extract?: VoiceExtractor
  sources?: SourceItemSource[]
}): Promise<CompileVoiceResult> {
  const result: CompileVoiceResult = {
    userId,
    items: 0,
    rulesWritten: 0,
    storiesWritten: 0,
    skipped: [],
  }

  const items = await db
    .select({
      url: sourceItem.url,
      postedAt: sourceItem.postedAt,
      body: sourceItem.body,
    })
    .from(sourceItem)
    .where(
      and(eq(sourceItem.userId, userId), inArray(sourceItem.source, sources))
    )
    // NULLS LAST rather than the default DESC (NULLS FIRST in Postgres): an
    // undated row (the schema allows one, for future archive imports) must
    // not win the "newest 300" window ahead of posts that actually have a
    // date.
    .orderBy(sql`${sourceItem.postedAt} desc nulls last`)
    .limit(MAX_ITEMS)

  if (items.length === 0) return result

  // The DB cap (MAX_ITEMS) bounds how many posts are candidates; the budget
  // bounds what actually reaches the model. result.items reflects the
  // budgeted set — the receipt must not claim posts the model never saw.
  const workingSet = budgetItems(items)
  result.items = workingSet.length
  if (workingSet.length === 0) return result

  const extraction = await extract(workingSet)

  // Metered here rather than inside modelExtractor: this is the one call site
  // that knows the userId, and the chat route's posture applies unchanged —
  // the compile already ran, so a bookkeeping failure must log and be
  // dropped rather than undo work that already happened.
  if (extraction.usage) {
    try {
      await recordUsage({
        userId,
        model: MODEL,
        inputTokens: extraction.usage.inputTokens,
        cachedInputTokens: extraction.usage.cachedInputTokens,
        outputTokens: extraction.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[voice] could not record usage:", cause)
    }
  }

  // The model's claims are bounded by code, not by the prompt. Rules beyond
  // the cap are dropped from the end — the prompt asked for the important
  // ones first — and a proof URL that is not in the corpus never existed.
  const rules = extraction.rules
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, RULE_CAP)
  const knownUrls = new Set(workingSet.map((i) => i.url).filter(Boolean))

  const voiceSlug = "voice/x"
  const existingVoice = await getPage(userId, voiceSlug)

  if (existingVoice?.provenance === "user") {
    await appendEvent({
      pageId: existingVoice.id,
      source: "voice-compile",
      confidence: "low",
      summary: `Compiled ${rules.length} rule(s) from ${workingSet.length} posts`,
      detail: "Not written: this page is user-owned. Needs review.",
    })
    result.skipped.push(voiceSlug)
  } else if (rules.length > 0) {
    const page = await putPage({
      userId,
      slug: voiceSlug,
      kind: "voice",
      title: "Voice — X",
      body: extraction.portrait.trim(),
      /**
       * The measurements ride along with the rules, and that is the half of
       * this fix that does not depend on the model behaving.
       *
       * `describeHabits` gives the extractor the arithmetic and asks it to
       * write honest rules; this stores the arithmetic itself, so a rule that
       * overstates anyway sits on the same page as the count that contradicts
       * it — and `renderRules` tells the drafting prompt which one wins.
       *
       * Recomputed rather than returned from `extract`, because the extractor
       * is injectable and a stub returning fabricated habits would put made-up
       * percentages on a brain page. These come from the corpus, always.
       */
      data: { rules, habits: measureHabits(workingSet.map((i) => i.body)) },
      provenance: "published",
    })
    await appendEvent({
      pageId: page.id,
      kind: "compile",
      source: "voice-compile",
      summary: `Compiled ${rules.length} rule(s) from ${workingSet.length} posts`,
    })
    result.rulesWritten = rules.length
  }

  for (const story of capStories(extraction.stories)) {
    if (!story.point.trim()) continue

    const slug = storySlug(story.title)
    const existing = await getPage(userId, slug)

    if (existing?.provenance === "user") {
      await appendEvent({
        pageId: existing.id,
        source: "voice-compile",
        confidence: "low",
        summary: `Corpus shows this story again: ${story.point.slice(0, 200)}`,
        detail: "Not written: this page is user-owned. Needs review.",
      })
      result.skipped.push(slug)
      continue
    }

    const data: StoryData = {
      point: story.point,
      hook: story.hook,
      quotes: story.quotes,
      proof: story.proofUrls.filter((url) => knownUrls.has(url)),
      useFor: [],
      theme: story.theme,
    }

    const page = await putPage({
      userId,
      slug,
      kind: "story",
      title: story.title,
      data: data as unknown as Record<string, unknown>,
      provenance: "published",
    })
    await appendEvent({
      pageId: page.id,
      kind: "compile",
      source: "voice-compile",
      summary: `Extracted from ${data.proof.length || "the"} published post(s)`,
    })
    result.storiesWritten += 1
  }

  return result
}

/**
 * Posts the user actually wrote, verbatim, for the drafting prompt.
 *
 * **The drafting call has never seen a single thing this person wrote.** It is
 * handed `IDENTITY` — "match how they actually write, not how a generic
 * ghostwriter would" — and then given only a *description* of how they write:
 * a portrait paragraph and a dozen compiled rules. Rules capture the surface
 * ("very short paragraphs", "occasional typos") and lose everything underneath
 * it: what they find worth saying, where they land a sentence, what they leave
 * out. A model following the description produces something with the right
 * shape and the wrong person in it, which is exactly the "it doesn't sound like
 * me" this exists to fix.
 *
 * Exemplars are the strongest lever there is for voice, and the corpus was
 * already sitting in `source_item` — bought and paid for by the X read, used
 * once to compile rules, and never shown to the thing doing the writing.
 *
 * **Verbatim, never summarised.** The moment these are paraphrased they become
 * more rules. The whole point is that the model reads the person's own
 * sentences.
 *
 * `about` picks *which* posts, and it matters more than it sounds. Newest-first
 * alone is a bet that a voice is one thing; it is not. The same person writes
 * differently about a release than about a plane delay, and eight of the wrong
 * eight teach a register this draft should not be in. When a topic is given,
 * half the slots go to the posts that are actually about it and half stay on
 * recency, so the block shows both how they sound *now* and how they sound
 * *about this*. Neither half alone is the voice.
 */
export const VOICE_EXAMPLE_COUNT = 8

/** Long enough to show a voice, short enough that eight of them stay cheap. */
const MAX_EXAMPLE_CHARS = 600

/**
 * Below this a post is a link drop or a one-word reply — real, and useless as a
 * demonstration of how somebody writes.
 */
const MIN_EXAMPLE_CHARS = 60

/**
 * Words carrying no topic, dropped before they can eat the term budget.
 *
 * `websearch_to_tsquery('english', …)` would strip most of these anyway — this
 * is not about the query being wrong, it is about `TOPIC_TERMS` being spent on
 * "the" and "that" instead of on the four words that say what the post is about.
 */
const STOP_WORDS = new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "his",
  "how",
  "its",
  "not",
  "one",
  "our",
  "out",
  "she",
  "that",
  "the",
  "them",
  "then",
  "they",
  "this",
  "was",
  "were",
  "what",
  "when",
  "who",
  "why",
  "will",
  "with",
  "you",
  "your",
])

/** Enough to describe an angle; past this the query stops discriminating. */
const TOPIC_TERMS = 12

/**
 * A hook turned into a Postgres text query, or "" when there is nothing to ask.
 *
 * Any-of rather than all-of. An angle is a sentence, and a sentence run through
 * `plainto_tsquery` becomes an AND of every word in it, which matches nothing —
 * the failure mode where topical selection silently degrades to "no results"
 * and nobody notices, because the recency half still returns posts.
 *
 * Built in TS rather than handed over raw so the terms are bounded and the
 * operators are ours. Every term starts with a letter or digit by construction,
 * so none of them can arrive as a `-` negation or an unbalanced quote;
 * `websearch_to_tsquery` never throws on bad input regardless, which is exactly
 * why it is the one used here and `to_tsquery` is not.
 *
 * Exported for the test.
 */
export function topicQuery(about: string, max = TOPIC_TERMS): string {
  // Anchored at both ends, so a term can hold a hyphen or an apostrophe
  // ("open-source", "doesn't") but can never begin or end with one. A leading
  // `-` is a negation to `websearch_to_tsquery` and a stray quote is a phrase
  // delimiter; both would silently change what was asked for.
  const words = about.toLowerCase().match(/[a-z0-9][a-z0-9'-]+[a-z0-9]/g) ?? []
  const kept = new Set<string>()

  for (const word of words) {
    if (STOP_WORDS.has(word)) continue
    kept.add(word)
    if (kept.size >= max) break
  }

  return [...kept].join(" or ")
}

type ExamplePost = { id: string; body: string; postedAt: Date | null }

export async function voiceExamples({
  userId,
  limit = VOICE_EXAMPLE_COUNT,
  sources = ["x", "x-archive"],
  about = "",
}: {
  userId: string
  limit?: number
  sources?: SourceItemSource[]
  /** What this draft is about, if anything. See the note on the constant. */
  about?: string
}): Promise<string[]> {
  const eligible = and(
    eq(sourceItem.userId, userId),
    inArray(sourceItem.source, sources),
    sql`length(${sourceItem.body}) between ${MIN_EXAMPLE_CHARS} and ${MAX_EXAMPLE_CHARS}`
  )
  const columns = {
    id: sourceItem.id,
    body: sourceItem.body,
    postedAt: sourceItem.postedAt,
  }

  const query = topicQuery(about)

  /**
   * Half, floored. At the default eight that is four and four; at a limit of
   * one it is zero, and recency wins — which is the right way for the blend to
   * collapse, because recency is the answer that needs no topic to be true.
   */
  const topical = query
    ? await db
        .select(columns)
        .from(sourceItem)
        .where(
          and(
            eligible,
            sql`to_tsvector('english', ${sourceItem.body}) @@ websearch_to_tsquery('english', ${query})`
          )
        )
        // Ties broken by recency, so the closest recent post beats the closest
        // old one rather than whichever the planner happened to reach first.
        .orderBy(
          sql`ts_rank_cd(to_tsvector('english', ${sourceItem.body}), websearch_to_tsquery('english', ${query})) desc, ${sourceItem.postedAt} desc nulls last`
        )
        .limit(Math.floor(limit / 2))
    : []

  const recent = await db
    .select(columns)
    .from(sourceItem)
    .where(eligible)
    // Newest first: how somebody writes now beats how they wrote two years ago,
    // and a corpus read reaches back further than a voice changes.
    .orderBy(sql`${sourceItem.postedAt} desc nulls last`)
    .limit(limit)

  // Deduped by id, because a post can be both the most recent and the most
  // relevant — and when it is, it must not take two of the eight slots.
  const chosen = new Map<string, ExamplePost>()
  for (const item of [...topical, ...recent]) {
    if (chosen.size >= limit) break
    if (!chosen.has(item.id)) chosen.set(item.id, item)
  }

  return (
    [...chosen.values()]
      // Presented newest first whichever half found them, so the block reads as
      // a timeline rather than as two lists stapled together.
      .sort(
        (a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0)
      )
      .map((item) => item.body.trim())
      .filter(Boolean)
  )
}

/**
 * ---------------------------------------------------------------------------
 * The voice as a thing that changes: the edit ledger, and the one way a rule
 * gets added without a compile. See plans/027 item 3e.
 * ---------------------------------------------------------------------------
 *
 * Everything below is bookkeeping around `brain_page`, kept in this file
 * because it is the voice's own file. The judgment — what counts as an edit,
 * when three of them become an offer — is pure and lives in
 * lib/edit-classes.ts.
 */

/**
 * Where the counters live, and why they are not on `draft_version`.
 *
 * `draft_version` has no `meta`/`jsonb` column, and there is one production
 * database (see AGENTS.md) — so adding one is a migration against live rows
 * for a counter that is three integers. `brain_page.data` is already the
 * repo's "structured state code reads", already per user, and already
 * snapshot-and-restore-able.
 *
 * A page of its own rather than the voice page itself, and that is the part
 * worth reading twice. Both real voice pages are rewritten wholesale by
 * somebody: `voice` by `RulesEditor`, which saves `{ rules }` and nothing
 * else, and `voice/x` by `compileVoice`, which saves `{ rules, habits }`. A
 * counter stored on either would be silently erased by an ordinary save — and
 * so would the preview cooldown stamp, which is a spending guard and therefore
 * the worst possible thing to lose to an unrelated button.
 *
 * It is invisible everywhere it could be seen: `renderBrain` skips a voice
 * page whose `renderRules` is empty, and `rules` here is always `[]`; the
 * brain tree lists only stories and notes beside the three singletons. So this
 * costs one row and appears in no prompt and on no screen.
 */
export const VOICE_LEDGER_SLUG = "voice/ledger"

const newLedgerId = createIdGenerator({ prefix: "bp", size: 16 })

export type VoiceLedger = {
  /** When "Show the difference" last spent money for this user. */
  previewAt?: string
  edits: EditLedger
}

const EMPTY_LEDGER: VoiceLedger = { edits: {} }

export async function readVoiceLedger(userId: string): Promise<VoiceLedger> {
  const page = await getPage(userId, VOICE_LEDGER_SLUG)
  if (!page) return EMPTY_LEDGER

  const data = page.data as Partial<VoiceLedger>
  return {
    previewAt: typeof data.previewAt === "string" ? data.previewAt : undefined,
    // Never trusted as a shape. This is jsonb read back out of a column that
    // an older version of this code wrote, which is the same contract
    // `riff.context` carries: degrade to empty, never throw on a page
    // somebody is watching.
    edits:
      data.edits && typeof data.edits === "object"
        ? (data.edits as EditLedger)
        : {},
  }
}

/**
 * Merge a patch into the ledger.
 *
 * A direct upsert rather than `putPage`, deliberately. `putPage` snapshots the
 * previous state into `brain_page_version` before every write — right for a
 * page a person edits, wrong for a counter written on every approval and every
 * preview, where it would add a row per press forever to protect a number that
 * is derived from behaviour anyway.
 *
 * Last write wins. Two approvals landing in the same millisecond can lose one
 * increment, which costs a user one extra edit before an offer appears; the
 * alternative is a transaction around a bookkeeping write on the approval
 * path, and approval is the one thing here that must not fail.
 */
export async function writeVoiceLedger(
  userId: string,
  patch: Partial<VoiceLedger>
): Promise<void> {
  const current = await readVoiceLedger(userId)
  const data: VoiceLedger & { rules: string[] } = {
    ...current,
    ...patch,
    // `assertValid` requires a rules array on a voice page, and an empty one is
    // what keeps this page out of every prompt.
    rules: [],
  }

  const now = new Date()

  await db
    .insert(brainPage)
    .values({
      id: newLedgerId(),
      userId,
      slug: VOICE_LEDGER_SLUG,
      kind: "voice",
      title: "Voice — ledger",
      body: "",
      data: data as unknown as Record<string, unknown>,
      // Not `user`: nobody wrote this and nobody should be shown it as
      // something they said. It is Quincy's own counting.
      provenance: "inferred",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [brainPage.userId, brainPage.slug],
      set: { data: data as unknown as Record<string, unknown>, updatedAt: now },
    })
}

/** Every voice page that says something, ledger excluded. */
async function realVoicePages(userId: string) {
  const pages = await getBrainByKind(userId, "voice")
  return pages.filter((page) => page.slug !== VOICE_LEDGER_SLUG)
}

/** Every rule the voice states, wherever it states it. */
function rulesOf(page: { data: Record<string, unknown> }): string[] {
  const rules = (page.data as Partial<VoiceData>).rules
  return Array.isArray(rules) ? rules.filter((r) => typeof r === "string") : []
}

/**
 * The page an accepted rule offer is written to.
 *
 * **Never the compiled page, unless the user already owns it.** `compileVoice`
 * refuses to overwrite a page whose provenance is `user` — that is the
 * ownership rule the whole brain runs on — so writing one accepted rule onto
 * `voice/x` would take the measured fifteen-rule voice away from the compiler
 * permanently, in exchange for a sentence about emoji. The user-owned `voice`
 * page is the one the brain editor already shows and the one `renderBrain`
 * already reads, so a rule written there is visible, editable and costs
 * nothing.
 */
async function ruleTarget(userId: string, channel: string) {
  const pages = await realVoicePages(userId)
  const channelPage = pages.find((p) => p.slug === `voice/${channel}`)

  const owned =
    channelPage?.provenance === "user"
      ? channelPage
      : (pages.find((p) => p.slug === "voice") ?? null)

  return {
    slug: owned?.slug ?? "voice",
    title: owned?.title ?? "Voice",
    body: owned?.body ?? "",
    data: owned?.data ?? {},
    rules: owned ? rulesOf(owned) : [],
    allRules: pages.flatMap(rulesOf),
  }
}

/**
 * Add one rule to the voice, in the user's name.
 *
 * `provenance: "user"` because a rule only ever gets here by somebody pressing
 * "Add to voice" — see `approveVersion`. That is also what makes it outrank a
 * later compile, which is correct: the user watched themselves make the same
 * edit three times and said yes.
 *
 * The cap is enforced by `putPage`, which throws a `BrainInvariantError`
 * carrying a sentence written for a person. The offer is not made at fifteen
 * rules, so reaching that throw means the voice was filled in another tab.
 */
export async function appendVoiceRule(
  userId: string,
  channel: string,
  text: string
): Promise<void> {
  const rule = text.trim()
  if (!rule) return

  const target = await ruleTarget(userId, channel)

  if (target.rules.some((r) => normaliseRule(r) === normaliseRule(rule))) return

  const page = await putPage({
    userId,
    slug: target.slug,
    kind: "voice",
    title: target.title,
    body: target.body,
    // Merged rather than replaced: the page may carry `habits` from a compile,
    // and dropping those would delete the arithmetic that outranks the rules.
    data: { ...target.data, rules: [...target.rules, rule] },
    provenance: "user",
  })

  await appendEvent({
    pageId: page.id,
    kind: "correction",
    source: "user",
    confidence: "high",
    summary: `Added a rule from a repeated edit: ${rule}`,
  })
}

/**
 * Count what the user changed, and say whether it is worth a rule yet.
 *
 * Called from `approveVersion` after the approval has already been written, so
 * a failure here can only cost a count. The caller swallows it for that reason
 * — the same posture `compileVoice` takes around `recordUsage`.
 *
 * Returns the offer rather than acting on it. **Nothing here writes a rule.**
 */
export async function noteApprovalEdit({
  userId,
  channel,
  before,
  after,
  now = new Date(),
}: {
  userId: string
  channel: string
  before: string
  after: string
  now?: Date
}): Promise<RuleOffer | null> {
  const classes = classifyEdit(before, after)
  if (classes.length === 0) return null

  const ledger = await readVoiceLedger(userId)
  const edits = recordEdits(ledger.edits, classes, now)
  await writeVoiceLedger(userId, { edits })

  const target = await ruleTarget(userId, channel)

  return ruleOfferFor({
    ledger: edits,
    targetRules: target.rules,
    allRules: target.allRules,
    cap: RULE_CAP,
    now,
    prefer: classes,
  })
}

/**
 * Answer an offer: yes writes the rule, no writes nothing.
 *
 * Both answers zero the counter, and that is the anti-nag half. Leaving the
 * count at three after a "Not now" would re-offer the same rule on the next
 * approval that touches the same habit, which turns a helpful noticing into a
 * dialog box that will not take no for an answer. Zeroed, the offer comes back
 * only after the user has made the same edit three more times — by which point
 * asking again is fair.
 */
export async function answerRuleOffer({
  userId,
  channel,
  cls,
  accept,
  text,
}: {
  userId: string
  channel: string
  cls: EditClass
  accept: boolean
  text?: string
}): Promise<void> {
  if (accept) {
    await appendVoiceRule(userId, channel, text?.trim() || RULE_FOR_CLASS[cls])
  }

  const ledger = await readVoiceLedger(userId)
  await writeVoiceLedger(userId, { edits: clearClass(ledger.edits, cls) })
}
