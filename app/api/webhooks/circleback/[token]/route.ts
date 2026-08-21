import { createIdGenerator } from "ai"
import { and, count, eq, gte } from "drizzle-orm"
import { start } from "workflow/api"

import { db } from "@/lib/db"
import { isEntitled, resolveEntitlement } from "@/lib/entitlement"
import {
  MAX_MEETING_CHARS,
  ownSegments,
  parseMeetingPayload,
  trimSegments,
} from "@/lib/meetings"
import { failSpokenRiff, startMeetingRiff } from "@/lib/riffs"
import { user } from "@/lib/schema"
import { sourceItem } from "@/lib/schema-app"
import {
  recordArrival,
  recordSourceError,
  resolveByToken,
  verifySignature,
} from "@/lib/source-connections"
import { runMeetingRiffWorkflow } from "@/workflows/run-meeting-riff"

/**
 * A call ends; Circleback sends the transcript; a riff appears. See plans/019.
 *
 * The first inbound webhook in the product that carries *material* rather than
 * a status. app/api/webhooks/resend is the other one, and the difference is
 * the whole reason this file is careful: a Resend event asserts that a message
 * bounced, and the worst a forged one can do is mislabel an address. A forged
 * body here asserts **what you said in a meeting**, and what is downstream of
 * that is a draft, then a post, published in your name.
 *
 * So the identity story has two independent halves and needs both:
 *
 * - **The token in the path says who.** An inbound POST carries no session.
 *   This is the only thing that can attribute it, which is why it is 256 bits
 *   of `randomBytes` and unique across every user.
 * - **The signature says whether it is really them.** A URL leaks — into a
 *   shared Circleback workspace, a screenshot, a support thread — and a leaked
 *   URL without this check is a stranger with write access to your material.
 *
 * **Non-2xx is reserved for what it means.** Circleback is not a person and
 * may retry an error forever, so every *expected* refusal — an expired
 * subscription, a day's ceiling reached, a connection still being set up —
 * answers 2xx and simply does less work. Only three things are errors: an
 * unknown token, a bad signature, and a body that is not a meeting.
 */

/** The row, the checks, the riff and the start. No model call happens here. */
export const maxDuration = 30

const newSourceItemId = createIdGenerator({ prefix: "si", size: 20 })

/**
 * How many meetings one user's Circleback may turn into work in 24 hours.
 *
 * The aggregate ceiling AGENTS.md asks for beside every cooldown, and this
 * path is the hardest case in the product so far: a cooldown bounds how often
 * *a person* can trigger a spend, and nobody is present here at all. The rate
 * is set by somebody's calendar, so a Tuesday with eight calls on it is eight
 * selection calls plus eight angle generations that nothing else would stop.
 *
 * Six, because a day with more than six recorded calls in it is a day whose
 * material is not the problem. The meetings past the ceiling are still stored
 * — the row is nearly free and the fact is true — so nothing is lost except
 * the drafting, and the drafting is the part that costs money.
 *
 * AGENTS.md:173 names the rhythm dispatcher as the first path that spends on a
 * schedule with nobody present, and records that it shipped without an
 * aggregate ceiling. This is the second, it is worse because a third party
 * sets the rate, and it is not shipping without one.
 */
