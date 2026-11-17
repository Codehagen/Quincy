import { describe, expect, it } from "vitest"

import { createGranolaWebhook, fetchGranolaNote, parseGranolaEvent, parseGranolaNote } from "./granola"
import { ownSegments } from "./meetings"

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: "not_1d3tmYTlCICgjy",
    object: "note",
    title: "Roadmap with Raisin",
    owner: { name: "Christer Hagen", email: "christer@work.example" },
    created_at: "2026-11-17T09:00:00Z",
    web_url: "https://notes.granola.ai/d/abc",
    calendar_event: {
      event_title: "Roadmap",
      invitees: [{ email: "raisin@granola.example" }],
      organiser: "christer@work.example",
      calendar_event_id: "evt_1",
      scheduled_start_time: "2026-11-17T09:00:00Z",
      scheduled_end_time: "2026-11-17T09:30:00Z",
    },
    attendees: [
      { name: "Christer Hagen", email: "christer@work.example" },
      { name: "Raisin Patel", email: "raisin@granola.example" },
    ],
    summary_text: "They agreed on the roadmap.",
    private_notes_text: "Do not publish this.",
    transcript: [
      { speaker: { source: "speaker", attribution: "them" }, text: "Why ship weekly?", start_time: "2026-11-17T09:00:00Z", end_time: "2026-11-17T09:00:03Z" },
      { speaker: { source: "microphone", attribution: "me" }, text: "Because a week is the longest I can hold a bet.", start_time: "2026-11-17T09:00:04Z", end_time: "2026-11-17T09:00:09Z" },
      // A speaker Granola resolved to the owner's name but attributed to
      // someone else must never be read as the owner.
      { speaker: { source: "speaker", attribution: "them", name: "Christer Hagen" }, text: "Echo from the room.", start_time: "2026-11-17T09:00:10Z", end_time: "2026-11-17T09:00:11Z" },
    ],
    ...overrides,
  }
}

describe("parseGranolaNote", () => {
  it("labels the note taker's turns with their name, and only those", () => {
    const meeting = parseGranolaNote(note())!.payload
    expect(meeting.transcript.map((s) => s.speaker)).toEqual(["Them", "Christer Hagen", "Them"])
    expect(meeting.transcript[1].timestamp).toBe(4)
    expect(meeting.durationSeconds).toBe(30 * 60)
    expect(meeting.icalUid).toBe("evt_1")
  })

  it("keeps only what the owner said once ownSegments runs", () => {
    const meeting = parseGranolaNote(note())!.payload
    const match = ownSegments(meeting, ["christer@work.example"], "", "Granola")
    expect(match.ok).toBe(true)
    if (match.ok) expect(match.segments.map((s) => s.text)).toEqual(["Because a week is the longest I can hold a bet."])
  })

  it("never carries the summary or the private notes", () => {
    const text = JSON.stringify(parseGranolaNote(note()))
    expect(text).not.toContain("agreed on the roadmap")
    expect(text).not.toContain("Do not publish")
  })

  it("fails the match when the user is not the owner and was not named", () => {
    const meeting = parseGranolaNote(note({ owner: { name: "Raisin Patel", email: "raisin@granola.example" } }))!.payload
    const match = ownSegments(meeting, ["someone@else.example"], "", "Granola")
    expect(match.ok).toBe(false)
  })

  it("says when Granola told voices apart", () => {
    expect(parseGranolaNote(note())!.attributed).toBe(true)
  })

  it("says when it could not, as on a phone or watch recording", () => {
    const meeting = parseGranolaNote(
      note({
        transcript: [
          { speaker: { source: "speaker", diarization_label: "Speaker A" }, text: "One voice.", start_time: "2026-11-17T09:00:00Z" },
          { speaker: { source: "speaker", diarization_label: "Speaker B" }, text: "Another.", start_time: "2026-11-17T09:00:05Z" },
        ],
      })
    )!
    expect(meeting.attributed).toBe(false)
    expect(ownSegments(meeting.payload, ["christer@work.example"], "", "Granola").ok).toBe(false)
  })

  it("refuses a note with no id", () => {
    expect(parseGranolaNote({})).toBeNull()
  })
})

