import { ingestMeeting } from "@/lib/meeting-intake"
import { parseMeetingPayload } from "@/lib/meetings"
import {
  recordSourceError,
  resolveByToken,
  verifySignature,
} from "@/lib/source-connections"

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

/**
 * The ceiling (six meetings a day, across every note taker) and everything
 * after verification live in lib/meeting-intake.ts, shared with Fathom and
 * Granola. This route owns who it is, how it verifies and how the body parses.
 */

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

  return ingestMeeting({
    connection,
    source: "circleback",
    payload,
    url: `https://circleback.ai/meetings/${payload.id}`,
  })
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
