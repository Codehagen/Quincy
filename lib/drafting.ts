import { generateObject, jsonSchema } from "ai"

import { CHANNELS_FOR_SHAPE, type Angle } from "./riffs"
import { CHANNEL_RULES, type ChannelRules } from "./post-length"
import {
  GenerationFailed,
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
  usageFromError,
} from "./structured-output"

/**
 * The model call that writes a draft. See plans/015.
 *
 * Where `lib/voice.ts` reads what has already been published and describes
 * how someone writes, this reads that description back and writes something
 * new with it — the other half of "Quincy drafts, you send." One call
 * produces every channel version at once (docs/vision.md's "adapt per
 * channel, never cross-post" is a rule about the output, not about how many
 * requests produce it), and every version is a single post: this plan does
 * not add a threaded or multi-part body format. See `app/(app)/riffs/actions.ts`
 * for the orchestration — entitlement, idempotency, fallback and metering all
 * live there, the same split `lib/voice.ts` and `app/(app)/sources/actions.ts`
 * already draw.
 */

const MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"

/** Exported so the call site can pass the same string to `recordUsage`. */
export const DRAFTING_MODEL = MODEL

export type DraftTarget = { id: string; label: string; rules: ChannelRules }

export type GeneratedVersion = {
  channel: string
  body: string
}

export type DraftUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export type DraftGeneration = {
  /** One per requested channel. */
  versions: GeneratedVersion[]
  usage?: DraftUsage
}

/** Injectable so a future test can exercise the call site without a model call. */
export type DraftGenerator = (input: {
  hook: string
  shape: Angle["shape"]
  scrapOrIdea: string
  sourceLabel: string
  channels: DraftTarget[]
  brain: string
  /**
   * The last few posts Quincy wrote for this user, newest first, as an
   * avoid-list. See `recentlyWritten` in lib/drafts.ts for why it is bodies
   * rather than a signature. Optional, and an empty array is the honest
   * answer for a first draft.
   */
  recent?: string[]
}) => Promise<DraftGeneration>

/**
 * The channels a shape becomes, narrowed to what the user can publish to.
 *
 * **Empty is a real answer**, and getting that wrong wrote a Substack post for
 * an account that has never connected Substack. The fallback below reads as
 * "when in doubt, use the whole shape list", and it was written for exactly one
 * case: a new user with nothing connected yet, who must still be able to press
 * "Draft this" and get somewhere. It fired for a different case entirely —
 * `Essay` maps only to Substack, so an account live on X and LinkedIn hit an
 * empty intersection on 2026-08-08 and got a draft for a platform it cannot
 * publish to. Nothing downstream could see the difference: `channelGaps` counts
 * the angle as covering Substack, and the draft sat in /drafts looking sendable.
 *
 * So the widening is now gated on the thing it was always about — whether we
 * know anything about this account's channels at all. A user with connections
 * gets the intersection, and an empty intersection means *this shape has
 * nowhere to land*, which the call site turns into a sentence rather than a
 * draft.
 *
 * Every target carries the real `CHANNEL_RULES` entry (or a null-filled
 * placeholder for a channel with none), so nothing downstream has to look the
 * rules up a second time.
 */
export function targetsFor(
  shape: Angle["shape"],
  connectedChannels: string[]
): DraftTarget[] {
  const shapeChannels = CHANNELS_FOR_SHAPE[shape]
  const connected = new Set(connectedChannels)
  const narrowed = shapeChannels.filter((c) => connected.has(c.id))
  const chosen =
    narrowed.length > 0 ? narrowed : connected.size === 0 ? shapeChannels : []

  return chosen.map((c) => ({
    id: c.id,
    label: c.label,
    rules: CHANNEL_RULES[c.id] ?? { limit: null, fold: null, urlCost: null },
  }))
}

/**
 * How many drafts "Draft this" will actually write, per shape.
 *
 * /riffs states this on every angle, and the number has to be the one that
 * happens rather than the one the shape table implies. `CHANNELS_FOR_SHAPE`
 * says a short post reaches X and LinkedIn; whether *this* account gets two
 * posts, one, or a refusal depends on what it has connected. So this is
 * `targetsFor` counted, not a second reading of the same table — a card that
 * promised a LinkedIn post to an account with no LinkedIn would be the
 * 2026-08-08 Substack bug again, one layer up and facing the user.
 *
 * Four entries, computed once for the page rather than per card: it depends on
 * the account, not on the riff, and a client component has no business
 * resolving connections per angle. Same argument `channelGaps` is passed in for.
 *
 * **Zero is a real answer and the card says so.** It means the account has
 * connections and none of them can take this shape, which is exactly when
 * `draftAngle` refuses. Saying it on the row turns a button that fails into a
 * button you knew not to press.
 */