describe("parseGranolaEvent", () => {
  it("reads the documented shape", () => {
    expect(
      parseGranolaEvent({ event_id: "e1", event_type: "note.generated", note_id: "not_1d3tmYTlCICgjy", occurred_at: "2026-01-27T15:30:00Z" })
    ).toEqual({ eventId: "e1", eventType: "note.generated", noteId: "not_1d3tmYTlCICgjy" })
  })

  it("refuses a note id that could steer the fetch path", () => {
    expect(parseGranolaEvent({ event_type: "note.generated", note_id: "../webhook-endpoints" })).toBeNull()
  })
})

describe("createGranolaWebhook", () => {
  it("subscribes to first summaries on personal notes, and keeps who made it", async () => {
    let sent: RequestInit | null = null
    const fetcher = (async (_url: string, init: RequestInit) => {
      sent = init
      return Response.json(
        {
          id: "whe_1",
          signing_secret: "whsec_dGVzdA==",
          created_by: { name: "Christer Hagen", email: "christer@work.example" },
        },
        { status: 201 }
      )
    }) as unknown as typeof fetch

    const result = await createGranolaWebhook("grn_key", "https://quincy.example/api/webhooks/granola/t", fetcher)
    expect(result.ok && result.value.account.email).toBe("christer@work.example")
    expect(JSON.parse(String(sent!.body))).toEqual({
      url: "https://quincy.example/api/webhooks/granola/t",
      scopes: ["personal"],
      events: ["note.generated"],
    })
  })

  it("names the plan when Granola forbids the key", async () => {
    const fetcher = (async () => new Response("", { status: 403 })) as unknown as typeof fetch
    const result = await createGranolaWebhook("grn_key", "https://x.example", fetcher)
    expect(!result.ok && result.message).toMatch(/Business or Enterprise/)
  })
})

describe("fetchGranolaNote", () => {
  it("reads the transcript in pages when it is too large to inline", async () => {
    const calls: string[] = []
    const fetcher = (async (url: string) => {
      calls.push(url)
      if (url.includes("include=transcript")) return new Response("", { status: 413 })
      if (url.includes("/transcript?") && !url.includes("cursor=")) {
        return Response.json({ transcript: [{ text: "one" }], hasMore: true, cursor: "c2" })
      }
      if (url.includes("cursor=c2")) return Response.json({ transcript: [{ text: "two" }], hasMore: false, cursor: null })
      return Response.json(note({ transcript: null }))
    }) as unknown as typeof fetch

    const result = await fetchGranolaNote("grn_key", "not_1d3tmYTlCICgjy", fetcher)
    expect(result.ok && (result.note.transcript as { text: string }[]).map((t) => t.text)).toEqual(["one", "two"])
    expect(calls).toHaveLength(4)
  })

  it("retries rather than store a transcript cut short by a page that will not decode", async () => {
    const fetcher = (async (url: string) => {
      if (url.includes("include=transcript")) return new Response("", { status: 413 })
      if (url.includes("/transcript?") && !url.includes("cursor=")) {
        return Response.json({ transcript: [{ text: "one" }], hasMore: true, cursor: "c2" })
      }
      if (url.includes("cursor=c2")) return new Response("{ cut off", { status: 200 })
      return Response.json(note({ transcript: null }))
    }) as unknown as typeof fetch

    const result = await fetchGranolaNote("grn_key", "not_1d3tmYTlCICgjy", fetcher)
    expect(!result.ok && result.failure.kind).toBe("retry")
  })

  it("says refused, gone and retry apart", async () => {
    const answer = (status: number) => (async () => new Response("", { status })) as unknown as typeof fetch
    const kind = async (status: number) => {
      const r = await fetchGranolaNote("k", "not_1d3tmYTlCICgjy", answer(status))
      return r.ok ? "ok" : r.failure.kind
    }
    expect(await kind(401)).toBe("refused")
    expect(await kind(404)).toBe("gone")
    expect(await kind(429)).toBe("retry")
    expect(await kind(500)).toBe("retry")
  })
})
