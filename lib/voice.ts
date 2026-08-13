import { generateObject, jsonSchema } from "ai"
import { and, eq, inArray, sql } from "drizzle-orm"

import {
  appendEvent,
  getPage,
  putPage,
  RULE_CAP,
  type StoryData,
} from "./brain"
import { db } from "./db"
import { sourceItem, type SourceItemSource } from "./schema-app"
import {
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
} from "./structured-output"
import { recordUsage } from "./usage"
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

  const { object } = await retryMalformed(
    async () => {
      const result = await generateObject({
        model: MODEL,
        providerOptions: REASONING,
        schema: EXTRACTION_SCHEMA,
        system: EXTRACT_PROMPT,
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
      data: { rules },
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
