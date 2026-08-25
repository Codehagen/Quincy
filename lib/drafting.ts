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
import { REASONING } from "./model-options"

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

/**
 * The model that writes the posts, and its own variable.
 *
 * Every other call site in this product reads `CHAT_MODEL`, which meant one
 * string decided both how the chat thinks and how the writing reads. Those are
 * not the same decision. Measured on 2026-08-13, drafting and the background
 * jobs are 70% of all spend, so the pressure to reach for a cheaper model lands
 * here first — and this is also the one output a person publishes under their
 * own name. A knob that trades those against each other silently is the wrong
 * knob.
 *
 * Falls through to `CHAT_MODEL` and then to Sonnet, so nothing changes until
 * somebody sets it deliberately. Moving the chat to a cheap model is now one
 * variable; moving the writing is a second, separate act.
 */
const MODEL =
  process.env.DRAFTING_MODEL ??
  process.env.CHAT_MODEL ??
  "anthropic/claude-sonnet-5"

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
  /**
   * What the material is about, when the material does not say. See plans/021.
   *
   * A pull request description is written for somebody who already has the
   * repository open: it names files and functions and takes the product as
   * read. Handing that to a writer told to prefer the specific detail produces
   * a true post about nothing anybody outside the repository recognises. This
   * is the product put back — what it is, whether it is public, what a user of
   * it gained — from `riff.context`.
   *
   * Optional, and empty is the honest answer for a voice note: the user said
   * what they were talking about, so there is nothing to add.
   */
  about?: string
  /**
   * The three beats of what happened, in the order they go in the post. See
   * plans/026 decision 7 and `ShippedBeats` in lib/shipped-work.ts.
   *
   * `about` says what the material is *about*; this says what shape the post
   * takes. They are separate on purpose — a writer that knows the product and
   * still has no sequence writes a paragraph, and the user does not write
   * paragraphs about his work. Measured across 100 of his real posts: one
   * clause per line, a blank line between beats, the number whole and on its
   * own line, and himself as the subject of the first.
   *
   * Optional and per-beat-optional. A voice note has none of this; a merge that
   * only described a state has a "happened" and no "did". The prompt below
   * prints what exists and tells the model not to invent the rest, which is a
   * different instruction from printing an empty label.
   */
  beats?: { did: string; happened: string; learned: string }
  channels: DraftTarget[]
  brain: string
  /**
   * The last few posts Quincy wrote for this user, newest first, as an
   * avoid-list. See `recentlyWritten` in lib/drafts.ts for why it is bodies
   * rather than a signature. Optional, and an empty array is the honest
   * answer for a first draft.
   */
  recent?: string[]
  /**
   * Posts the user wrote themselves, verbatim — the ground truth for their
   * voice. See `voiceExamples` in lib/voice.ts for why a description of a
   * voice is not a substitute for the voice. Optional, and empty is honest for
   * an account whose corpus has never been read.
   */
  examples?: string[]
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

/**
 * The habits that belong to the model rather than to the user.
 *
 * "Write in their voice" is an instruction toward something; this is the
 * instruction away from the default. Without it a draft can satisfy every
 * positive rule in the list — right length, right register, right subject — and
 * still be unmistakably machine-written, because the tells are structural and
 * none of the other rules mention structure. The one this shipped to write ran:
 * "Building the product is one job. Explaining what happened is another. Turns
 * out, sharing the process is part of the build too." Every rule above was
 * satisfied. Three tells in four lines.
 *
 * **Every entry is conditional on the examples, and that is the whole design.**
 * A flat ban list fights the exemplars: this product's entire argument is that
 * what somebody published outranks any description of how they write, so a rule
 * that forbids a word the user demonstrably uses would make the draft *less*
 * like them while looking like a quality improvement. The published post wins,
 * here as everywhere else.
 *
 * Structures first, vocabulary second. A banned word is easy to route around
 * and costs little when it fires wrongly; the shapes are what actually give a
 * draft away, and they survive any amount of word substitution.
 *
 * Exported for the test, matching how this file treats `describeConstraints`.
 */
