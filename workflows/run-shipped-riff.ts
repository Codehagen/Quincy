import { FatalError } from "workflow"

import { generateAnglesFromShipped } from "@/lib/adapt"
import { renderBrainForUser } from "@/lib/brain"
import {
  completeSpokenRiff,
  failSpokenRiff,
  recordShippedRefusal,
  startShippedRiff,
  type CompleteSpokenRiffResult,
  type ShippedRefusal,
} from "@/lib/riffs"
import {
  NO_BEATS,
  readShippedBeats,
  readShippedFacts,
  selectShippedPassage,
  SHIPPED_MODEL,
  type ShippedBeats,
  type ShippedFacts,
  type ShippedSelection,
} from "@/lib/shipped-work"
import { recordUsage } from "@/lib/usage"

/**
 * A merged pull request becomes a passage, then angles. See plans/021.
 *
 * The third Workflow in the product and the same shape as the first two:
 * orchestration only, everything touching the network or the database inside a
 * `"use step"`, so a step is the retry boundary and a selection that fails on a
 * blip is retried without re-running an angle generation that has not happened.
 *
 * **One structural difference from run-meeting-riff.ts, and it is the whole
 * reason this is a separate file rather than a parameter.** There, the route
 * creates the riff and this workflow fills it in or fails it. Here the riff is
 * created *by* the workflow, and only once the selection has said there is
 * something to put in it — because "there was no post in this merge" is the
 * common answer, and a failed card per merge is a notification several times a
 * day. See `startShippedRiff` for the argument in full.
 *
 * What that costs: between the route answering 202 and the selection returning,
 * there is no row for the user to look at. Nothing is lost — `source_item` is
 * written before the workflow starts, so the fact of the merge survives a run
 * that dies — and nobody is watching a merge, which is the same reason the
 * meeting workflow gave for relaxing the urgency argument.
 */
export async function runShippedRiffWorkflow(payload: {
  userId: string
  /** The row already written by the route. The riff's id is derived from it. */
  sourceItemId: string
  /**
   * The merge's own numbers, plus whatever the repository says about itself.
   *
   * Was `repository: string`, which was all the selection prompt needed and
   * nothing the writer did. It is built at the edge — in the route and in the
   * backfill action, where the connection and its installation token are —
   * rather than here, because assembling it needs a GitHub call and a step
   * that makes one is a step that can fail on a blip after the payload has
   * already been accepted.
   */
  facts: ShippedFacts
  /**
   * The description as numbered blocks, already trimmed by the route.
   *
   * Carried in the payload rather than re-read from `source_item`, for the
   * reason run-meeting-riff.ts gives: the selection addresses these by index,
   * and `source_item.body` stores them joined — recovering the boundaries by
   * splitting a stored string would make the indices depend on a round trip
   * through a column whose comment says it is never parsed for logic.
   */
  blocks: string[]
}) {
  "use workflow"

  /**
   * Narrowed, because a workflow payload is durable state rather than an
   * argument. `start()` wrote this down; the run that reads it back may be
   * executing a later deploy than the one that wrote it, and this payload
   * changed shape on 2026-08-25 — `repository: string` became `facts`. A run in
   * flight across that deploy would otherwise resume into `facts.repository` on
   * an `undefined`. See `readShippedFacts` for what it degrades to.
   */
  const facts = readShippedFacts(payload.facts)

  const selection = await selectStep({
    userId: payload.userId,
    facts,
    blocks: payload.blocks,
  })

  /**
   * Nothing worth publishing, and no card. Not a failure and not recorded as
   * one — the run simply ends. The `source_item` written by the route is what
   * remembers that this merge was read and found to carry nothing, which is
   * also what stops a redelivery paying to reach the same conclusion.
   *
   * The verdict goes onto that row rather than only into the log. Nobody is
   * watching a merge that arrived by webhook, but somebody pressing "read my
   * last merged pull request" on /sources is watching, and until this step
   * existed the only place the answer was written was a line in Vercel.
   */
  if (!selection.ok) {
    await refusalStep({
      sourceItemId: payload.sourceItemId,
      reason: selection.reason,
      why: selection.why,
    })
    return { ok: false as const, reason: selection.reason }
  }

  const riffId = await createStep({
    userId: payload.userId,
    sourceItemId: payload.sourceItemId,
    /**
     * Stored on the riff rather than only passed to the angles, because the
     * draft is written minutes or days later from a server action that has
     * only a row id. See `riff.context`.
     *
     * The beats go down with it for exactly that reason and one more: the
     * angles are written now and the post is written later, and the beats are
     * the only place the *order* of the story survives. An angle is one hook;
     * the three blocks under it come from here.
     */
    context: { forUser: selection.forUser, beats: selection.beats, facts },
  })

  const result = await anglesStep({
    riffId,
    userId: payload.userId,
    passage: selection.passage,
    facts,
    forUser: selection.forUser,
    beats: selection.beats,
  })

  if (!result.ok) {
    await failStep({
      riffId,
      userId: payload.userId,
      message: result.message,
    })
    return { ok: false as const, reason: "no-angles" }
  }

  return { ok: true as const, riffId, angles: result.angles }
}

