import type { MeetingAttendee, MeetingPayload, MeetingSegment } from "./meetings"

/**
 * Fathom: a personal API key, and a webhook Quincy registers with it.
 *
 * Plans/019 recorded that Fathom lacked Circleback's no-OAuth path. That was
 * true when it was written and is not now: Fathom has personal API keys and
 * an API that creates a webhook and returns its `whsec_` secret in the same
 * response (https://developers.fathom.ai/webhooks). So the setup is one paste,
 * not Circleback's two: the user hands over a key, Quincy creates the webhook
 * pointed at its own per-user URL and keeps the secret, and nobody carries a
 * string back by hand.
 *
 * The webhook is created with `include_transcript` and nothing else. The
 * summary, the action items and the CRM matches are other people's products
 * built from other people's words, and plans/019 decided the transcript is
 * the only thing read; asking for less is the cheapest way to never store it.
 *
 * `triggered_for: ["my_recordings"]` and nothing else. A call someone else
 * recorded and shared is theirs to publish from, and it is also the case
 * where "the recorder is you" stops being true, which the speaker match below
 * leans on.
 */

export const FATHOM_API = "https://api.fathom.ai/external/v1"

/** How long one call to Fathom may take before Quincy gives up on it. */
const TIMEOUT_MS = 10_000

export type FathomWebhook = { id: string; secret: string }

export type FathomResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string }

export async function createFathomWebhook(
  apiKey: string,
  destinationUrl: string,
  fetcher: typeof fetch = fetch
): Promise<FathomResult<FathomWebhook>> {
  let response: Response
  try {
    response = await fetcher(`${FATHOM_API}/webhooks`, {
      method: "POST",
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        destination_url: destinationUrl,
        include_transcript: true,
        triggered_for: ["my_recordings"],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 0, message: "Fathom did not answer. Try again in a minute." }
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: response.status, message: "Fathom refused that key. Copy it again from Fathom's API Access settings." }
  }
  if (response.status === 429) {
    return { ok: false, status: 429, message: "Fathom is rate limiting. Try again in a minute." }
  }
  if (!response.ok) {
    return { ok: false, status: response.status, message: `Fathom could not create the webhook (${response.status}).` }
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === "string" ? body.id : ""
  const secret = typeof body?.secret === "string" ? body.secret : ""
  if (!id || !secret) {
    return { ok: false, status: response.status, message: "Fathom created a webhook but did not say how to verify it." }
  }

  return { ok: true, value: { id, secret } }
}

/**
 * Remove the webhook Quincy made. Best effort: a key revoked on Fathom's side
 * can no longer delete anything, and disconnecting must work anyway, because
 * the row going away is what makes the URL answer 404.
 */
export async function deleteFathomWebhook(
  apiKey: string,
  webhookId: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  if (!webhookId) return false
  try {
    const response = await fetcher(`${FATHOM_API}/webhooks/${encodeURIComponent(webhookId)}`, {
      method: "DELETE",
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.ok || response.status === 404
  } catch {
    return false
  }
}

/* ── The payload ──────────────────────────────────────────────────────── */

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/** "01:02:03" → 3723. Fathom's transcript timestamps are a clock, not seconds. */
export function clockToSeconds(value: unknown): number | null {
  const match = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(asString(value))
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

export type FathomMeeting = {
  payload: MeetingPayload
  /** Whose recording this is. On a `my_recordings` webhook, the key's owner. */
  recorderEmail: string
  url: string
}

/**
 * Fathom's "new meeting content ready" body, into the shape lib/meetings.ts
 * reads. Null for a body that is not a meeting.
 *
 * The join `ownSegments` makes is attendee email → attendee name → speaker
 * name, so the attendees are built to make that join exact:
 *
 * - **Each invitee's name is the speaker name Fathom matched them to**
 *   (`matched_speaker_display_name`), falling back to the calendar name. That
 *   is Fathom's own attribution, made with the audio, and it is better than
 *   anything Quincy could infer from a calendar.
 * - **The recorder is an attendee too.** A call recorded without a calendar
 *   invite has no invitees at all, and the recorder is still in the room.
 *
 * `default_summary`, `action_items`, `highlights` and `crm_matches` are never
 * read even if a webhook made elsewhere sends them. Same reasoning as
 * `DELIBERATELY_UNREAD` in lib/meetings.ts.
 */
export function parseFathomMeeting(body: unknown): FathomMeeting | null {
  if (!body || typeof body !== "object") return null
  const raw = body as Record<string, unknown>

  const recordingId =
    typeof raw.recording_id === "number" && Number.isFinite(raw.recording_id)
      ? String(raw.recording_id)
      : asString(raw.recording_id)
  if (!recordingId) return null

  const recorder = raw.recorded_by && typeof raw.recorded_by === "object" ? (raw.recorded_by as Record<string, unknown>) : {}
  const recorderEmail = asString(recorder.email)
  const recorderName = asString(recorder.name)

  const attendees: MeetingAttendee[] = Array.isArray(raw.calendar_invitees)
    ? raw.calendar_invitees.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return []
        const a = entry as Record<string, unknown>
        return [
          {
            name: asString(a.matched_speaker_display_name) || asString(a.name),
            email: asString(a.email),
          },
        ]
      })
    : []

  if (recorderEmail && !attendees.some((a) => a.email.toLowerCase() === recorderEmail.toLowerCase())) {
    attendees.push({ name: recorderName, email: recorderEmail })
  }

  const transcript: MeetingSegment[] = Array.isArray(raw.transcript)
    ? raw.transcript.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return []
        const s = entry as Record<string, unknown>
        const text = asString(s.text).trim()
        if (!text) return []
        const speaker = s.speaker && typeof s.speaker === "object" ? (s.speaker as Record<string, unknown>) : {}
        return [{ speaker: asString(speaker.display_name), text, timestamp: clockToSeconds(s.timestamp) }]
      })
    : []

  const start = parseDate(raw.recording_start_time) ?? parseDate(raw.created_at)
  const end = parseDate(raw.recording_end_time)

  return {
    recorderEmail,
    url: asString(raw.share_url) || asString(raw.url) || "https://fathom.video",
    payload: {
      id: recordingId,
      name: asString(raw.title).trim() || asString(raw.meeting_title).trim() || "Untitled meeting",
      createdAt: start,
      durationSeconds: start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)) : 0,
      attendees,
      transcript,
      tags: asString(raw.meeting_type) ? [asString(raw.meeting_type)] : [],
      icalUid: "",
    },
  }
}

function parseDate(value: unknown): Date | null {
  const s = asString(value)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
