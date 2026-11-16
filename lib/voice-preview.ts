import { generateObject, jsonSchema } from "ai"
import { desc, eq } from "drizzle-orm"

import { getBrainByKind, renderBrain } from "./brain"
import { db } from "./db"
import {
  DRAFTING_MODEL,
  describeConstraints,
  type DraftTarget,
} from "./drafting"
import { REASONING } from "./model-options"
import { CHANNEL_RULES } from "./post-length"
import { CHANNELS_FOR_SHAPE } from "./riffs"
import { riff } from "./schema-app"
import {
  GenerationFailed,
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
  usageFromError,
} from "./structured-output"
import { recordUsage } from "./usage"
import { readVoiceLedger, VOICE_LEDGER_SLUG, writeVoiceLedger } from "./voice"

/**
 * "Show the difference": the same topic written twice, once with the voice in
 * the prompt and once without. See plans/027 item 3d.
 *
 * The voice page is the hardest page in the product to believe. It is fifteen
 * sentences about how somebody writes, compiled by a model out of three
 * hundred of their posts, and nothing on the page demonstrates that any of it
 * does anything. This is the demonstration: one press, two posts, side by side.
 *
 * **Nothing here is a draft.** The two posts are never written to `draft` or
 * `draft_version`, are not addressable, and disappear when the page does. That
 * is not an omission — a demonstration that quietly filled the drafts inbox
 * would make the trust exercise cost the user a cleanup.
 *
 * The money rules from AGENTS.md, all three:
 *
 * - **Ceiling.** `MAX_INPUT_BYTES` bounds what is sent and `maxOutputTokens`
 *   bounds what is bought — the thing being bought rather than the thing being
 *   kept, which is the distinction that file says `collectBookmarks` got wrong.
 * - **Cooldown.** `PREVIEW_COOLDOWN_MS`, per user, stamped *before* the call
 *   so two presses in the same second cannot both spend. A human can press
 *   this, so a claim would not be enough.
 * - **Meter.** One `usage_event` row per press, labelled.
 */

/** Ten minutes, the shape `IMPORT_COOLDOWN_MS` and `MANUAL_RUN_COOLDOWN_MS` set. */
export const PREVIEW_COOLDOWN_MS = 10 * 60 * 1000

/**
 * The prompt ceiling, in bytes rather than characters.
 *
 * A voice page is prose written by a person and can hold any script; `.length`
 * counts UTF-16 code units, and the thing being bounded is what goes over the
 * wire. `TextEncoder` counts what the gateway bills.
 */
export const MAX_INPUT_BYTES = 8 * 1024

/**
 * The topic, when the user has never riffed. Neutral on purpose: the point of
 * the demonstration is the difference between the two posts, and a topic with
 * an opinion in it would show up in both.
 */
export const FALLBACK_TOPIC = "what I shipped this week"

/** A riff's own words, cut to a topic. Longer than this is material, not a topic. */
const MAX_TOPIC_CHARS = 120

/**
 * The label on the `usage_event` row.
 *
 * AGENTS.md asks for the `model` column to carry a label so /credits can say
 * where the money went, and this is a path a person can press. The trade it
 * makes is real and worth stating: `estimateCostMicros` prices an unknown
 * string at the Sonnet rate, so a preview run on a cheaper drafting model is
 * *over*-reported. lib/pricing.ts already argues that direction is the
 * recoverable one — over-reporting trips a ceiling early, under-reporting
 * spends quietly.
 */
export const PREVIEW_USAGE_LABEL = "voice:preview"

/** Two posts, and no channel here is anywhere near this long. */
const DEFAULT_POST_CHARS = 600

export type VoicePreviewFields = {
  without: string
  with: string
  /**
   * Which of the numbered voice rules the model leaned on, if it says.
   * Optional by design — a caption naming rules is worth having and not worth
   * a retry, so an empty array is a fine answer and so is a wrong one.
   */
  rulesUsed?: string[]
}

export type PreviewUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export type PreviewGeneration = VoicePreviewFields & { usage?: PreviewUsage }