export function writesPerShape(
  connectedChannels: string[]
): Record<Angle["shape"], number> {
  const shapes = Object.keys(CHANNELS_FOR_SHAPE) as Angle["shape"][]
  return Object.fromEntries(
    shapes.map((shape) => [shape, targetsFor(shape, connectedChannels).length])
  ) as Record<Angle["shape"], number>
}

/**
 * The per-channel constraint block that goes into the prompt.
 *
 * Reads every number from `CHANNEL_RULES` rather than restating it — the
 * table in `lib/post-length.ts` is already the one place the fold and ceiling
 * numbers live, and a second copy here is a second place for them to drift
 * apart the day someone corrects one.
 */
export function describeConstraints(targets: DraftTarget[]): string {
  return targets
    .map((target) => {
      const { limit, fold } = target.rules
      const parts: string[] = []

      if (limit !== null) {
        parts.push(
          `at most ${limit} characters — a post over this is rejected on send`
        )
      }
      if (fold !== null) {
        parts.push(
          `the feed hides everything after ~${fold} characters behind "see more", so the first ${fold} must stand alone`
        )
      }
      if (parts.length === 0) {
        parts.push("no published length limit")
      }

      return `${target.label}: ${parts.join("; ")}`
    })
    .join("\n")
}

const IDENTITY = `You are Quincy, an AI Head of Content. Someone has already picked the angle — the hook below is the opening line they chose, and the whole bet on any platform. Your job is to write it out as a finished post. The post goes out under the writer's own name, not yours: match how they actually write, not how a generic ghostwriter would.`

const DRAFTING_RULES = `Rules:
- Write in the user's voice as described below. A named habit is a habit, not an instruction: it tells you what they sound like across many posts, not what every post of theirs contains. An explicit "never" is the one absolute — if the voice says the user never does something, never do it.
- Do not give this post a signature. Pick the opener and the closer this particular idea needs; a recurring emoji or sign-off from the voice notes is one option among several, and reaching for the same one every time is the single fastest way to sound generated rather than written. If a version of this post ends up with an emoji, one is the ceiling, and the two channel versions must not use the same one.
- Reuse nothing from the recently written posts listed below, if any are. Not their opening move, not their closing line, not their emoji, not their sentence shape. Those already went out under this name; this one has to sound like the next thing they said, not the same thing again.
- Adapt each version to its own channel. Two versions of the same idea must not be the same text with different line breaks — the platform, the fold and the reader are different each time.
- Whatever the idea's shape (short post, thread, carousel, essay), write exactly one post per channel — never a numbered list of parts, thread markers like "1/", or a script for a multi-post sequence. If the idea needs more than one post's worth of space, write the strongest single post that carries it rather than splitting it.
- Never invent a fact, number, date or outcome that is not in the material below or the brain's story pages.
- Write in English unless the brain instructs otherwise.
- Output the post text only: no preamble, no "Here's your post", no surrounding quotes, and no hashtags unless the brain shows the user actually uses them.`

function buildSystemPrompt(brain: string): string {
  const base = `${IDENTITY}\n\n${DRAFTING_RULES}`
  return brain ? `${base}\n\n${brain}` : base
}

/**
 * The avoid-list block, or "" when there is nothing to avoid yet.
 *
 * In the user prompt rather than the system prompt on purpose: this is the
 * only part of the instruction that changes between two calls seconds apart,
 * and the system prompt is the half worth keeping stable (and cacheable)
 * across them.
 *
 * Exported for the test, matching how this file treats `describeConstraints`.
 */
export function describeRecent(recent: string[]): string {
  const posts = recent.map((p) => p.trim()).filter(Boolean)
  if (posts.length === 0) return ""

  return [
    `Already written for this user recently, newest first. Do not repeat their opening move, their closing line, their emoji or their sentence shape — this post has to sound like the next thing they said, not the same thing again:`,
    ...posts.map((post) => `---\n${post}`),
    `---`,
  ].join("\n")
}

function buildUserPrompt(input: {
  hook: string
  shape: Angle["shape"]
  scrapOrIdea: string
  sourceLabel: string
  channels: DraftTarget[]
  recent?: string[]
}): string {
  const lines = [
    `Hook: ${input.hook}`,
    `Shape: ${input.shape}`,
    `Source: ${input.sourceLabel}`,
  ]

  if (input.scrapOrIdea.trim() && input.scrapOrIdea !== input.hook) {
    lines.push(`Material:\n${input.scrapOrIdea}`)
  }

  const recent = describeRecent(input.recent ?? [])
  if (recent) lines.push(recent)

  lines.push(
    `Write one post for each of these channels, matching its own constraints:\n${describeConstraints(input.channels)}`
  )

  return lines.join("\n\n")
}