type SelectionOutcome =
  /**
   * `forUser` is the selection's one sentence about what somebody using the
   * product gained. It is carried out of this step rather than recomputed
   * because it is the only part of the merge nobody could reconstruct from the
   * description — the description is written for a reader who already has the
   * repository open.
   *
   * `beats` travels beside it: what they did and what happened, quoted out of
   * the blocks, plus the one line the selection wrote about what it meant. See
   * `ShippedBeats`. Carried rather than recomputed for the same reason — asking
   * a second model call to find the sentence with the number in it would be
   * paying twice for an answer already given.
   */
  | { ok: true; passage: string; forUser: string; beats: ShippedBeats }
  /**
   * `why` in the user's direction, not the log's.
   *
   * It used to stop at `reason`, a two-word enum, with the model's sentence
   * left in a `console.log` — which was the right call while the only reader
   * was a prompt being tuned, and wrong the moment /sources grew a button that
   * asks for this and waits for an answer. "There was no post in that one"
   * without the because is the same inert message the empty state already was.
   */
  | { ok: false; reason: ShippedRefusal; why: string }

/**
 * Read the description, pick the passage.
 *
 * Returns the outcome rather than throwing when the answer is "there was
 * nothing in this one", for the reason the other two workflows give: that is a
 * *finished* answer, and throwing would make Workflow pay for the same
 * conclusion again. A genuine infrastructure failure — the gateway unreachable,
 * a malformed response the retry could not recover — still throws out of
 * `selectShippedPassage`, because that one is worth retrying.
 */