/** Injectable, so the test can read the prompts without spending anything. */
export type PreviewGenerator = (input: {
  system: string
  /** The two briefs. They differ only by the voice section. */
  prompts: { without: string; with: string }
  maxOutputTokens: number
}) => Promise<PreviewGeneration>

/** The channel's display name, from the one table that already holds it. */
export function channelLabel(channel: string): string {
  for (const targets of Object.values(CHANNELS_FOR_SHAPE)) {
    const found = targets.find((t) => t.id === channel)
    if (found) return found.label
  }
  return channel
}

function targetFor(channel: string): DraftTarget {
  return {
    id: channel,
    label: channelLabel(channel),
    rules: CHANNEL_RULES[channel] ?? { limit: null, fold: null, urlCost: null },
  }
}

/**
 * What the pair of posts may cost to generate.
 *
 * Two posts of one channel-length each is the whole product, so the ceiling is
 * `2 ×` the channel's own limit — expressed in tokens, because that is what is
 * bought. The slack covers the JSON envelope and the reasoning tokens, which
 * are billed as output; without it a ceiling that looks generous in characters
 * truncates the object and buys a failure at full price.
 */
export function maxOutputTokensFor(channel: string): number {
  const limit = CHANNEL_RULES[channel]?.limit ?? DEFAULT_POST_CHARS
  return Math.ceil((2 * limit) / 2) + 512
}

const bytes = (text: string) => new TextEncoder().encode(text).length

const PREVIEW_SYSTEM = `You are Quincy, an AI Head of Content. You are not writing a post to publish. You are writing the same post twice so that somebody can see what their voice section does to the writing.

Write "without" from brief A and "with" from brief B. The two briefs are identical except that B adds a description of how the writer sounds. Follow each brief and nothing else — do not let B leak into "without", and do not write "without" badly to flatter "with". A fair comparison is the entire point; a strawman would be worse than showing nothing.

Output the post text only in each field: no preamble, no surrounding quotes, no labels.

"rulesUsed" is the numbers of the voice rules in brief B you actually leaned on, as strings. An empty array is a correct answer.`

/**
 * The two briefs. Pure, and exported because the test asserts on them.
 *
 * **`with` is `without` plus the voice section, byte for byte.** That is the
 * whole experiment: any other difference between the two prompts — a different
 * instruction, a re-ordered constraint, a nudge toward quality — would make
 * the side-by-side a demonstration of that difference instead of a
 * demonstration of the voice, and nobody looking at the result would be able
 * to tell.
 */
export function buildPreviewPrompts({
  topic,
  channel,
  voice,
}: {
  topic: string
  channel: string
  voice: string
}): { without: string; with: string } {
  const target = targetFor(channel)

  const base = [
    `Topic: ${topic}`,
    ``,
    `Write one post about that topic for this channel:`,
    describeConstraints([target]),
  ].join("\n")

  const section = voice.trim()

  return {
    without: base,
    // Appended, never interleaved, so `with` is `without` plus one block and a
    // test can subtract one from the other. The A/B labels live in the
    // composition below rather than in the briefs, for the same reason.
    //
    // No voice to add is a real state — a new account with nothing compiled.
    // The briefs are then identical, and `previewVoice` refuses before it
    // spends anything on that comparison.
    with: section ? `${base}\n\n${section}` : base,
  }
}

/**
 * The voice rules, numbered, so `rulesUsed` has something to point at.
 *
 * Numbered here rather than in `renderBrain`, which is shared with the
 * drafting prompt: numbering rules there would invite the writer to cite them
 * in a post.
 */
export function numberVoice(rendered: string): string {
  let n = 0
  return rendered
    .split("\n")
    .map((line) => (line.startsWith("- ") ? `${++n}. ${line.slice(2)}` : line))
    .join("\n")
}

/**
 * Trim the voice section until the whole call fits the ceiling.
 *
 * Rules go from the end, the way `budgetItems` drops the oldest posts: the
 * compiled list is written most-important-first, so the last rule is the one
 * whose absence costs least. Exported for the test.
 */
