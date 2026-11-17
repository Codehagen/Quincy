import type { MeetingAttendee, MeetingPayload, MeetingSegment } from "./meetings"

/**
 * Granola: a personal API key, a webhook Quincy registers with it, and a note
 * fetched back with the same key. See https://docs.granola.ai/webhooks.
 *
 * The one real difference from Circleback and Fathom: **Granola's delivery
 * carries no content.** It says which note was generated, and the transcript
 * has to be fetched with the user's key. That is why this source stores the
 * key at all, and it is a better privacy story than a push, not a worse one:
 * access is checked by Granola at fetch time, so a delivery can never expose
 * more than the key could read.
 *
 * Only `note.generated`. `note.edited` is a summary edit, which carries no new
 * speech, and `note.access_granted` is somebody else's call shared with you,
 * which is theirs to publish from.
 *
 * Granola's API is on Business and Enterprise plans only. A key from a plan
 * without it fails at connect, with that sentence, rather than later.
 */

export const GRANOLA_API = "https://public-api.granola.ai"

const TIMEOUT_MS = 10_000

/** Pages of 100 transcript items. Thirty is a three-hour workshop; past that, enough. */
const MAX_TRANSCRIPT_PAGES = 30

export type GranolaResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string }

export type GranolaWebhook = {
  id: string
  secret: string
  /** Who made it: the key's owner, as Granola knows them. */
  account: { name: string; email: string }
}

function refused(status: number): string {
  return status === 403
    ? "Granola refused that key. The API needs a Business or Enterprise plan, and your workspace may have it turned off."
    : "Granola refused that key. Copy it again from Settings → API in Granola."
}

