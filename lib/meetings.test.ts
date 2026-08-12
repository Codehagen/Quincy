import { describe, expect, it } from "vitest"

import {
  assemblePassage,
  MAX_MEETING_CHARS,
  ownSegments,
  parseMeetingPayload,
  trimSegments,
  type MeetingPayload,
  type MeetingSegment,
} from "./meetings"

/**
 * The parts of plans/019 that are pure, and every one of them is a place where
 * being wrong is expensive rather than annoying.
 *
 * `ownSegments` decides whose words become a post published under the user's
 * name. `assemblePassage` is the guarantee that a model cannot invent a quote.
 * `parseMeetingPayload` is the boundary a third party's JSON crosses. None of
 * these can be exercised by running the feature — a model's output in
 * development is well-formed, and the transcripts it is handed are ours.
 *
 * No DOM environment in this repo (vitest runs `environment: "node"`), which is
 * why the route and the workflow are verified in scripts/verify-circleback.ts
 * against a real server instead.
 */

function segment(speaker: string, text: string): MeetingSegment {
  return { speaker, text, timestamp: null }
}

function meeting(overrides: Partial<MeetingPayload> = {}): MeetingPayload {
  return {
    id: "m_1",
    name: "Discovery call",
    createdAt: new Date("2026-08-09T10:00:00.000Z"),
    durationSeconds: 1800,
    attendees: [
      { name: "Christer Hagen", email: "christer@example.com" },
      { name: "Dana Okoro", email: "dana@client.example" },
    ],
    transcript: [
      segment("Dana Okoro", "So how does the pricing work?"),
      segment("Christer Hagen", "We charge per seat, and here is why."),
      segment("Dana Okoro", "Makes sense."),
      segment("Christer Hagen", "The hard part was never the writing."),
    ],
    tags: [],
    icalUid: "",
    ...overrides,
  }
}

describe("parseMeetingPayload", () => {
  it("reads a well-formed body", () => {
    const parsed = parseMeetingPayload({
      id: "m_9",
      name: "  Weekly  ",
      createdAt: "2026-08-09T10:00:00.000Z",
      duration: 900,
      attendees: [{ name: "A", email: "a@example.com" }],
      transcript: [{ speaker: "A", text: "hello", timestamp: 12 }],
      tags: ["sales"],
      icalUid: "ical-1",
    })

    expect(parsed?.id).toBe("m_9")
    expect(parsed?.name).toBe("Weekly")
    expect(parsed?.durationSeconds).toBe(900)
    expect(parsed?.transcript).toEqual([
      { speaker: "A", text: "hello", timestamp: 12 },
    ])
  })

  it("refuses a body with no meeting id", () => {
    // The id is what makes a redelivery a no-op. Without one there is no way
    // to store the meeting idempotently, so there is nothing safe to do.
    expect(parseMeetingPayload({ name: "Weekly" })).toBeNull()
    expect(parseMeetingPayload(null)).toBeNull()
    expect(parseMeetingPayload("a string")).toBeNull()
  })

  it("survives every field being the wrong type", () => {
    // A third party's JSON over the network. A shape assertion is not a shape
    // check, and the failure this prevents is a 500 on a payload the provider
    // will then retry forever.
    const parsed = parseMeetingPayload({
      id: "m_2",
      name: 42,
      createdAt: "not a date",
      duration: "long",
      attendees: "nobody",
      transcript: [null, { speaker: 1, text: "  kept  " }, { text: "" }],
      tags: [1, "real"],
    })

    expect(parsed).not.toBeNull()
    expect(parsed?.name).toBe("Untitled meeting")
    expect(parsed?.durationSeconds).toBe(0)
    expect(parsed?.attendees).toEqual([])
    // The empty-text entry is dropped, the junk one is dropped, and the one
    // real line survives trimmed.
    expect(parsed?.transcript).toEqual([
      { speaker: "", text: "kept", timestamp: null },
    ])
    expect(parsed?.tags).toEqual(["real"])
  })

  it("nulls an unparseable date rather than passing Invalid Date on", () => {
    // `new Date("not a date")` reaches Postgres as NaN and fails the insert
    // with a message about the wrong thing entirely.
    expect(parseMeetingPayload({ id: "m", createdAt: "nope" })?.createdAt).toBe(
      null
    )
  })
})

