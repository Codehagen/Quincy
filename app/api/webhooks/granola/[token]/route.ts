import { fetchGranolaNote, parseGranolaEvent, parseGranolaNote } from "@/lib/granola"
import { ingestMeeting } from "@/lib/meeting-intake"
import {
  markBroken,
  recordSourceError,
  resolveByToken,
  verifyStandardSignature,
  withApiKey,
} from "@/lib/source-connections"
import { readStandardWebhookHeaders } from "@/lib/standard-webhooks"

/**
 * A Granola note is generated; Granola says which; Quincy fetches it with the
 * user's key; a riff appears.
 *
 * The Fathom route's shape (read the Circleback route for the argument), with
 * one step Fathom does not have: Granola's delivery is an id, not a meeting.
 * So the route verifies, then fetches, then hands the note to the same intake.
 *
 * The fetch changes what each failure means:
 *
 * - **Granola refuses the key (401)**: the source is marked broken. This is
 *   the one place in a webhook route that may, because the refusal comes from
 *   Granola about the user's own key, after a verified delivery. A stranger
 *   cannot produce it.
 * - **Granola is down or rate limiting**: 503, so Granola retries. It does for
 *   four days, reusing `event_id`, and the dedup key makes a late success a
 *   single row.
 * - **The note is not readable** (no summary yet, deleted, not shared): 200
 *   and nothing, because there is nothing to retry.
 *
 * Granola gives an endpoint fifteen seconds. The fetch is two calls when the
 * transcript fits inline, and the drafting itself runs in a workflow after the
 * answer, so the clock is spent on reading, never on a model.
 */

export const maxDuration = 30

/** A delivery is four fields. Anything near this is not from Granola. */
const MAX_BODY_BYTES = 64 * 1024

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const connection = await resolveByToken(token)

  if (!connection || connection.source !== "granola" || !connection.signingSecret || !connection.apiKey) {
    return new Response("Not found", { status: 404 })
  }

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_BODY_BYTES) {
    return new Response("Body too large", { status: 413 })
  }

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
    await recordSourceError(
      connection.id,
      "A delivery arrived that Quincy could not verify came from Granola."
    )
    return new Response("Bad signature", { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response("Malformed body", { status: 400 })
  }

  const event = parseGranolaEvent(body)
  if (!event) {
    await recordSourceError(connection.id, "A delivery arrived from Granola that did not name a note.")
    return new Response("Not an event", { status: 400 })
  }

  // Only a first summary. The webhook asks for nothing else, so anything else
  // is a webhook somebody widened in Granola's settings; ignored, not an error.
  if (event.eventType !== "note.generated") {
    return Response.json({ state: "ignored", reason: event.eventType })
  }

  const fetched = await withApiKey(connection, (apiKey) => fetchGranolaNote(apiKey, event.noteId))

  if (!fetched || !fetched.ok) {
    const failure = fetched?.failure ?? { kind: "refused" as const, status: 401 }

    if (failure.kind === "refused") {
      await markBroken(connection.id, "Granola refused your API key. It may have been revoked.")
      return Response.json({ state: "stopped", reason: "key-refused" })
    }
    if (failure.kind === "gone") {
      return Response.json({ state: "ignored", reason: "note-unreadable" })
    }
    return new Response("Granola did not answer", { status: 503 })
  }

  const meeting = parseGranolaNote(fetched.note)

  if (!meeting) {
    await recordSourceError(connection.id, "Granola sent a note Quincy could not read.")
    return Response.json({ state: "ignored", reason: "unreadable" })
  }

  const meta = connection.meta as { accountEmail?: unknown }

  return ingestMeeting({
    connection,
    source: "granola",
    payload: meeting.payload,
    url: typeof fetched.note.web_url === "string" ? fetched.note.web_url : "https://notes.granola.ai",
    aliases: typeof meta.accountEmail === "string" && meta.accountEmail ? [meta.accountEmail] : [],
    unattributed: meeting.attributed
      ? undefined
      : "Granola recorded this call on a phone or watch, where it cannot tell voices apart, so Quincy could not tell which voice was yours.",
  })
}

export async function GET() {
  return new Response("Method not allowed", { status: 405 })
}
