import { generateObject, jsonSchema, streamText } from "ai"

import { CHANNELS_FOR_SHAPE, type Angle } from "./riffs"
import { CHANNEL_RULES, type ChannelRules } from "./post-length"
import {
  GenerationFailed,
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
  usageFromError,
} from "./structured-output"
import { DRAFTING_REASONING } from "./model-options"

/**
 * The model call that writes a draft. See plans/015.
 *
 * Where `lib/voice.ts` reads what has already been published and describes
 * how someone writes, this reads that description back and writes something
 * new with it — the other half of "Quincy drafts, you send." One call
 * produces every channel version at once (docs/vision.md's "adapt per
 * channel, never cross-post" is a rule about the output, not about how many
 * requests produce it), and every version is a single post: this plan does
 * not add a threaded or multi-part body format. See `app/(app)/ideas/actions.ts`
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
 * **It has its own default literal, and the `CHAT_MODEL` fallback it used to
 * have was the hazard rather than the convenience.** The old line read
 * `DRAFTING_MODEL ?? CHAT_MODEL ?? sonnet`, which meant the separation existed
 * only for whoever remembered to set both: leave `DRAFTING_MODEL` unset and
 * moving the chat to a cheaper model moves the writing with it, silently, in
 * the same commit. Plan 027's A/B measured that the model behind this call is
 * what decides whether a draft passes the three checks — the writer as the
 * subject of the first line, three beats present, the number on its own line —
 * so "a chat-cost change" and "a change to the one text a person publishes
 * under their own name" were one edit with one visible reason.
 *
 * The second failure was quieter. `draftsToday` in lib/mcp.ts counts the
 * account's daily ceiling with `eq(usageEvent.model, DRAFTING_MODEL)`, so the
 * string below is a database key as well as a model id. Moving it moves the
 * query: every row written before the move stops being counted, and the MCP
 * draft ceiling silently resets to zero. lib/usage.ts already carries the same
 * lesson from the other direction — two features resolving to one model id
 * made one button's cooldown trippable by another button.
 *
 * The literal is the one the old chain already ended at, so this commit changes
 * nothing that runs: production and `.env.local` both set `DRAFTING_MODEL`
 * explicitly (checked on 2026-09-09), and an environment that sets neither
 * resolved to this same string before and after. The only environment this
 * moves is one that set `CHAT_MODEL` alone — which is exactly the environment
 * the old fallback was quietly writing posts for.
 */
const MODEL = process.env.DRAFTING_MODEL ?? "anthropic/claude-sonnet-5"

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
 * /ideas states this on every angle, and the number has to be the one that
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
 * How a channel is read, in one line, beyond how long it lets a post be.
 *
 * The constraints below are the measurable half and they are not the whole
 * instruction. Two versions can satisfy every number in `CHANNEL_RULES` — under
 * the ceiling, front-loaded before the fold — and still be one sentence trimmed
 * to two sizes, which is exactly what "the platform, the fold and the reader
 * are different each time" failed to prevent: it names the difference without
 * saying what it is. These say what it is.
 *
 * **Keyed by the registry's own channel ids, and deliberately partial.** The
 * ids come from `CHANNEL_RULES` / `CHANNELS_FOR_SHAPE`; this is a lookup, not a
 * second list of channels for someone to keep in step by hand. A channel with
 * no entry gets its numbers and no tone line, which is the right failure — the
 * alternative is inventing a claim about how a platform reads in order to have
 * something to print. The test asserts every key here exists in
 * `CHANNEL_RULES`, so a renamed channel is a red test rather than a line that
 * silently stops being printed. The reverse is not asserted: a registry channel
 * with no tone yet is a channel nobody has read enough of.
 *
 * One line each, and each one earns its place from something in the table
 * beside it: X folds nothing and charges a flat 23 per link, LinkedIn hides
 * everything past ~140, Instagram past ~125, Substack has no feed at all. A
 * paragraph per channel would be eight paragraphs of tone against one line of
 * fact, and the fact is the part that gets a post rejected on send.
 *
 * Exported for the test, matching how this file treats `TELLS`.
 */
export const CHANNEL_TONE: Record<string, string> = {
  x: `nothing is hidden, so length is a choice rather than a constraint — a short line reads as deliberate here, and white space is pacing, not an unfinished thought; a link costs a flat 23 of the ceiling whatever its length, so it earns its place or it goes`,
  linkedin: `the opening line has to work with nothing else visible — it is the whole post for most of the feed, so it cannot be the setup half of a payoff that lives on line two, and it is a first sentence rather than a title`,
  threads: `it reads as a reply even when nothing came before it — plain, spoken, no announcement voice and no framing of the thing before saying it`,
  instagram: `the caption is read second, by someone who has already looked at the image and has one tap of patience — say the thing before the fold or it is not read`,
  bluesky: `a smaller room of people who build things — write it as one of them talking, not as an account addressing an audience`,
  substack: `nobody is scrolling past this one; the reader opened it on purpose, so it can start where a feed post would have had to hook first`,
  kit: `it arrives in an inbox addressed to one person — write to that person, singular, and never to "everyone who follows along"`,
  youtube: `it sits under something the reader may not have watched yet, so it stands on its own and does not refer to "the video above"`,
}