function buildSchema(targets: DraftTarget[]) {
  return jsonSchema<{ versions: GeneratedVersion[] }>({
    type: "object",
    properties: {
      versions: {
        type: "array",
        // No `minItems`/`maxItems`, and that is not a style choice.
        //
        // Those keywords break structured output through the AI Gateway on
        // anthropic/claude-sonnet-5: the whole object comes back JSON-encoded as
        // a *string* inside the first property, so `object.versions` is a string
        // and every downstream `.filter`/`.map` throws. Measured 2026-08-08 by
        // running the same schema with and without them.
        //
        // The count is bounded in code below instead, which it had to be anyway
        // — a schema keyword is a request and the call site still has to hold.
        items: {
          type: "object",
          properties: {
            channel: { type: "string", enum: targets.map((t) => t.id) },
            body: { type: "string" },
          },
          required: ["channel", "body"],
          additionalProperties: false,
        },
      },
    },
    required: ["versions"],
    additionalProperties: false,
  })
}

/**
 * The default generator. Exported (rather than kept private the way
 * `lib/voice.ts`'s `modelExtractor` is) because the orchestration that would
 * otherwise wrap it lives in `app/(app)/riffs/actions.ts`, not in this file —
 * there is no `compileVoice`-shaped function here to hide it behind.
 *
 * It carries the two defences from lib/structured-output.ts, added after this
 * call site took /riffs down in production on 2026-08-08.
 *
 * `buildSchema` above already documents the Gateway mangling that puts a
 * string where `versions` belongs, and banning `minItems`/`maxItems` removed
 * one *trigger* for it rather than the fault. What made this the crash rather
 * than a bad draft is `.slice`: the old line called it straight on
 * `object.versions`, and **a string has `.slice` too**. So a mangled result
 * sailed past the call site's try/catch — which is there precisely to turn a
 * failed generation into a hook fallback — and threw two statements later, on
 * `versions.map`, outside it. An uncaught throw in a server action is a 500
 * and a "This page couldn't load" screen over the whole route.
 *
 * `Array.isArray` is the predicate for the same reason it is in
 * `generateAngles`: the failure does not throw, it returns a plausible object
 * of the wrong shape, so only a shape check can see it.
 */
export const generateDraft: DraftGenerator = async (input) => {
  const spent = usageAccumulator()

  /**
   * The throw is rewrapped so the bill survives it. See `GenerationFailed`.
   *
   * `spent.add` sits after the `await` below, which is correct for every path
   * except the one where the `await` never returns. On 2026-08-08 a
   * `NoObjectGeneratedError` took that path and 3,156 input tokens left no
   * `usage_event` row — the generation the user saw fail was, to /credits, a
   * generation that never happened. Anything earlier attempts already cost is
   * in `spent` and goes out with it.
   */
  const { object } = await retryMalformed(
    async () => {
      let result
      try {
        result = await generateObject({
          model: MODEL,
          schema: buildSchema(input.channels),
          system: buildSystemPrompt(input.brain),
          prompt: buildUserPrompt(input),
        })
      } catch (cause) {
        spent.add(usageFromError(cause) ?? {})
        throw new GenerationFailed(cause, spent.total)
      }

      // Counted before the result is judged. A malformed answer costs exactly
      // what a good one costs.
      spent.add(result.usage)

      return {
        ...result,
        object: unwrapStringifiedObject(
          result.object,
          ["versions"],
          ["versions"]
        ),
      }
    },
    ({ object }) => Array.isArray(object.versions),
    { label: "drafting/versions" }
  )

  return {
    /**
     * Bounded here rather than by the schema. See the note in `buildSchema`:
     * the keywords that would express this break structured output entirely,
     * so the ceiling has to live where it can actually be enforced.
     *
     * The `Array.isArray` guard is not redundant with the retry above.
     * `retryMalformed` returns the last attempt whether or not it was usable —
     * deliberately, so callers keep their "the model found nothing" path — so
     * two malformed attempts in a row still arrive here, and this is the line
     * that has to hold when they do.
     */
    versions: Array.isArray(object.versions)
      ? object.versions.slice(0, input.channels.length)
      : [],
    usage: spent.total,
  }
}