export function fitToCeiling(
  { topic, channel, voice }: { topic: string; channel: string; voice: string },
  max = MAX_INPUT_BYTES
): { prompts: { without: string; with: string }; voice: string } {
  let kept = voice.trim()

  for (;;) {
    const prompts = buildPreviewPrompts({ topic, channel, voice: kept })
    const total =
      bytes(PREVIEW_SYSTEM) + bytes(prompts.without) + bytes(prompts.with)

    if (total <= max || !kept) return { prompts, voice: kept }

    const lines = kept.split("\n")
    lines.pop()
    kept = lines.join("\n").trim()
  }
}

const PREVIEW_SCHEMA = jsonSchema<VoicePreviewFields>({
  type: "object",
  properties: {
    without: { type: "string" },
    with: { type: "string" },
    // No `minItems`/`maxItems` anywhere in this schema. See `buildSchema` in
    // lib/drafting.ts: those keywords break structured output through the
    // Gateway entirely.
    rulesUsed: { type: "array", items: { type: "string" } },
  },
  required: ["without", "with", "rulesUsed"],
  additionalProperties: false,
})

const PREVIEW_KEYS = ["without", "with", "rulesUsed"] as const

/**
 * One call, two posts. The same model `draftAngle` uses, deliberately: a
 * preview generated by a different model would be a demonstration of that
 * model, and the writing the user is being asked to trust comes from this one.
 */
export const generatePreview: PreviewGenerator = async (input) => {
  const spent = usageAccumulator()

  const { object } = await retryMalformed(
    async () => {
      let result
      try {
        result = await generateObject({
          model: DRAFTING_MODEL,
          providerOptions: REASONING,
          schema: PREVIEW_SCHEMA,
          system: input.system,
          // The labels live here rather than inside the briefs, so the two
          // briefs themselves stay identical but for the voice section.
          prompt: [
            `Brief A — write "without" from this:`,
            input.prompts.without,
            `---`,
            `Brief B — write "with" from this:`,
            input.prompts.with,
          ].join("\n\n"),
          maxOutputTokens: input.maxOutputTokens,
        })
      } catch (cause) {
        // The bill survives the throw, the same way it does in
        // `generateDraft`. A generation that failed still cost tokens.
        spent.add(usageFromError(cause) ?? {})
        throw new GenerationFailed(cause, spent.total)
      }

      spent.add(result.usage)

      return {
        ...result,
        object: unwrapStringifiedObject(result.object, PREVIEW_KEYS, [
          "rulesUsed",
        ]),
      }
    },
    ({ object }) =>
      typeof object.without === "string" && typeof object.with === "string",
    { label: "voice/preview" }
  )

  return {
    without: typeof object.without === "string" ? object.without : "",
    with: typeof object.with === "string" ? object.with : "",
    rulesUsed: Array.isArray(object.rulesUsed) ? object.rulesUsed : [],
    usage: spent.total,
  }
}

export type VoicePreview = {
  topic: string
  channel: string
  label: string
  without: string
  with: string
  /** The rules the model says it leaned on, as text. Often empty. */
  rulesUsed: string[]
}

export type PreviewResult =
  | { ok: true; preview: VoicePreview }
  | { ok: false; reason: "cooldown"; retryAt: string; message: string }
  | { ok: false; reason: "no-voice" | "failed"; message: string }

/** "14:32", in the reader's own zone. A cooldown stated in UTC is not an answer. */
export function formatRetryAt(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(at)
}

/**
 * How long is left on the cooldown, in milliseconds. Zero when it is free.
 * Pure, and exported for the test.
 */
export function cooldownLeft(previewAt: string | undefined, now: Date): number {
  if (!previewAt) return 0
  const last = Date.parse(previewAt)
  if (!Number.isFinite(last)) return 0
  return Math.max(0, last + PREVIEW_COOLDOWN_MS - now.getTime())
}

/**
 * The topic to write about: the user's most recent riff, cut to a phrase.
 *
 * Their own material rather than a fixture, because a demonstration on
 * somebody else's subject is a demonstration nobody recognises. The scrap's
 * first line is the closest thing a riff has to a title.
 */
