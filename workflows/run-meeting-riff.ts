import { FatalError } from "workflow"

import { renderBrainForUser } from "@/lib/brain"
import {
  MEETING_MODEL,
  selectMeetingMoment,
  type MeetingSegment,
} from "@/lib/meetings"
import {
  completeSpokenRiff,
  failSpokenRiff,
  type CompleteSpokenRiffResult,
} from "@/lib/riffs"
import { recordUsage } from "@/lib/usage"

/**
 * An hour of talking becomes one passage, then angles. See plans/019.
 *
 * The second Workflow in the product and deliberately the same shape as the
 * first (workflows/run-voice-riff.ts): orchestration only, everything that
 * touches the network or the database inside a `"use step"`, so a step is the
 * retry boundary and a selection that fails on a blip is retried without
 * re-running an angle generation that has not happened yet.
 *
 * **Two model calls, not one, and the first one is the product.** The voice
 * note flow goes straight from transcript to angles because a voice note is
 * one person with one idea. A meeting is many people with many topics, and
 * `riff.scrap` measured 989 characters at its longest in the live database
 * against a transcript of roughly 43,000. Selecting is not an optimisation
 * here; without it there is nothing to hand `generateAnglesFromSaid` that it
 * was built to read.
 *
 * **Nobody is waiting.** Unlike a voice note, where somebody has just pressed
 * stop and is looking at the screen, this fires while the user is walking out
 * of a meeting room. That lowers the urgency and changes nothing else — the
 * durability argument is what mattered, and it is unchanged.
 */
export async function runMeetingRiffWorkflow(payload: {
  riffId: string
  userId: string
  meetingName: string
  /**
   * The user's own turns, in order, already filtered and trimmed by the route.
   *
   * Carried in the payload rather than re-read from `source_item`, because the
   * selection addresses these by index and `source_item.body` stores them
   * joined — reconstructing the boundaries by splitting a stored string would
   * make the indices depend on a round trip through a column whose comment
   * says it is never parsed for logic.
   */
  segments: string[]
}) {
  "use workflow"

  const selection = await selectStep(payload)

  if (!selection.ok) {
    await failStep({
      riffId: payload.riffId,
      userId: payload.userId,
      message: selection.message,
    })
    return { ok: false as const, reason: selection.reason }
  }

  const result = await anglesStep({
    riffId: payload.riffId,
    userId: payload.userId,
    passage: selection.passage,
  })

  if (!result.ok) {
    await failStep({
      riffId: payload.riffId,
      userId: payload.userId,
      message: result.message,
    })
    return { ok: false as const, reason: "no-angles" }
  }

  return { ok: true as const, angles: result.angles }
}

type SelectionOutcome =
  | { ok: true; passage: string }
  | { ok: false; reason: "nothing-worth-keeping" | "empty"; message: string }

/**
 * Read the call, pick the passage.
 *
 * Returns the outcome rather than throwing when the answer is "there was
 * nothing in this one", for the reason `transcribeStep` gives in the voice
 * workflow: that is a *finished* answer, and throwing would make Workflow pay
 * for the same conclusion again. A genuine infrastructure failure — the
 * gateway unreachable, a malformed response the retry could not recover —
 * still throws out of `selectMeetingMoment`, because that one is worth
 * retrying.
 */
async function selectStep(payload: {
  userId: string
  meetingName: string
  segments: string[]
}): Promise<SelectionOutcome> {
  "use step"

  if (payload.segments.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "Quincy found nothing you said on that call.",
    }
  }

  const segments: MeetingSegment[] = payload.segments.map((text) => ({
    speaker: "",
    text,
    timestamp: null,
  }))

  const selection = await selectMeetingMoment({
    segments,
    meetingName: payload.meetingName,
    brain: await renderBrainForUser(payload.userId),
  })

  /**
   * Metered here rather than inside lib/meetings.ts, matching every other
   * model call site: this is the layer that knows the userId. The call already
   * happened, so a bookkeeping failure logs and is dropped — the money is
   * spent whether or not it was recorded.
   */
  if (selection.usage) {
    try {
      await recordUsage({
        userId: payload.userId,
        model: MEETING_MODEL,
        inputTokens: selection.usage.inputTokens,
        cachedInputTokens: selection.usage.cachedInputTokens,
        outputTokens: selection.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[meeting-riff] could not record selection usage:", cause)
    }
  }

  if (!selection.passage) {
    /**
     * The common case, and it must not read as a fault.
     *
     * Most calls are scheduling, status and agreeing with somebody — the
     * selection prompt is told at length that returning nothing is correct,
     * and a card that answered "Quincy could not do this" to the right answer
     * would train the user to distrust the ones that mean it.
     */
    return {
      ok: false,
      reason: "nothing-worth-keeping",
      message: "Nothing on that call was worth publishing.",
    }
  }

  return { ok: true, passage: selection.passage }
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
    // The passage is the user's own words, verbatim, reassembled by code from
    // the indices the model returned — never text a model wrote. That is what
    // makes it safe to hand to a generator whose whole job is to work from the
    // user's own specifics.
    transcript: input.passage,
    emptyMessage: "Nothing on that call was worth publishing.",
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
     * A `FatalError`, not a retry — the same call the voice workflow makes.
     *
     * If the database cannot be written, the riff is stuck on `working` and
     * `RIFF_STUCK_AFTER_MS` is the fallback the card already has. Retrying a
     * write that just failed, in order to record that something else failed,
     * is a loop with no better outcome at the end of it.
     */
    console.error("[meeting-riff] could not mark riff failed:", cause)
    throw new FatalError("could not record the failure")
  }
}