/**
 * The per-channel constraint block that goes into the prompt.
 *
 * Reads every number from `CHANNEL_RULES` rather than restating it — the
 * table in `lib/post-length.ts` is already the one place the fold and ceiling
 * numbers live, and a second copy here is a second place for them to drift
 * apart the day someone corrects one.
 *
 * The tone line goes on its own indented line under the numbers rather than
 * being joined into them. They are different kinds of claim — one is enforced
 * on send and one is a reading of the room — and keeping the numbers alone on
 * the labelled line is also what lets the test find them by channel.
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

      const line = `${target.label}: ${parts.join("; ")}`
      const tone = CHANNEL_TONE[target.id]

      return tone ? `${line}\n  How it reads there: ${tone}` : line
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

/**
 * The shape a post takes when something happened, for every kind of material.
 *
 * `describeBeats` below carries the same instruction and has carried it well —
 * one clause per line, a blank line between, the number whole and on its own
 * line, the user as the subject of the first, measured across 100 of his real
 * posts. It has one problem, and it is not the wording: it returns "" unless
 * `beats` arrive, and the only thing in the product that fills `beats` is
 * `selectShippedPassage` in lib/shipped-work.ts. **That makes the house shape a
 * GitHub-merge feature.** A voice note, a meeting passage, a pasted post and
 * anything typed into the chat reached the writer with no structural
 * instruction at all — one input type out of five got the form, and the other
 * four came back as summaries. Read against the live tables on 2026-09-09, 18
 * riffs had produced 4 drafts, and the merge path is one input of the five.
 *
 * So the shape moves up here, where it applies whether or not anybody found the
 * beats first, and `describeBeats` becomes what it always described itself as —
 * the same shape with the three clauses already lifted out of the material.
 * When both are present the beat block wins by saying so explicitly, which is
 * the resolution that costs the model nothing to apply.
 *
 * **The second bullet is not a softener, it is the guard.** A rule that says
 * "write three beats" with no exit turns an opinion into a fake anecdote and
 * bolts a moral onto a question — which is the tidy lesson `TELLS` spends its
 * first bullet forbidding, rebuilt as a structure. The shape is the default for
 * material that has a *then*; nothing else.
 *
 * Sits directly after `TELLS` on purpose. The last thing `TELLS` says is
 * "prefer the specific detail — if the material names a number, that is the
 * post", and the first thing this asks for is that number on a line of its own.
 *
 * Exported for the test, matching how this file treats `TELLS`.
 */
export const STORY_SHAPE = `- When the material describes something that happened, write it as a story in three short blocks and not as one paragraph: what the user did, then what happened, then what it meant. One clause per block, a blank line between them, and the user is the subject of the first — they did the thing, so the post opens with them doing it. A number the story turns on opens its own line, in digits, with the thing it counts still attached to it — "12 riffs sat ready" on a line of its own, never the bare "12" with its noun stranded on the next line, and never "twelve" spelled out mid-sentence. Buried in a clause it reads as a word and the eye goes past it; starting a line it reads as a fact and the reader stops. Take the number as digits even when the material spells it out. If three beats are spelled out further down, those are the beats and they win over any you would pick yourself; when they are not, find the shape in the material. This is how a post is built here, not a special case for material that happens to arrive pre-sorted.
- Material that is not a story is not forced into that shape. An observation, an opinion, a question, something they noticed or think — write it as the thing it is, at whatever length it needs. Three blocks with an invented "what it meant" bolted onto the end is the tidy lesson above wearing a structure, and it is worse than the paragraph it replaced.`