async function selectStep(payload: {
  userId: string
  facts: ShippedFacts
  blocks: string[]
}): Promise<SelectionOutcome> {
  "use step"

  if (payload.blocks.length === 0) {
    return {
      ok: false,
      reason: "empty",
      why: "The pull request had no title or description to read.",
    }
  }

  let selection: ShippedSelection

  try {
    selection = await selectShippedPassage({
      blocks: payload.blocks,
      facts: payload.facts,
      // Stories in full: this is a single tool-less `generateObject`, and the
      // default index form tells the model to call a story tool that does not
      // exist. See `renderBrain`.
      brain: await renderBrainForUser(payload.userId, { stories: "full" }),
    })
  } catch (cause) {
    // Rethrown so Workflow retries: an exception out of here is a gateway
    // problem or a response two attempts could not parse, not a verdict.
    console.error("[shipped-riff] selection failed:", cause)
    throw cause
  }

  /**
   * Metered here rather than inside lib/shipped-work.ts, matching every other
   * model call site: this is the layer that knows the userId. The call already
   * happened, so a bookkeeping failure logs and is dropped.
   */
  if (selection.usage) {
    try {
      await recordUsage({
        userId: payload.userId,
        model: SHIPPED_MODEL,
        inputTokens: selection.usage.inputTokens,
        cachedInputTokens: selection.usage.cachedInputTokens,
        outputTokens: selection.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[shipped-riff] could not record selection usage:", cause)
    }
  }

  if (!selection.passage) {
    /**
     * The expected answer. Logged, and now also returned.
     *
     * Still not a card — a user does not need to be told several times a day
     * that a dependency bump was not a post, which is the argument
     * `startShippedRiff` makes at length. But "not a card" was read as "not
     * anywhere", and the two are different: `recordShippedRefusal` puts this
     * sentence on the `source_item` so the one person who did ask — by pressing
     * a button and being promised a riff — gets the answer they waited for.
     */
    console.log(
      `[shipped-riff] nothing to publish in ${payload.facts.repository}: ${selection.why}`
    )
    return {
      ok: false,
      reason: "nothing-worth-keeping",
      why: selection.why,
    }
  }

  return {
    ok: true,
    passage: selection.passage,
    forUser: selection.forUser,
    /**
     * Narrowed on the way out of the step, not only on the way in.
     *
     * A step's return value is durable state too — it is written down and read
     * back by whatever deploy is running when the workflow resumes — so a run
     * that crossed the 2026-08-25 deploy comes back through `readShippedBeats`
     * with three empty strings rather than an `undefined` the angle prompt
     * would dereference. Empty beats are a supported answer everywhere below.
     */
    beats: readShippedBeats({
      did: selection.did,
      happened: selection.happened,
      learned: selection.learned,
    }),
  }
}

/**
 * Write the refusal, and never let writing it fail the run.
 *
 * A step of its own because it touches the database, and one that swallows its
 * own error on purpose: by the time this is reached the interesting work is
 * finished and the answer is "no". Throwing here would make Workflow retry a
 * selection that has already been paid for, to reach a conclusion already
 * known, so that a status line could be updated. The line not appearing is the
 * behaviour this whole change replaced — it is not worse than what was there,
 * and it is not worth a second model call.
 *
 * Only reached when no riff was created. Once one exists, `riff.state` and
 * `riff.failure` are the record and this must stay quiet — see the note on
 * `recordShippedRefusal` about two fields that can disagree.
 */
async function refusalStep(input: {
  sourceItemId: string
  reason: ShippedRefusal
  why: string
}): Promise<void> {
  "use step"

  try {
    await recordShippedRefusal(input)
  } catch (cause) {
    console.error("[shipped-riff] could not record the refusal:", cause)
  }
}

/**
 * Its own step, so the row exists before any money is spent on angles and so a
 * retry of the angle generation cannot create a second riff.
 */
async function createStep(input: {
  userId: string
  sourceItemId: string
  context: Record<string, unknown>
}): Promise<string> {
  "use step"
  return startShippedRiff(input.userId, input.sourceItemId, input.context)
}

async function anglesStep(input: {
  riffId: string
  userId: string
  passage: string
  facts: ShippedFacts
  forUser: string
  beats: ShippedBeats
}): Promise<CompleteSpokenRiffResult> {
  "use step"

  // Narrowed here as well as in `selectStep`: this is a step boundary, so the
  // argument arrived through durable state and a run in flight across the
  // 2026-08-25 deploy has no `beats` on it at all. `NO_BEATS` prints nothing,
  // which is the shape the prompt was written to accept.
  const beats = input.beats ? readShippedBeats(input.beats) : NO_BEATS

  return completeSpokenRiff({
    riffId: input.riffId,
    userId: input.userId,
    // The user's own words, verbatim, reassembled by code from the indices the
    // model returned — never text a model wrote. That is what makes it safe to
    // hand to a generator whose whole job is to work from their own specifics.
    transcript: input.passage,
    emptyMessage: "There was nothing to publish in that pull request.",
    /**
     * The one caller of `completeSpokenRiff` whose material was never spoken.
     *
     * Its default generator reads the scrap as a transcript — expect false
     * starts, read through them — and a pull request description has none, so
     * what gets read through is the content. Twelve angles from four merges
     * produced no drafts on 2026-08-24 and this was the first reason. The
     * closure is what carries the merge's facts past a `deps` signature that
     * knows nothing about them, which is why that signature did not have to
     * widen to admit a third generator.
     */
    deps: {
      angles: (angleInput) =>
        generateAnglesFromShipped({
          ...angleInput,
          facts: input.facts,
          forUser: input.forUser,
          beats,
        }),
    },
  })
}

async function failStep(input: {
  riffId: string
  userId: string
  message: string
}): Promise<void> {
  "use step"

  try {
    await failSpokenRiff(input)
  } catch (cause) {
    /**
     * A `FatalError`, not a retry — the same call the other two workflows make.
     * If the database cannot be written the riff is stuck on `working`, and
     * `RIFF_STUCK_AFTER_MS` is the fallback the card already has.
     */
    console.error("[shipped-riff] could not mark riff failed:", cause)
    throw new FatalError("could not record the failure")
  }
}
