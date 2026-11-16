/**
 * Scripted Quincy conversations (@shadcn/helpers/ai-sdk), typed against the
 * Studio message type. Used by Studio under NEXT_PUBLIC_CHAT_TRANSPORT=scripted
 * (`?fixture=` picks one), by the kit lab, by lib/studio-turn.test.ts, and
 * later by the landing's pictures. Nothing here touches the network or the
 * database.
 */
export * from "./shared"
export { studioDraftChat, STUDIO_FALLBACK } from "./studio-draft"
export {
  failingTransport,
  studioRetryChat,
  studioToolErrorChat,
  studioStreamErrorChat,
  studioApprovedThread,
} from "./errors"
export { studioAttachmentChat, FIXTURE_NOTES_URL } from "./attachment"
export { fixtureDraftActions } from "./draft-actions"
export { scriptedStudio, isStudioFixture, STUDIO_FIXTURES, type StudioFixtureName } from "./scripted"