const MAX_MEETINGS_PER_DAY = 6

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The largest body this endpoint will read.
 *
 * Four megabytes. A three-hour workshop transcript is roughly 170,000
 * characters, and the payload carries notes, action items and insights beside
 * it — so this is generous by an order of magnitude for a real meeting, and
 * twenty-five times smaller than the 100MB a Vercel function will otherwise
 * accept.
 *
 * The check exists because **the body has to be buffered before it can be
 * verified**. The signature is computed over the raw bytes, so `request.text()`
 * necessarily runs before the HMAC does, and without a ceiling anybody holding
 * the URL can make the function read 100MB it is about to throw away. That is
 * not a forgery — they still cannot sign it — it is a way to spend somebody
 * else's compute.
 *
 * app/api/voice-notes/route.ts makes the same argument in the other order and
 * is worth reading beside this: a `Content-Length` is a claim, checked because
 * believing it costs nothing and refusing early saves the buffering, with the
 * real guard being the measurement afterwards.
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const connection = await resolveByToken(token)

  /**
   * 404, not 401.
   *
   * The same choice `/api/cron/heartbeat` makes and for the same reason
   * (docs/brain.md): a 401 confirms that the path exists and that a valid
   * token would be accepted there, which is a free hint to anyone probing.
   * A 404 says nothing at all.
   */
  if (!connection || connection.source !== "circleback") {
    return new Response("Not found", { status: 404 })
  }

  /**
   * `Content-Length` first, then the real size — the order
   * app/api/voice-notes/route.ts uses.
   *
   * The header is a claim and is checked anyway, because believing it costs
   * nothing and refusing here saves buffering megabytes we are going to
   * discard. The measurement after the read is the actual guard: a client can
   * send any header it likes, and this one has not been authenticated yet.
   */
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) {
    return new Response("Body too large", { status: 413 })
  }

  /**
   * The raw text, and never `request.json()`.
   *
   * The signature is computed over these exact bytes. Any reparse — a
   * framework body parser, a re-`JSON.stringify` after decoding — changes them
   * and every signature fails, with nothing on screen explaining why. The
   * Resend route carries the same warning at its head.
   */
  const raw = await request.text()

  if (raw.length > MAX_BODY_BYTES) {
    return new Response("Body too large", { status: 413 })
  }

  /**
   * A connection that has no secret yet is not an error.
   *
   * Circleback mints the `whsec_` and only reveals it once the automation
   * exists, so there is a real interval — however long the user takes to paste
   * it back — in which deliveries arrive that we cannot verify. Dropping them
   * with a 2xx is the honest answer: nothing is broken, and nothing may be
   * believed either.
   *
   * **Not trust-on-first-use.** Pinning the first unsigned body would close
   * this gap by accepting anything for five minutes, and what it would accept
   * is a transcript.
   */
  if (!connection.signingSecret) {
    return new Response("Waiting for a signing secret", { status: 202 })
  }

  const signed = await verifySignature(
    connection,
    raw,
    request.headers.get("x-signature")
  )

  if (!signed) {
    /**
     * Recorded, but the connection is **not** marked broken.
     *
     * A failing signature is either an upstream secret rotation or a stranger,
     * and the second is far likelier than the first. Letting a stranger switch
     * somebody's source off by POSTing garbage at a URL they found would be
     * handing them the one destructive action this endpoint has. The error
     * lands on the row, `/sources` shows it, and the user decides.
     */
    await recordSourceError(
      connection.id,
      "A delivery arrived that Quincy could not verify came from Circleback."
    )
    return new Response("Bad signature", { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response("Malformed body", { status: 400 })
  }

  const payload = parseMeetingPayload(body)

  if (!payload) {
    await recordSourceError(
      connection.id,
      "A delivery arrived that did not look like a meeting."
    )
    return new Response("Not a meeting", { status: 400 })
  }

  /**
   * `trialEndsAt` is selected because `resolveEntitlement` reads it off the
   * object it is handed, not out of the database.
   *
   * Omitting it does not fail — it resolves every user to `expired`, silently,
   * and the endpoint stores meetings and drafts nothing forever. Caught by
   * scripts/verify-circleback.ts on its second run, which is the whole reason
   * that script asserts a riff exists rather than asserting a status code.
   */
  const [owner] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      trialEndsAt: user.trialEndsAt,
    })
    .from(user)
    .where(eq(user.id, connection.userId))
    .limit(1)

  if (!owner) {
    // The cascade should make this unreachable. If it is reached, the row is
    // an orphan pointing at a deleted account and the right answer is to stop.
    return new Response("Not found", { status: 404 })
  }

  // The connection is working: something arrived, it verified, and it parsed.
  // Recorded before the outcome is known, because "material is arriving" is
  // true whether or not this particular call was worth publishing.
  await recordArrival(connection.id)

  const match = ownSegments(payload, [owner.email], owner.name)

  const { segments, dropped } = match.ok
    ? trimSegments(match.segments, MAX_MEETING_CHARS)
    : { segments: [], dropped: 0 }

  /**
   * The ceiling is counted **before** this meeting is stored, so the row
   * inserted below is the (N+1)th rather than being counted against itself.
   *
   * Counts `source_item` rather than `riff`: a call that produced no riff
   * because nothing in it was worth publishing still paid for a selection, and
   * a ceiling that only counts successes is one a quiet day cannot reach.
   */
  const [{ value: recent } = { value: 0 }] = await db
    .select({ value: count() })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, owner.id),
        eq(sourceItem.source, "circleback"),
        gte(sourceItem.createdAt, new Date(Date.now() - DAY_MS))
      )
    )

  /**
   * The material, as it arrived — filtered to the user's own turns.
   *
   * **Everyone else's words are never written down.** They pass through this
   * function in memory and end here. The people on that call agreed to
   * Circleback; they did not agree to us, and a content tool that quietly
   * accumulates a searchable archive of everything anybody has ever said to
   * its user is a different and much worse product.
   *
   * `onConflictDoNothing` on `(user, source, external_id)` is the whole replay
   * story. Circleback publishes no retry policy and sends no timestamp header,
   * so there is no window to bound — but a redelivery, a user re-applying the
   * automation to historical meetings from the Actions menu, and a captured
   * body replayed by hand all collide on the same key and all become no-ops.
   *
   * **This runs before the speaker match is acted on, and that ordering is the
   * fix for a real bug.** The first version returned from the unmatched branch
   * above this insert, so a meeting Quincy could not attribute wrote no row —
   * which meant nothing to collide with, which meant every retry of it made
   * another failed card, forever, past any ceiling. A user whose calendar
   * address differs from their Quincy address is exactly the case the name
   * fallback exists for, and it was the case that produced an unbounded queue.
   *
   * An unmatched meeting therefore stores an **empty body**: the fact that the
   * call happened, and not one word of it. That is the dedup key, and it gives
   * up nothing the privacy rule protects — there was, by definition, nothing of
   * the user's to keep.
   */
  const inserted = await db
    .insert(sourceItem)
    .values({
      id: newSourceItemId(),
      userId: owner.id,
      source: "circleback",
      externalId: payload.id,
      url: `https://circleback.ai/meetings/${payload.id}`,
      postedAt: payload.createdAt,
      body: segments.map((s) => s.text).join("\n"),
      // The platform's own numbers, verbatim, and never parsed for logic —
      // the rule `source_item.meta` states and `brain_page.data` states in the
      // other direction. If code ever needs one of these, it becomes a column.
      meta: {
        name: payload.name,
        durationSeconds: payload.durationSeconds,
        attendeeCount: payload.attendees.length,
        tags: payload.tags,
        icalUid: payload.icalUid,
        speaker: match.ok ? match.speaker : "",
        segmentsKept: segments.length,
        segmentsDropped: dropped,
      },
    })
    .onConflictDoNothing()
    .returning({ id: sourceItem.id })

  if (inserted.length === 0) {
    return Response.json({ state: "duplicate" }, { status: 200 })
  }

  /**
   * Could not tell which voice was theirs — a failed card, not a silent drop.
   *
   * Written straight to `failed` rather than through `working`, which is the
   * one place this diverges from the voice-note flow: that one cannot know
   * whose voice it has until a model has run, and this one knows from the
   * payload alone. A `working` riff that a workflow fails a second later would
   * be a spinner for a decision already made.
   *
   * Below the insert, so one meeting can produce at most one of these however
   * many times Circleback sends it. The error also lands on the connection, so
   * `/sources` states the cause once rather than leaving the user to infer it
   * from a run of identical failures.
   */
  if (!match.ok) {
    await recordSourceError(connection.id, match.message)

    const riffId = await startMeetingRiff(owner.id)
    await failSpokenRiff({ riffId, userId: owner.id, message: match.message })

    return Response.json({ riffId, state: "failed" }, { status: 202 })
  }

  /**
   * `resolveEntitlement`, not `resolveEntitlementForRequest`.
   *
   * The read-only one, exactly as its own comment instructs: "Safe to call
   * from anywhere, including a background job where nobody is present." The
   * request variant can *start* a trial, and starting somebody's 24-hour free
   * day because a meeting ended while they were asleep would spend it for
   * them.
   *
   * 200 rather than 402, and the `source_item` above is kept. The meeting
   * happened, the row is true, and the material is waiting when they come
   * back — which is a better answer than a webhook that retries a payment
   * problem at us forever.
   */
  const entitlement = await resolveEntitlement(owner)

  if (!isEntitled(entitlement)) {
    return Response.json({ state: "stored", reason: "unentitled" })
  }

  if (recent >= MAX_MEETINGS_PER_DAY) {
    return Response.json({ state: "stored", reason: "daily-ceiling" })
  }

  const riffId = await startMeetingRiff(owner.id)

  try {
    await start(runMeetingRiffWorkflow, [
      {
        riffId,
        userId: owner.id,
        meetingName: payload.name,
        segments: segments.map((s) => s.text),
      },
    ])
  } catch (cause) {
    /**
     * The riff stays, and stays `working`.
     *
     * `RIFF_STUCK_AFTER_MS` is what catches it — after four minutes the card
     * stops claiming to be busy and offers a retry. The same call
     * app/api/voice-notes/route.ts makes, for the same reason: a card that
     * says "this did not work" is a truer answer than a page that never
     * acknowledges the meeting happened.
     */
    console.error("[circleback] could not start workflow:", cause)
  }

  return Response.json({ riffId, state: "working" }, { status: 202 })
}

/**
 * Nothing else is allowed here.
 *
 * Exported explicitly so a GET to a leaked URL answers 405 rather than Next's
 * default, and so nobody can turn this path into a readable endpoint by
 * adding a handler without noticing what the token in it is worth.
 */
export async function GET() {
  return new Response("Method not allowed", { status: 405 })
}
