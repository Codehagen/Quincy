import { revalidatePath } from "next/cache"

import { ADAPT_SPEND } from "./adapt"
import { draftFromAngle, type DraftAngleResult } from "./angle-draft"
import { isEntitled, resolveEntitlementForRequest } from "./entitlement"
import { createRiffFromSaid, MAX_TRANSCRIPT_CHARS } from "./riffs"
import { spendCooldown } from "./usage"

/**
 * The two writes /riffs offers, with the user named rather than resolved.
 *
 * **Why they left the server action file.** `capture_riff` and `draft_angle`
 * are the same two writes, reached over MCP by a program holding a bearer
 * token and no cookie. The server actions read the session from the request,
 * so the MCP route used to bridge one in: an `AsyncLocalStorage` set for the
 * length of a tool call and a `/get-session` branch in `lib/auth.ts` that
 * answered from it. That bridge is deleted, and this file is what replaced it.
 *
 * The cores underneath already take a `userId` — `draftFromAngle` and
 * `createRiffFromSaid` both do — so the only thing the actions added over them
 * was the session read and the gates around it. Splitting the session read off
 * leaves one copy of the gates rather than two, which is the whole point:
 * AGENTS.md says the second copy of the money path is the one that goes wrong.
 *
 * **Nothing here is a server action and nothing here may become one.** These
 * take a user id as an argument, so exporting them from a `"use server"` file
 * would publish "act as any account" as an HTTP endpoint. The callers are the
 * two actions in `app/(app)/riffs/actions.ts`, which resolve the session
 * first, and `lib/chat-tools.ts`, which is handed a `ChatUser` the chat route
 * and the MCP route each resolved their own way.
 *
 * The order of the gates is the order the actions had, unchanged. Both spend a
 * model call, so both carry a ceiling and a cooldown — AGENTS.md, "Money":
 * both, not either.
 */

/**
 * Turn an angle into a draft, written in the user's voice.
 *
 * The work is in lib/angle-draft.ts. What stays here is the half a cron must
 * not have: the entitlement gate resolved as a request, and the two paths that
 * have to be revalidated because a person is looking at them.
 */
export async function draftAngleFor(
  userId: string,
  /** The `riff_angle` row id. Everything else is read from the database. */
  angleId: string
): Promise<DraftAngleResult> {
  /**
   * The cooldown, which this write went without for longer than it should
   * have. AGENTS.md, "Money": a ceiling and a cooldown, not either.
   *
   * `MCP_DRAFTS_PER_DAY` is the ceiling and it is a day wide, so between here
   * and there sat twenty presses at whatever rate a script could manage — and
   * `draft_angle` is the most expensive call in the product. The idempotency
   * guard inside `draftFromAngle` does not close it either: it refuses a second
   * draft of the *same* angle, and an agent asked to "draft everything waiting"
   * sends a different angle id every time.
   *
   * Same tag and same fifteen seconds as the three adapt buttons, because they
   * spend from one wallet and a rate limit split per button is one a caller
   * gets around by alternating. The spend below is tagged `ADAPT_SPEND` too —
   * a cooldown that reads a tag nothing writes never fires.
   */
  const cooldown = await spendCooldown(userId, ADAPT_SPEND, 15_000)
  if (!cooldown.ready) {
    return {
      ok: false,
      reason: "cooldown",
      message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
    }
  }

  const result = await draftFromAngle({
    userId,
    angleId,
    spendTag: ADAPT_SPEND,
    /**
     * Called immediately before the spend, which is where it was.
     *
     * `resolveEntitlementForRequest` rather than the pure resolver, because
     * this is a request and a trial may start on it. The order the checks run
     * in is lib/angle-draft.ts's, unchanged: ownership and "nothing you have
     * connected takes this shape" both answer before anybody is told their
     * free day is over.
     *
     * `trialEndsAt` is deliberately not passed in by the caller. Resolving it
     * from the argument would let a stale value — a token minted a week ago, a
     * session cookie cached five minutes ago — hand somebody a free day that
     * never ends, so the resolver reads the row itself.
     */
    gate: async () => {
      const entitlement = await resolveEntitlementForRequest({ id: userId })
      if (isEntitled(entitlement)) return { ok: true }

      return {
        ok: false,
        message:
          entitlement.state === "lapsed"
            ? "Your subscription is no longer active."
            : "Your free day is over.",
      }
    },
  })

  // Only when something was actually written. The `existing` path returns a
  // draft that was already there and already rendered, and revalidating for it
  // would throw two caches away to show the same rows again.
  if (result.ok && !result.existing) {
    revalidatePath("/riffs")
    revalidatePath("/drafts")
  }

  return result
}

export type CaptureResult =
  { ok: true; riffId: string; angles: number; groundedIn: string } | {
    ok: false
    message: string
  }

/**
 * The user's own material, typed or pasted, turned into a riff with angles.
 *
 * **Not `adaptPostToRiff`, and the difference is the whole point.** That one
 * runs `generateAngles`, whose system prompt opens "Below is a post somebody
 * else wrote" and whose rules forbid reusing the source's numbers — correct
 * for a stranger's post, and exactly wrong for your own. Given a person's own
 * account of their own decision it has nothing to adapt, so it honestly returns
 * no angles. Measured on 2026-08-13: a nine-sentence paste with a number in it
 * came back empty twice through that path.
 *
 * This one runs `generateAnglesFromSaid` through `completeSpokenRiff`, which is
 * built for the user talking — a voice note, a passage from a meeting, and now
 * something they wrote in the chat. The numbers in it are theirs to keep.
 *
 * **No row exists until the angles do**, which is `createRiffFromSaid`'s whole
 * shape and the reason this does not call `completeSpokenRiff`. The first real
 * capture from the chat, on 2026-08-13, was killed mid-generation and left a
 * `working` row with the script in it and nothing else — the second riff on
 * that account to end up stranded. Nothing retries a chat tool, so the only
 * safe ordering is the one where a kill leaves nothing behind.
 *
 * Money patterns are plan 012's, in that order: entitlement, cooldown, spend,
 * then a result object rather than a throw once anything has been spent.
 */
export async function captureToRiffFor(
  userId: string,
  /** Their words, verbatim. */
  text: string,
  source: { id: string; label: string } = { id: "notes", label: "Pasted" }
): Promise<CaptureResult> {
  const entitlement = await resolveEntitlementForRequest({ id: userId })
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  // The same family and the same window as the two adapt calls: all three are
  // one model call started by one press, and a person capturing twice in ten
  // seconds is a double submit rather than a second thought.
  const cooldown = await spendCooldown(userId, ADAPT_SPEND, 15_000)
  if (!cooldown.ready) {
    return {
      ok: false,
      message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
    }
  }

  const trimmed = text.trim()

  if (!trimmed) {
    return { ok: false, message: "There is nothing here to capture." }
  }

  if (trimmed.length > MAX_TRANSCRIPT_CHARS) {
    return {
      ok: false,
      message: `That is ${trimmed.length} characters. Send at most ${MAX_TRANSCRIPT_CHARS} — the transferable idea is never in the last thousand.`,
    }
  }

  // `notes`/`Pasted`, matching what `adaptPostToRiff` writes for a paste with
  // no URL behind it. The tile says where the words came from, and these came
  // from the person.
  const result = await createRiffFromSaid({
    userId,
    text: trimmed,
    sourceId: source.id,
    sourceLabel: source.label,
  })

  if (!result.ok) {
    return { ok: false, message: result.message }
  }

  revalidatePath("/riffs")

  return {
    ok: true,
    riffId: result.riffId,
    angles: result.angles,
    groundedIn: result.groundedIn,
  }
}
