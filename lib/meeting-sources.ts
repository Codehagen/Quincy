/**
 * Every note taker Quincy reads calls from, in one place. See plans/033.
 *
 * Client-safe on purpose: the connectors page reads `key` to say where an API
 * key lives. The vendor API calls that go with an entry are in
 * lib/meeting-sources-server.ts, which only the server action imports.
 *
 * Adding a note taker: an entry here, a `KEY_SOURCE_API` entry if it connects
 * by key, a `lib/<vendor>.ts` client and mapper, a route under
 * app/api/webhooks, and the lists lib/meeting-sources.test.ts names. That test
 * is the checklist.
 */

export const MEETING_SOURCE_IDS = ["circleback", "fathom", "granola"] as const
export type MeetingSource = (typeof MEETING_SOURCE_IDS)[number]

export type MeetingSourceInfo = {
  /** The vendor's own name, as it appears in sentences. */
  vendor: string
  /** How it connects. `url-and-secret` is Circleback's two steps; `api-key` is one paste. */
  setup: "url-and-secret" | "api-key"
  /** For `api-key` only: where the key lives, in the vendor's own words, and a link. */
  key?: { where: string; href: string; note: string }
}

export const MEETING_SOURCES = {
  circleback: { vendor: "Circleback", setup: "url-and-secret" },
  fathom: {
    vendor: "Fathom",
    setup: "api-key",
    key: {
      where: "Fathom → Settings → API Access → Generate API key",
      href: "https://fathom.video/customize#api-access-header",
      note: "I make the webhook with it, for calls you record. Nothing else in your Fathom changes.",
    },
  },
  granola: {
    vendor: "Granola",
    setup: "api-key",
    key: {
      where: "Granola → Settings → API → Create new key, as a personal key",
      href: "https://docs.granola.ai/help-center/sharing/integrations/granola-api",
      note: "I make the webhook with it and read each note it tells me about. The API needs a Business or Enterprise plan.",
    },
  },
} as const satisfies Record<MeetingSource, MeetingSourceInfo>

/** The meeting sources that connect with one pasted API key. */
export type KeySource = {
  [K in MeetingSource]: (typeof MEETING_SOURCES)[K]["setup"] extends "api-key" ? K : never
}[MeetingSource]

export function isMeetingSource(value: string): value is MeetingSource {
  return (MEETING_SOURCE_IDS as readonly string[]).includes(value)
}

export function isKeySource(value: string): value is KeySource {
  return isMeetingSource(value) && MEETING_SOURCES[value].setup === "api-key"
}