describe("ownSegments", () => {
  it("keeps only the user's turns", () => {
    const match = ownSegments(meeting(), ["christer@example.com"])

    expect(match.ok).toBe(true)
    if (!match.ok) return

    expect(match.speaker).toBe("Christer Hagen")
    expect(match.segments.map((s) => s.text)).toEqual([
      "We charge per seat, and here is why.",
      "The hard part was never the writing.",
    ])
  })

  it("matches the address case-insensitively", () => {
    expect(ownSegments(meeting(), ["CHRISTER@Example.COM"]).ok).toBe(true)
  })

  it("falls back to an exact name match when no address matches", () => {
    // The likeliest real failure is mundane: the address on the calendar
    // invite is not the address the Quincy account was made with.
    const match = ownSegments(
      meeting(),
      ["someone-else@quincy.test"],
      "Christer Hagen"
    )

    expect(match.ok).toBe(true)
    if (match.ok) expect(match.speaker).toBe("Christer Hagen")
  })

  it("never guesses when nothing matches", () => {
    // The whole of decision 2 in plans/019. A guess here is a post written in
    // a customer's voice, published under the user's name, with nothing
    // downstream able to reveal which had happened.
    const match = ownSegments(meeting(), ["nobody@quincy.test"], "Nobody At All")

    expect(match.ok).toBe(false)
    if (!match.ok) expect(match.message).toMatch(/which voice was yours/)
  })

  it("refuses an attendee Circleback could not name", () => {
    const match = ownSegments(
      meeting({
        attendees: [{ name: "", email: "christer@example.com" }],
      }),
      ["christer@example.com"]
    )

    expect(match.ok).toBe(false)
  })

  it("refuses when the named attendee never appears as a speaker", () => {
    // Circleback labelled the speakers "Speaker 1" and "Speaker 2". The
    // attendee list matched and the transcript still cannot be attributed.
    const match = ownSegments(
      meeting({
        transcript: [
          segment("Speaker 1", "So how does the pricing work?"),
          segment("Speaker 2", "We charge per seat."),
        ],
      }),
      ["christer@example.com"]
    )

    expect(match.ok).toBe(false)
    if (!match.ok) expect(match.message).toMatch(/Christer Hagen/)
  })

  it("refuses when no address is known at all", () => {
    expect(ownSegments(meeting(), []).ok).toBe(false)
    expect(ownSegments(meeting(), ["", "  "]).ok).toBe(false)
  })
})

describe("trimSegments", () => {
  it("keeps everything under the ceiling", () => {
    const segments = [segment("A", "one"), segment("A", "two")]
    const trimmed = trimSegments(segments)

    expect(trimmed.segments).toHaveLength(2)
    expect(trimmed.dropped).toBe(0)
  })

  it("drops from the front, keeping the end of the call", () => {
    // A conversation lands its conclusions late. Cutting the tail would throw
    // away the decision to keep the small talk that preceded it.
    const segments = [
      segment("A", "a".repeat(40)),
      segment("A", "b".repeat(40)),
      segment("A", "c".repeat(40)),
    ]

    const trimmed = trimSegments(segments, 90)

    expect(trimmed.dropped).toBe(1)
    expect(trimmed.segments.map((s) => s.text[0])).toEqual(["b", "c"])
  })

  it("never cuts a segment in half", () => {
    // Whole segments, because selectMoment addresses them by index — and
    // because half a sentence quoted back is the user saying something they
    // did not finish.
    const segments = [segment("A", "x".repeat(50)), segment("A", "y".repeat(50))]
    const trimmed = trimSegments(segments, 60)

    expect(trimmed.segments).toHaveLength(1)
    expect(trimmed.segments[0].text).toBe("y".repeat(50))
  })

  it("returns nothing rather than a fragment when one segment exceeds the limit", () => {
    const trimmed = trimSegments([segment("A", "z".repeat(100))], 10)

    expect(trimmed.segments).toEqual([])
    expect(trimmed.dropped).toBe(1)
  })

  it("defaults to the documented ceiling", () => {
    const many = Array.from({ length: 2000 }, () => segment("A", "x".repeat(20)))
    const trimmed = trimSegments(many)
    const total = trimmed.segments.reduce((n, s) => n + s.text.length + 1, 0)

    expect(total).toBeLessThanOrEqual(MAX_MEETING_CHARS)
    expect(trimmed.dropped).toBeGreaterThan(0)
  })
})

describe("assemblePassage", () => {
  const segments = [
    segment("A", "zero"),
    segment("A", "one"),
    segment("A", "two"),
    segment("A", "three"),
  ]

  it("quotes verbatim from the transcript", () => {
    expect(assemblePassage(segments, [1, 2])).toBe("one two")
  })

  it("sorts, so the user is quoted in the order they spoke", () => {
    expect(assemblePassage(segments, [3, 1])).toBe("one three")
  })

  it("drops duplicates", () => {
    expect(assemblePassage(segments, [1, 1, 1])).toBe("one")
  })

  it("drops indices that are not real positions", () => {
    // A model that hallucinated a line number cannot quote a line that does
    // not exist — the worst it can do is pick the wrong ones, which is visible
    // on the card.
    expect(assemblePassage(segments, [-1, 99, 1.5, NaN, 2])).toBe("two")
  })

  it("returns nothing for a non-array, which is the model saying no", () => {
    expect(assemblePassage(segments, null)).toBe("")
    expect(assemblePassage(segments, [])).toBe("")
    expect(assemblePassage(segments, "1,2")).toBe("")
  })

  it("caps the passage, keeping its start", () => {
    const many = Array.from({ length: 40 }, (_, i) => segment("A", `s${i}`))
    const all = many.map((_, i) => i)

    const passage = assemblePassage(many, all)

    expect(passage.split(" ")).toHaveLength(12)
    expect(passage.startsWith("s0 s1")).toBe(true)
  })

  it("cannot emit a character the transcript did not contain", () => {
    // The guarantee the whole design rests on, stated as a property rather
    // than as an example: every word of the output came out of the input.
    const passage = assemblePassage(segments, [0, 1, 2, 3])
    const vocabulary = new Set(segments.map((s) => s.text))

    for (const word of passage.split(" ")) {
      expect(vocabulary.has(word)).toBe(true)
    }
  })
})
