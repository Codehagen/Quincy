import { createChat } from "@shadcn/helpers/ai-sdk"

import type { StudioUIMessage } from "../studio-message"
import { FIXTURE_NOW, type FixturePace } from "./shared"

const NOTES = "Call notes, Thursday. We stopped writing release notes and nobody noticed for a month."

/** A data URL, so the fixture needs no network and no storage. */
export const FIXTURE_NOTES_URL = `data:text/markdown;base64,${btoa(NOTES)}`

/**
 * Raw material handed over as a file: the person's turn carries the file
 * above the bubble, and Quincy reads it into ideas (`capture_riff`).
 */
export function studioAttachmentChat({ pace = 1 }: FixturePace = {}) {
  return createChat<StudioUIMessage>({ now: FIXTURE_NOW, messageIdPrefix: "fixture-msg" })
    .user("Anything in these notes worth posting?", {
      files: [{ mediaType: "text/markdown", filename: "call-notes-thursday.md", url: FIXTURE_NOTES_URL }],
    })
    .assistant(({ writer }) => {
      writer.reasoning("One line in here is a post: the release notes nobody missed.").sleep(250 * pace)
      writer.tool("capture_riff", { input: { text: NOTES } }).sleep(700 * pace).output("Captured. 2 angles on it.")
      writer.text(
        "One thing. You said:\n\n> We stopped writing release notes and nobody noticed for a month.\n\nThat is the post. Want it drafted?",
      )
    })
}
