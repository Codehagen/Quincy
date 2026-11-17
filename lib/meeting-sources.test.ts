import { describe, expect, it } from "vitest"

import { LIVE } from "./connectors"
import { isKeySource, isMeetingSource, MEETING_SOURCE_IDS, MEETING_SOURCES } from "./meeting-sources"
import { RHYTHMS } from "./rhythms"
import { SOURCE_ITEM_SOURCES } from "./schema-app"
import { SOURCES } from "./sources"

/**
 * The lists a meeting source must also be in, which stay where they are for
 * their own reasons (plans/033): a database enum, the rhythm's inputs, the
 * connectors catalogue and the sources page. Missing from any one of them
 * fails silently in the product, so it fails loudly here, and each message says
 * where to add it.
 */
describe("every meeting source is wired everywhere it has to be", () => {
  const meetingNotes = RHYTHMS.find((r) => r.id === "meeting-notes")

  for (const id of MEETING_SOURCE_IDS) {
    it(`${id}: add it to SOURCE_ITEM_SOURCES in lib/schema-app.ts, or its calls cannot be stored`, () => {
      expect(SOURCE_ITEM_SOURCES as readonly string[]).toContain(id)
    })

    it(`${id}: add it to the meeting-notes rhythm's \`from\` in lib/rhythms.ts, or /rhythm does not show it as an input`, () => {
      expect(meetingNotes?.from as readonly string[] | undefined).toContain(id)
    })

    it(`${id}: add it to LIVE in lib/connectors.ts, or /connectors never offers it`, () => {
      expect(LIVE.map((entry) => entry.id)).toContain(id)
    })

    it(`${id}: add it to SOURCES in lib/sources.ts, or the sources list leaves it out`, () => {
      expect(SOURCES.map((source) => source.id)).toContain(id)
    })
  }

  it("every source that connects with a key says where the key lives", () => {
    for (const id of MEETING_SOURCE_IDS) {
      const info: { setup: string; key?: { where: string; href: string; note: string } } = MEETING_SOURCES[id]
      if (info.setup !== "api-key") continue
      expect(info.key?.where, `${id} needs key.where in lib/meeting-sources.ts`).toBeTruthy()
      expect(info.key?.href, `${id} needs key.href in lib/meeting-sources.ts`).toMatch(/^https:\/\//)
    }
  })
})

describe("isKeySource", () => {
  it("is true only for sources that connect with one pasted key", () => {
    expect(isKeySource("fathom")).toBe(true)
    expect(isKeySource("granola")).toBe(true)
    expect(isKeySource("circleback")).toBe(false)
    expect(isKeySource("github")).toBe(false)
    expect(isMeetingSource("circleback")).toBe(true)
    expect(isMeetingSource("x")).toBe(false)
  })
})
