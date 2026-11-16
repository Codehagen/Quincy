import { describe, expect, it } from "vitest"
import type { UIMessage } from "ai"

import {
  currentDraftsFromParts,
  draftedMessage,
  withCurrentDraftNote,
  type DraftVersionRef,
} from "./draft-artifact"

const VERSION: DraftVersionRef = {
  versionId: "draft-1-x",
  channel: "x",
  label: "X",
  body: "In August I made $4.1k.",
  state: "writing",
  updatedAt: "2026-09-10T12:00:00.000Z",
}

describe("draftedMessage", () => {
  it("does not send the reader to /drafts", () => {
    const out = draftedMessage({
      existing: false,
      channels: ["X"],
      fellBack: [],
      overLimit: [],
    })
    expect(out).toMatch(/in this conversation/)
    expect(out).toMatch(/Nothing goes out until you do/)
    expect(out).not.toMatch(/\/drafts/)
  })
})

describe("currentDraftsFromParts", () => {
  it("keeps the latest tool result per version", () => {
    const first = {
      parts: [
        {
          type: "tool-draft_angle",
          state: "output-available",
          output: {
            ok: true,
            message: "Drafted.",
            pieceId: "drf_1",
            versions: [VERSION],
            existing: false,
            fellBack: [],
            overLimit: [],
          },
        },
      ],
    }
    const revised = {
      parts: [
        {
          type: "tool-revise_version",
          state: "output-available",
          output: {
            ok: true,
            message: "Revised.",
            pieceId: "drf_1",
            versions: [{ ...VERSION, body: "Shorter." }],
            existing: false,
            fellBack: [],
            overLimit: [],
          },
        },
      ],
    }

    expect(currentDraftsFromParts([first, revised])).toEqual([
      { ...VERSION, body: "Shorter." },
    ])
  })
})

describe("withCurrentDraftNote", () => {
  it("appends version ids only for the model, on the last user turn", () => {
    const messages = [
      {
        id: "u1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Make it shorter." }],
        metadata: { currentDrafts: [VERSION] },
      },
    ] as UIMessage[]

    const next = withCurrentDraftNote(messages)
    const last = next[0]
    const texts = last.parts
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? part.text : ""))

    expect(texts[0]).toBe("Make it shorter.")
    expect(texts[1]).toContain(VERSION.versionId)
    expect(texts[1]).toContain(VERSION.body)
    expect(messages[0].parts).toHaveLength(1)
  })
})
