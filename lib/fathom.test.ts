import { describe, expect, it } from "vitest"

import { clockToSeconds, createFathomWebhook, fathomRecorderAliases, parseFathomMeeting } from "./fathom"
import { ownSegments } from "./meetings"

/** A body in the shape Fathom's "new meeting content ready" webhook sends. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    title: "Pricing with Acme",
    meeting_title: "Acme / Quincy",
    recording_id: 123456789,
    url: "https://fathom.video/calls/123456789",
    share_url: "https://fathom.video/share/abc",
    created_at: "2026-11-17T09:00:00Z",
    recording_start_time: "2026-11-17T09:00:00Z",
    recording_end_time: "2026-11-17T09:45:00Z",
    recorded_by: { name: "Christer Hagen", email: "christer@work.example", email_domain: "work.example", team: null },
    calendar_invitees: [
      { name: "Christer Hagen", matched_speaker_display_name: "Christer", email: "christer@work.example", email_domain: "work.example", is_external: false },
      { name: "Dana Buyer", matched_speaker_display_name: "Dana", email: "dana@acme.example", email_domain: "acme.example", is_external: true },
    ],
    transcript: [
      { speaker: { display_name: "Dana", matched_calendar_invitee_email: "dana@acme.example" }, text: "What does it cost?", timestamp: "00:00:05" },
      { speaker: { display_name: "Christer", matched_calendar_invitee_email: "christer@work.example" }, text: "Less than the hour you spend writing.", timestamp: "00:00:09" },
      { speaker: { display_name: "Christer", matched_calendar_invitee_email: "christer@work.example" }, text: "   ", timestamp: "00:00:12" },
    ],
    default_summary: { markdown_formatted: "Dana asked about price." },
    action_items: [{ description: "Send Dana the deck" }],
    ...overrides,
  }
}

describe("parseFathomMeeting", () => {
  it("maps the recording into a meeting, keyed by the recording id", () => {
    const meeting = parseFathomMeeting(body())!
    expect(meeting.payload.id).toBe("123456789")
    expect(meeting.payload.name).toBe("Pricing with Acme")
    expect(meeting.payload.durationSeconds).toBe(45 * 60)
    expect(meeting.payload.transcript).toHaveLength(2)
    expect(meeting.payload.transcript[1].timestamp).toBe(9)
    expect(meeting.recorderEmail).toBe("christer@work.example")
    expect(meeting.url).toBe("https://fathom.video/share/abc")
  })

  it("names each attendee by the speaker Fathom matched them to", () => {
    const meeting = parseFathomMeeting(body())!
    expect(meeting.payload.attendees.map((a) => a.name)).toEqual(["Christer", "Dana"])
  })

  it("never carries the summary or the action items", () => {
    const meeting = parseFathomMeeting(body())!
    expect(JSON.stringify(meeting)).not.toContain("deck")
    expect(JSON.stringify(meeting)).not.toContain("asked about price")
  })

  it("keeps only the user's turns once ownSegments runs, by the recorder's address", () => {
    const meeting = parseFathomMeeting(body())!
    // Quincy knows a different address; the recorder alias is what joins.
    const match = ownSegments(meeting.payload, ["christer@quincy.example", meeting.recorderEmail], "Christer Hagen", "Fathom")
    expect(match.ok).toBe(true)
    if (match.ok) expect(match.segments.map((s) => s.text)).toEqual(["Less than the hour you spend writing."])
  })

  it("adds the recorder when a call had no calendar invite", () => {
    const meeting = parseFathomMeeting(
      body({
        calendar_invitees: [],
        transcript: [{ speaker: { display_name: "Christer Hagen" }, text: "A thing worth saying.", timestamp: "00:01:00" }],
      })
    )!
    const match = ownSegments(meeting.payload, [meeting.recorderEmail], "", "Fathom")
    expect(match.ok).toBe(true)
  })

  it("finds the recorder by Fathom's own voice match when the names differ", () => {
    const meeting = parseFathomMeeting(
      body({
        calendar_invitees: [],
        transcript: [
          { speaker: { display_name: "Speaker 2", matched_calendar_invitee_email: null }, text: "Not mine.", timestamp: "00:00:30" },
          { speaker: { display_name: "Christer", matched_calendar_invitee_email: "christer@work.example" }, text: "Mine, and short.", timestamp: "00:01:00" },
        ],
      })
    )!
    const match = ownSegments(meeting.payload, [meeting.recorderEmail], "Christer Hagen", "Fathom")
    expect(match.ok).toBe(true)
    if (match.ok) expect(match.segments.map((s) => s.text)).toEqual(["Mine, and short."])
  })

  it("names an invitee Fathom did not match by the transcript label for their address", () => {
    const meeting = parseFathomMeeting(
      body({
        calendar_invitees: [
          { name: "Dana Buyer", matched_speaker_display_name: null, email: "dana@acme.example", is_external: true },
        ],
      })
    )!
    expect(meeting.payload.attendees.find((a) => a.email === "dana@acme.example")?.name).toBe("Dana")
  })

  it("refuses a body that is not a meeting", () => {
    expect(parseFathomMeeting(null)).toBeNull()
    expect(parseFathomMeeting({ title: "No id" })).toBeNull()
  })
})

describe("clockToSeconds", () => {
  it("reads Fathom's clock", () => {
    expect(clockToSeconds("01:02:03")).toBe(3723)
    expect(clockToSeconds("nope")).toBeNull()
  })
})

describe("createFathomWebhook", () => {
  it("asks for the transcript of the user's own recordings, and nothing else", async () => {
    let sent: { url: string; init: RequestInit } | null = null
    const fetcher = (async (url: string, init: RequestInit) => {
      sent = { url, init }
      return Response.json({ id: "wh_1", secret: "whsec_dGVzdA==" }, { status: 201 })
    }) as unknown as typeof fetch

    const result = await createFathomWebhook("key", "https://quincy.example/api/webhooks/fathom/t", fetcher)
    expect(result).toEqual({ ok: true, value: { id: "wh_1", secret: "whsec_dGVzdA==" } })
    expect(sent!.url).toBe("https://api.fathom.ai/external/v1/webhooks")
    expect((sent!.init.headers as Record<string, string>)["X-Api-Key"]).toBe("key")
    expect(JSON.parse(String(sent!.init.body))).toEqual({
      destination_url: "https://quincy.example/api/webhooks/fathom/t",
      include_transcript: true,
      triggered_for: ["my_recordings"],
    })
  })

  it("says a refused key in words", async () => {
    const fetcher = (async () => new Response("", { status: 401 })) as unknown as typeof fetch
    const result = await createFathomWebhook("bad", "https://x.example", fetcher)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/refused that key/)
  })
})

describe("fathomRecorderAliases", () => {
  it("trusts the recorder when it is the one pinned on the connection", () => {
    expect(fathomRecorderAliases("christer@work.example", "Christer@Work.example")).toEqual(["Christer@Work.example"])
  })

  it("does not trust a different recorder, as on a webhook widened to team recordings", () => {
    expect(fathomRecorderAliases("christer@work.example", "dana@work.example")).toEqual([])
  })

  it("trusts nothing when nothing is pinned or nobody recorded", () => {
    expect(fathomRecorderAliases("", "christer@work.example")).toEqual([])
    expect(fathomRecorderAliases("christer@work.example", "")).toEqual([])
  })

  it("keeps a colleague's recording from being read as the user's own words", () => {
    // Recorded by Dana, a teammate; the user is not on the call under any
    // address Quincy knows, so the match fails rather than taking Dana's turns.
    const colleague = parseFathomMeeting(
      body({
        recorded_by: { name: "Dana Teammate", email: "dana@work.example" },
        calendar_invitees: [],
        transcript: [{ speaker: { display_name: "Dana Teammate" }, text: "Here is our plan.", timestamp: "00:00:01" }],
      })
    )!
    const aliases = fathomRecorderAliases("christer@work.example", colleague.recorderEmail)
    expect(ownSegments(colleague.payload, ["christer@quincy.example", ...aliases], "Christer Hagen").ok).toBe(false)
  })
})