/** Exported for the test: the shape rule has to be *in* the prompt, not merely written. */
export const DRAFTING_RULES = `Rules:
- Write in the user's voice. Where posts they actually wrote are shown below, those are the truth about how they sound and the description is only a summary of them — read the real posts first and match those. A named habit is a habit, not an instruction: it tells you what they sound like across many posts, not what every post of theirs contains. An explicit "never" is the one absolute — if the voice says the user never does something, never do it.
- Sounding like them is the job; sounding identical to their last post is not. Vary the opener and the closer this idea needs rather than reaching for their most common one every time. That is about repetition across posts, never about stripping out what makes them recognisable — if they habitually use an emoji, a lowercase opening or a short sign-off, a post without any of it does not read as theirs. If a version ends up with an emoji, one is the ceiling, and the two channel versions must not use the same one.
- Do not repeat the recently written posts listed below, if any are: not their opening move, not their closing line, not their emoji. Those already went out under this name. Their sentence *rhythm* is fair game — that is the voice, and avoiding it is how a draft stops sounding like the same person.
${TELLS}
${STORY_SHAPE}
- Adapt each version to its own channel. Two versions of the same idea must not be the same text with different line breaks — the platform, the fold and the reader are different each time. Each channel is listed with its limits and with a line on how it is read there; the second half is the one that decides the difference, because two versions can both be under the ceiling and still be one sentence trimmed to two sizes.
- The brain may carry a strategy for a channel ("Strategy — X"). Its pillars are what this account is for: write this post as the pillar it belongs to, in the register its lean-into notes describe. The avoid list is a rule and not a preference — an idea that only works by breaking it is one to write differently, not one to write anyway. The weights and the posting windows are for the schedule; they say nothing about this post.
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
 * clause per line, a blank line between, the number whole and alone.
 *
 * `STORY_SHAPE` now states that form in the rules for every kind of material,
 * so this block is no longer the only place the prompt says it; it is the
 * narrow case where the three clauses have already been lifted out. The two
 * must not read as competing instructions, which is why the opening line names
 * itself as the shape the rules describe and says outright that these beats
 * win. A model handed a general rule and a specific one that disagree obeys
 * the nearest, and the nearest here is this one — so the general rule defers
 * in the same words rather than being contradicted by silence.
 *
 * **The language line was added because a draft went out mixed.** `did` and
 * `happened` are quoted out of the description, the descriptions in this
 * corpus are written in Norwegian for a repository, and the post is written in
 * English — so the beats arrived here as a Norwegian clause the writer then
 * printed verbatim into an English post. Quoting is the right rule one step
 * earlier and the wrong rule here: a quote a reader cannot read is not a
 * quote. So the beat is translated and the number is not, which is the only
 * part of it that has to survive intact.
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
    `The three beats, in the order they go in the post — the shape the rules describe, already found in the material for you, so use these rather than looking for your own:`,
    `1. What you did: ${did}`,
    `2. What happened: ${happened}`,
    `3. What it meant: ${learned}`,
    ``,
    `Write these as three short blocks with a blank line between them, in that order. You are the subject of the first. Beat 2 keeps its number exactly as written, in digits, opening a line with the thing it counts beside it — "12 riffs sat ready", not "12" alone with the rest on the next line. If a beat is empty, write the other two and stop — do not invent the missing one.`,
    `Beat 3 is the line above and nothing else. The material may also carry a "What changed for a user" line: that is context for choosing which detail to name, and it is never the closing block. It is written about the product; beat 3 is what the thing meant to you, and swapping one for the other turns a story into a release note.`,
    `A beat written in another language than the one you are posting in is translated, not quoted. Every number in it survives the translation exactly — the digits, the unit, and both ends of a before-and-after. Nothing goes out verbatim in a language the reader does not read.`,
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
 * otherwise wrap it lives in `app/(app)/ideas/actions.ts`, not in this file —
 * there is no `compileVoice`-shaped function here to hide it behind.
 *
 * It carries the two defences from lib/structured-output.ts, added after this
 * call site took /riffs (now /ideas) down in production on 2026-08-08.
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
          // `DRAFTING_REASONING`, not `REASONING`: this is the one call whose
          // output a person publishes under their own name, and the global
          // effort was measured on selection work. See lib/model-options.ts.
          providerOptions: DRAFTING_REASONING,
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

/**
 * Studio streaming. One `textStream` per channel, in order, so the card
 * types the post the way Contentport types a tweet. `Output.object` was
 * tried first: the gateway held the JSON until it was valid, so the UI
 * saw a skeleton and then the whole body at once.
 *
 * /ideas still uses `generateDraft`. A page load has nowhere to put a token.
 */
export async function* streamDraft(
  input: Parameters<DraftGenerator>[0]
): AsyncGenerator<DraftGeneration> {
  const spent = usageAccumulator()
  const versions: GeneratedVersion[] = input.channels.map((channel) => ({
    channel: channel.id,
    body: "",
  }))

  yield { versions: versions.map((row) => ({ ...row })) }

  try {
    for (const target of input.channels) {
      const result = streamText({
        model: MODEL,
        providerOptions: DRAFTING_REASONING,
        system: buildSystemPrompt(input.brain, input.examples ?? []),
        prompt: `${buildUserPrompt({ ...input, channels: [target] })}\n\nWrite only the ${target.label} post. No JSON. No labels. No quotes around it.`,
      })

      let body = ""
      for await (const delta of result.textStream) {
        body += delta
        const index = versions.findIndex((row) => row.channel === target.id)
        if (index >= 0) versions[index] = { channel: target.id, body }
        yield { versions: versions.map((row) => ({ ...row })) }
      }

      const usage = await result.usage
      spent.add(usage ?? {})
    }

    yield {
      versions: versions.map((row) => ({ ...row, body: row.body.trim() })),
      usage: spent.total,
    }
  } catch (cause) {
    spent.add(usageFromError(cause) ?? {})
    throw new GenerationFailed(cause, spent.total)
  }
}