export const TELLS = `- Some habits belong to the machine and not to this person, and they are what makes a draft read as written by an AI. Do not reach for any of these unless the user's own posts below show them doing it — if they do, it is their habit and it stays:
  - The tidy lesson at the end. "Turns out, …", "The lesson: …", "And that is the real …", "Funny how …". A post is allowed to stop when the thought stops; it does not owe the reader a moral.
  - Setup and reversal. "X is one job. Y is another.", "The hard part was not A, it was B.", "Their whole codebase? Copied." Write the sentence straight instead.
  - "No more <bad thing>" where the good thing would do. Say what happens now.
  - Hype about their own work: huge, insane, wild, massive, game changer, this changes everything, any superlative about a thing they built. State what it does and let the reader decide whether it is impressive.
  - Ghostwriter vocabulary: journey, dive, deep dive, seamless, streamline, unlock, elevate, empower, robust, leverage, landscape, realm, testament to, in the world of, at the end of the day.
- Prefer the specific detail over the summary of it. If the material names a number, a failure, a decision or a day, that is the post; a draft that could have been written about any project by any person is one nobody wrote. When there is no specific detail to reach for, write a shorter post rather than filling the space with the general version.`

const DRAFTING_RULES = `Rules:
- Write in the user's voice. Where posts they actually wrote are shown below, those are the truth about how they sound and the description is only a summary of them — read the real posts first and match those. A named habit is a habit, not an instruction: it tells you what they sound like across many posts, not what every post of theirs contains. An explicit "never" is the one absolute — if the voice says the user never does something, never do it.
- Sounding like them is the job; sounding identical to their last post is not. Vary the opener and the closer this idea needs rather than reaching for their most common one every time. That is about repetition across posts, never about stripping out what makes them recognisable — if they habitually use an emoji, a lowercase opening or a short sign-off, a post without any of it does not read as theirs. If a version ends up with an emoji, one is the ceiling, and the two channel versions must not use the same one.
- Do not repeat the recently written posts listed below, if any are: not their opening move, not their closing line, not their emoji. Those already went out under this name. Their sentence *rhythm* is fair game — that is the voice, and avoiding it is how a draft stops sounding like the same person.
${TELLS}
- Adapt each version to its own channel. Two versions of the same idea must not be the same text with different line breaks — the platform, the fold and the reader are different each time.
- Whatever the idea's shape (short post, thread, carousel, essay), write exactly one post per channel — never a numbered list of parts, thread markers like "1/", or a script for a multi-post sequence. If the idea needs more than one post's worth of space, write the strongest single post that carries it rather than splitting it.
- Never invent a fact, number, date or outcome that is not in the material below or the brain's story pages.
- Write in English unless the brain instructs otherwise.
- Output the post text only: no preamble, no "Here's your post", no surrounding quotes, and no hashtags unless the brain shows the user actually uses them.`