async function recentTopic(userId: string): Promise<string> {
  const [row] = await db
    .select({ scrap: riff.scrap })
    .from(riff)
    .where(eq(riff.userId, userId))
    .orderBy(desc(riff.createdAt))
    .limit(1)

  const first =
    row?.scrap
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  if (!first) return FALLBACK_TOPIC

  return first.length > MAX_TOPIC_CHARS
    ? `${first.slice(0, MAX_TOPIC_CHARS).trimEnd()}…`
    : first
}

/**
 * Write the topic twice and hand both back. Never persists a post.
 *
 * Order matters and is the money argument: cooldown, then stamp, then spend.
 * Stamping before the call means a failed generation still burns the ten
 * minutes — deliberate, because the alternative is a button that can be held
 * down through a flaky model at full price. The error says when to come back.
 */
export async function previewVoice({
  userId,
  channel = "x",
  timezone = "UTC",
  now = new Date(),
  generate = generatePreview,
}: {
  userId: string
  channel?: string
  timezone?: string
  now?: Date
  generate?: PreviewGenerator
}): Promise<PreviewResult> {
  const ledger = await readVoiceLedger(userId)
  const left = cooldownLeft(ledger.previewAt, now)

  if (left > 0) {
    const retryAt = new Date(now.getTime() + left)
    return {
      ok: false,
      reason: "cooldown",
      retryAt: retryAt.toISOString(),
      message: `Try again after ${formatRetryAt(retryAt, timezone)}.`,
    }
  }

  const pages = (await getBrainByKind(userId, "voice")).filter(
    (page) => page.slug !== VOICE_LEDGER_SLUG
  )
  const voice = numberVoice(renderBrain(pages))

  if (!voice.trim()) {
    return {
      ok: false,
      reason: "no-voice",
      message:
        "There is no voice to compare against yet. Add a rule, or import your posts so Quincy can hear one.",
    }
  }

  const topic = await recentTopic(userId)
  const { prompts } = fitToCeiling({ topic, channel, voice })

  // The claim, before the spend.
  await writeVoiceLedger(userId, { previewAt: now.toISOString() })

  let generated: PreviewGeneration
  try {
    generated = await generate({
      system: PREVIEW_SYSTEM,
      prompts,
      maxOutputTokens: maxOutputTokensFor(channel),
    })
  } catch (cause) {
    console.error("[voice-preview] generation failed:", cause)

    // Metered anyway. A generation that threw still spent tokens, and a bill
    // that only records successes is a bill that understates the failures.
    if (cause instanceof GenerationFailed) {
      await meter(userId, cause.usage)
    }

    const retryAt = new Date(now.getTime() + PREVIEW_COOLDOWN_MS)
    return {
      ok: false,
      reason: "failed",
      message: `Quincy could not write the comparison. Try again after ${formatRetryAt(retryAt, timezone)}.`,
    }
  }

  if (generated.usage) await meter(userId, generated.usage)

  return {
    ok: true,
    preview: {
      topic,
      channel,
      label: channelLabel(channel),
      without: generated.without.trim(),
      with: generated.with.trim(),
      rulesUsed: namedRules(voice, generated.rulesUsed ?? []),
    },
  }
}

/**
 * The `usage_event` row. Failures here are logged and dropped: the preview is
 * already on its way to the browser, and losing a bookkeeping row must not
 * turn into an error on a page somebody is reading.
 */
async function meter(userId: string, usage: PreviewUsage): Promise<void> {
  try {
    await recordUsage({
      userId,
      model: PREVIEW_USAGE_LABEL,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
    })
  } catch (cause) {
    console.error("[voice-preview] could not record usage:", cause)
  }
}

/**
 * Turn `["2", "5"]` into the rules themselves, for the caption.
 *
 * A number the reader cannot resolve is worse than no caption. Anything that
 * does not point at a real line is dropped rather than guessed at — the model
 * is allowed to be wrong about this, and the caption is not.
 */
export function namedRules(voice: string, used: string[]): string[] {
  const byNumber = new Map<string, string>()

  for (const line of voice.split("\n")) {
    const match = /^(\d+)\.\s+(.*)$/.exec(line.trim())
    if (match) byNumber.set(match[1], match[2])
  }

  return used
    .map((id) => byNumber.get(String(id).trim()))
    .filter((text): text is string => Boolean(text))
}
