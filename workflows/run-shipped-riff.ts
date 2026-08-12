import { FatalError } from "workflow"

import { renderBrainForUser } from "@/lib/brain"
import {
  completeSpokenRiff,
  failSpokenRiff,
  startShippedRiff,
  type CompleteSpokenRiffResult,
} from "@/lib/riffs"
import {
  selectShippedPassage,
  SHIPPED_MODEL,
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
  repository: string
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

  const selection = await selectStep(payload)

  /**
   * Nothing worth publishing, and no card. Not a failure and not recorded as
   * one — the run simply ends. The `source_item` written by the route is what
   * remembers that this merge was read and found to carry nothing, which is
   * also what stops a redelivery paying to reach the same conclusion.
   */
  if (!selection.ok) {
    return { ok: false as const, reason: selection.reason }
  }

  const riffId = await createStep({
    userId: payload.userId,
    sourceItemId: payload.sourceItemId,
  })

  const result = await anglesStep({
    riffId,
    userId: payload.userId,
    passage: selection.passage,
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
  | { ok: true; passage: string }
  | { ok: false; reason: "nothing-worth-keeping" | "empty" }

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
  repository: string
  blocks: string[]
}): Promise<SelectionOutcome> {
  "use step"

  if (payload.blocks.length === 0) {
    return { ok: false, reason: "empty" }
  }

  let selection: ShippedSelection

  try {
    selection = await selectShippedPassage({
      blocks: payload.blocks,
      repository: payload.repository,
      brain: await renderBrainForUser(payload.userId),
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
     * The expected answer, logged rather than surfaced.
     *
     * `why` is kept here and nowhere else on purpose. It is the model
     * explaining a refusal, which is worth having when tuning the prompt and is
     * not worth a card — a user does not need to be told several times a day
     * that a dependency bump was not a post.
     */
    console.log(
      `[shipped-riff] nothing to publish in ${payload.repository}: ${selection.why}`
    )
    return { ok: false, reason: "nothing-worth-keeping" }
  }

  return { ok: true, passage: selection.passage }
}

/**
 * Its own step, so the row exists before any money is spent on angles and so a
 * retry of the angle generation cannot create a second riff.
 */
async function createStep(input: {
  userId: string
  sourceItemId: string
}): Promise<string> {
  "use step"
  return startShippedRiff(input.userId, input.sourceItemId)
}

async function anglesStep(input: {
  riffId: string
  userId: string
  passage: string
}): Promise<CompleteSpokenRiffResult> {
  "use step"

  return completeSpokenRiff({
    riffId: input.riffId,
    userId: input.userId,
    // The user's own words, verbatim, reassembled by code from the indices the
    // model returned — never text a model wrote. That is what makes it safe to
    // hand to a generator whose whole job is to work from their own specifics.
    transcript: input.passage,
    emptyMessage: "There was nothing to publish in that pull request.",
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