function buildSystemPrompt(brain: string, examples: string[]): string {
  const base = `${IDENTITY}\n\n${DRAFTING_RULES}`
  const shown = describeExamples(examples)
  // Examples after the brain, so the last thing the model reads before the
  // hook is the user's own writing rather than a description of it.
  return [base, brain, shown].filter(Boolean).join("\n\n")
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
/**
 * The user's own posts, verbatim, as the thing to match.
 *
 * In the system prompt beside the brain rather than in the user prompt: it does
 * not change between two drafts for the same person, so it belongs on the half
 * that stays stable and cacheable. `describeRecent` is the opposite — it
 * changes every call, and it is an avoid-list rather than a target.
 *
 * The framing has to be exact, because these two blocks sit near each other and
 * mean opposite things. This one says "write like this". The other says "do not
 * repeat these". Getting them confused would make the model avoid the voice and
 * copy the last draft, which is precisely backwards.
 */
export function describeExamples(examples: string[]): string {
  const posts = examples.map((p) => p.trim()).filter(Boolean)
  if (posts.length === 0) return ""

  return [
    `## How the user actually writes`,
    ``,
    `Posts this user published themselves, verbatim. This is the ground truth for their voice — where it disagrees with any description of their voice, believe these. Match the rhythm, the sentence length, the punctuation habits and the level of polish, including the imperfections. Do not reuse their subjects, their facts or their phrasing; you are matching how they sound, not what they said.`,
    ``,
    `Some of these were picked because they are about the same subject as the post you are writing, which makes them more useful and more dangerous. The user has already published every one of them, so a draft that restates one is a duplicate of their own timeline. Never output one of these posts, whole or lightly reworded.`,
    ...posts.map((post) => `---\n${post}`),
    `---`,
  ].join("\n")
}

export function describeRecent(recent: string[]): string {
  const posts = recent.map((p) => p.trim()).filter(Boolean)
  if (posts.length === 0) return ""

  return [
    `Already written for this user recently, newest first. Do not repeat their opening move, their closing line, their emoji or their sentence shape — this post has to sound like the next thing they said, not the same thing again:`,
    ...posts.map((post) => `---\n${post}`),
    `---`,
  ].join("\n")
}

/**
 * The three-beat block, or "" when there are no beats to print.
 *
 * The numbering and the closing paragraph are both load-bearing. A list of
 * three labelled facts is read as three facts; a numbered list with "in that
 * order" under it is read as a form. The user's own posts are the form — one
 * clause per line, a blank line between, the number whole and alone — and this
 * is the only place in the prompt that says so.
 *
 * **No line-break caveat, because no channel needs one.** `describeConstraints`
 * was checked on 2026-08-25: `ChannelRules` carries `limit`, `fold` and
 * `urlCost`, and not one of the six channels forbids a newline. If one ever
 * does, this paragraph is where the exception goes — "three blocks" would
 * otherwise be an instruction the channel rules silently contradict.
 *
 * Exported for the test, matching how this file treats `describeConstraints`.
 */
export function describeBeats(beats?: {
  did: string
  happened: string
  learned: string
}): string {
  const did = beats?.did.trim() ?? ""
  const happened = beats?.happened.trim() ?? ""
  const learned = beats?.learned.trim() ?? ""

  if (!did && !happened && !learned) return ""

  return [
    `The three beats, in the order they go in the post:`,
    `1. What you did: ${did}`,
    `2. What happened: ${happened}`,
    `3. What it meant: ${learned}`,
    ``,
    `Write these as three short blocks with a blank line between them, in that order. You are the subject of the first. Beat 2 keeps its number exactly as written. If a beat is empty, write the other two and stop — do not invent the missing one.`,
  ].join("\n")
}

export function buildUserPrompt(input: {
  hook: string
  shape: Angle["shape"]
  scrapOrIdea: string
  sourceLabel: string
  about?: string
  beats?: { did: string; happened: string; learned: string }
  channels: DraftTarget[]
  recent?: string[]
}): string {
  const lines = [
    `Hook: ${input.hook}`,
    `Shape: ${input.shape}`,
    `Source: ${input.sourceLabel}`,
  ]

  // Between the source and the material, because that is the order it has to
  // be read in: what this is, what it is about, then the words themselves.
  if (input.about?.trim()) {
    lines.push(`About the material:\n${input.about.trim()}`)
  }

  if (input.scrapOrIdea.trim() && input.scrapOrIdea !== input.hook) {
    lines.push(`Material:\n${input.scrapOrIdea}`)
  }

  // After the material, because it is a reading of it: the beats are three
  // clauses lifted out of the block above, and putting them first would make
  // the description look like supporting detail for a summary somebody else
  // wrote. Before the constraints, because the constraints are about length.
  const beats = describeBeats(input.beats)
  if (beats) lines.push(beats)

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
          providerOptions: REASONING,
          schema: buildSchema(input.channels),
          system: buildSystemPrompt(input.brain, input.examples ?? []),
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
