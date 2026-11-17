import { parseFathomMeeting } from "@/lib/fathom"
import { ingestMeeting } from "@/lib/meeting-intake"
import {
  recordSourceError,
  resolveByToken,
  verifyStandardSignature,
} from "@/lib/source-connections"
import { readStandardWebhookHeaders } from "@/lib/standard-webhooks"

/**
 * A Fathom recording ends; Fathom sends the transcript; a riff appears.
 *
 * The Circleback route's shape, and its argument (read it first): the token
 * in the path says who, the signature says whether it is really them, and
 * every expected refusal answers 2xx so a provider that retries does not
 * retry a decision. What differs:
 *
 * - **The secret is never missing.** Quincy created the webhook with the
 *   user's key and stored the secret Fathom returned in the same step, so
 *   there is no "waiting for a secret" interval to drop deliveries through.
 *   A row without one is a connect that failed halfway, and answers 404 like
 *   a row that does not exist.
 * - **Standard Webhooks**, with a timestamp, so a replay is bounded in time as
 *   well as by the dedup key. lib/standard-webhooks.ts.
 * - **The recorder is an alias.** The webhook was made for `my_recordings`
 *   only, so `recorded_by` is the key's owner, and their Fathom address joins
 *   exactly even when it is not the address they signed up to Quincy with.
 */

export const maxDuration = 30

/** Four megabytes, for the reason the Circleback route gives. */
const MAX_BODY_BYTES = 4 * 1024 * 1024

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const connection = await resolveByToken(token)

  // 404, not 401: a 401 confirms the path exists.
  if (!connection || connection.source !== "fathom" || !connection.signingSecret) {
    return new Response("Not found", { status: 404 })
  }

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) {
    return new Response("Body too large", { status: 413 })
  }

  // The raw text, never `request.json()`: the signature is over these bytes.
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return new Response("Body too large", { status: 413 })
  }

  const signed = await verifyStandardSignature(
    connection,
    raw,
    readStandardWebhookHeaders(request.headers)
  )

  if (!signed) {
    // Recorded, never marked broken: a stranger must not be able to switch
    // somebody's source off by POSTing at a URL they found.
    await recordSourceError(
      connection.id,
      "A delivery arrived that Quincy could not verify came from Fathom."
    )
    return new Response("Bad signature", { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response("Malformed body", { status: 400 })
  }

  const meeting = parseFathomMeeting(body)

  if (!meeting) {
    await recordSourceError(connection.id, "A delivery arrived from Fathom that did not look like a meeting.")
    return new Response("Not a meeting", { status: 400 })
  }

  return ingestMeeting({
    connection,
    source: "fathom",
    payload: meeting.payload,
    url: meeting.url,
    aliases: meeting.recorderEmail ? [meeting.recorderEmail] : [],
  })
}

/** Nothing else is allowed here: a GET to a leaked URL answers 405. */
export async function GET() {
  return new Response("Method not allowed", { status: 405 })
}