export async function createGranolaWebhook(
  apiKey: string,
  url: string,
  fetcher: typeof fetch = fetch
): Promise<GranolaResult<GranolaWebhook>> {
  let response: Response
  try {
    response = await fetcher(`${GRANOLA_API}/v1/webhook-endpoints`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      // `personal` only: notes you own or that were shared with you directly.
      // `public` is every workspace-visible note, which is other people's calls.
      body: JSON.stringify({ url, scopes: ["personal"], events: ["note.generated"] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    return { ok: false, status: 0, message: "Granola did not answer. Try again in a minute." }
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: response.status, message: refused(response.status) }
  }
  if (response.status === 429) {
    return { ok: false, status: 429, message: "Granola is rate limiting. Try again in a minute." }
  }
  if (!response.ok) {
    return { ok: false, status: response.status, message: `Granola could not create the webhook (${response.status}).` }
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof body?.id === "string" ? body.id : ""
  const secret = typeof body?.signing_secret === "string" ? body.signing_secret : ""
  if (!id || !secret) {
    return { ok: false, status: response.status, message: "Granola created a webhook but did not say how to verify it." }
  }

  const by = body?.created_by && typeof body.created_by === "object" ? (body.created_by as Record<string, unknown>) : {}
  return {
    ok: true,
    value: {
      id,
      secret,
      account: { name: typeof by.name === "string" ? by.name : "", email: typeof by.email === "string" ? by.email : "" },
    },
  }
}

/** Best effort, for the reason `deleteFathomWebhook` gives. */
export async function deleteGranolaWebhook(
  apiKey: string,
  webhookId: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  if (!webhookId) return false
  try {
    const response = await fetcher(`${GRANOLA_API}/v1/webhook-endpoints/${encodeURIComponent(webhookId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.ok || response.status === 404
  } catch {
    return false
  }
}

/* ── The delivery ─────────────────────────────────────────────────────── */

export type GranolaEvent = { eventId: string; eventType: string; noteId: string }

export function parseGranolaEvent(body: unknown): GranolaEvent | null {
  if (!body || typeof body !== "object") return null
  const raw = body as Record<string, unknown>
  const noteId = typeof raw.note_id === "string" ? raw.note_id : ""
  const eventType = typeof raw.event_type === "string" ? raw.event_type : ""
  // The id Granola validates against, so a body cannot steer the fetch path.
  if (!/^not_[a-zA-Z0-9]{14}$/i.test(noteId) || !eventType) return null
  return { eventId: typeof raw.event_id === "string" ? raw.event_id : "", eventType, noteId }
}

/**
 * Why a fetch failed, in the terms the route acts on.
 *
 * - `refused`: the key no longer works. The one case that marks the source
 *   broken, because it is the user's own key telling us so.
 * - `gone`: the note is not readable (deleted, no summary, not shared). Nothing
 *   to retry and nothing broken.
 * - `retry`: Granola is down or rate limiting. The route answers 5xx so
 *   Granola retries, which it does for four days.
 */
export type NoteFailure = { kind: "refused" | "gone" | "retry"; status: number }

export type GranolaNote = Record<string, unknown>

/**
 * The note, with its transcript. Inline when it fits; in pages when Granola
 * answers `413` (TRANSCRIPT_TOO_LARGE), which is its documented way of saying
 * the transcript has to be read from /transcript.
 */
export async function fetchGranolaNote(
  apiKey: string,
  noteId: string,
  fetcher: typeof fetch = fetch
): Promise<{ ok: true; note: GranolaNote } | { ok: false; failure: NoteFailure }> {
  const get = (path: string) =>
    fetcher(`${GRANOLA_API}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

  const fail = (status: number): { ok: false; failure: NoteFailure } => ({
    ok: false,
    failure: {
      status,
      kind: status === 401 ? "refused" : status === 404 || status === 400 ? "gone" : "retry",
    },
  })

  const id = encodeURIComponent(noteId)
  let response: Response
  try {
    response = await get(`/v1/notes/${id}?include=transcript`)
  } catch {
    return fail(0)
  }

  if (response.ok) {
    const note = (await response.json().catch(() => null)) as GranolaNote | null
    return note ? { ok: true, note } : fail(502)
  }
  if (response.status !== 413) return fail(response.status)

  try {
    const meta = await get(`/v1/notes/${id}`)
    if (!meta.ok) return fail(meta.status)
    const note = (await meta.json().catch(() => null)) as GranolaNote | null
    if (!note) return fail(502)

    const items: unknown[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_TRANSCRIPT_PAGES; page += 1) {
      const query = new URLSearchParams({ page_size: "100" })
      if (cursor) query.set("cursor", cursor)
      const res = await get(`/v1/notes/${id}/transcript?${query}`)
      // 403: a workspace admin has turned transcripts off over the API. The
      // note stays readable and has nothing of the user's in it.
      if (res.status === 403) break
      if (!res.ok) return fail(res.status)
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (Array.isArray(body?.transcript)) items.push(...body.transcript)
      cursor = typeof body?.cursor === "string" ? body.cursor : null
      if (!body?.hasMore || !cursor) break
    }

    return { ok: true, note: { ...note, transcript: items } }
  } catch {
    return fail(0)
  }
}

/* ── The note, as a meeting ───────────────────────────────────────────── */

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

/**
 * A Granola note into the shape lib/meetings.ts reads.
 *
 * Granola does not name most speakers. It does something better for this
 * purpose: every transcript item says whether the note taker said it
 * (`attribution: "me"`) or someone else did (`"them"`). So the owner is the
 * one attendee whose turns can always be found, and the mapping makes that
 * exact: the owner's turns are labelled with the owner's name, and the owner
 * is an attendee under their own address. `ownSegments` then joins as it does
 * for every vendor, and fails as it does when the user is not the owner.
 *
 * Other speakers keep the name Granola resolved, or their anonymous label, or
 * "Them". They are dropped by `ownSegments` either way; the label only has to
 * be something that is not the owner's name.
 *
 * `summary_*` and `private_notes_*` are never read. The summary is Granola's
 * writing about everyone's words; the private notes are the user's, but they
 * are notes to self, and a draft written from them would publish something
 * the user wrote on purpose for nobody.
 */
export function parseGranolaNote(note: GranolaNote): MeetingPayload | null {
  const id = asString(note.id)
  if (!id) return null

  const owner = record(note.owner)
  const ownerEmail = asString(owner.email)
  const ownerName = asString(owner.name).trim() || ownerEmail

  const attendees: MeetingAttendee[] = []
  if (ownerEmail) attendees.push({ name: ownerName, email: ownerEmail })
  if (Array.isArray(note.attendees)) {
    for (const entry of note.attendees) {
      const a = record(entry)
      const email = asString(a.email)
      if (!email || email.toLowerCase() === ownerEmail.toLowerCase()) continue
      attendees.push({ name: asString(a.name), email })
    }
  }

  const items = Array.isArray(note.transcript) ? note.transcript : []
  const first = items.length > 0 ? Date.parse(asString(record(items[0]).start_time)) : Number.NaN

  const transcript: MeetingSegment[] = items.flatMap((entry) => {
    const s = record(entry)
    const text = asString(s.text).trim()
    if (!text) return []
    const speaker = record(s.speaker)
    const label =
      speaker.attribution === "me"
        ? ownerName
        : asString(speaker.name) || asString(speaker.diarization_label) || "Them"
    // Never the owner's name for a turn Granola says was not theirs.
    const safe = speaker.attribution !== "me" && label.trim().toLowerCase() === ownerName.trim().toLowerCase() ? "Them" : label
    const at = Date.parse(asString(s.start_time))
    return [
      {
        speaker: safe,
        text,
        timestamp: Number.isFinite(at) && Number.isFinite(first) ? Math.max(0, Math.round((at - first) / 1000)) : null,
      },
    ]
  })

  const event = record(note.calendar_event)
  const start = Date.parse(asString(event.scheduled_start_time))
  const end = Date.parse(asString(event.scheduled_end_time))
  const created = new Date(asString(note.created_at))

  return {
    id,
    name: asString(note.title).trim() || asString(event.event_title).trim() || "Untitled meeting",
    createdAt: Number.isNaN(created.getTime()) ? null : created,
    durationSeconds: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : 0,
    attendees,
    transcript,
    tags: [],
    icalUid: asString(event.calendar_event_id),
  }
}
