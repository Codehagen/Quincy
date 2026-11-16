import type { ChatTransport } from "ai"

import type { StudioUIMessage } from "../studio-message"
import { studioAttachmentChat } from "./attachment"
import { failingTransport, studioRetryChat, studioStreamErrorChat, studioToolErrorChat } from "./errors"
import { STUDIO_FALLBACK, studioDraftChat } from "./studio-draft"

/**
 * The scripted conversations Studio can run, by name. Studio picks one with
 * `?fixture=` when NEXT_PUBLIC_CHAT_TRANSPORT=scripted; `draft` is the default.
 */
export const STUDIO_FIXTURES = ["draft", "error", "stream-error", "tool-error", "attachment"] as const

export type StudioFixtureName = (typeof STUDIO_FIXTURES)[number]

export function isStudioFixture(name: string | null | undefined): name is StudioFixtureName {
  return STUDIO_FIXTURES.includes(name as StudioFixtureName)
}

/**
 * A transport for one fixture. Client-side only: the request never reaches
 * /api/chat, so no model is called and nothing is persisted. The first
 * message you type plays the script's first reply whatever it says (the
 * helper replays from the top for a transcript it does not recognise).
 */
export function scriptedStudio(
  name: StudioFixtureName = "draft",
  { delayMs = 18, pace = 1 }: { delayMs?: number; pace?: number } = {},
): ChatTransport<StudioUIMessage> {
  const options = { delayMs, fallback: STUDIO_FALLBACK }
  switch (name) {
    case "draft":
      return studioDraftChat({ pace }).transport(options)
    case "error":
      return failingTransport(studioRetryChat({ pace }).transport(options))
    case "stream-error":
      return studioStreamErrorChat({ pace }).transport(options)
    case "tool-error":
      return studioToolErrorChat({ pace }).transport(options)
    case "attachment":
      return studioAttachmentChat({ pace }).transport(options)
  }
}
