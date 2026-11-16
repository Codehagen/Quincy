import {
  approveStudioVersion,
  previewApproval,
  readStudioVersion,
  reopenVersion,
  saveVersionBody,
} from "@/app/(app)/drafts/actions"
import type { StudioDraftActions } from "@/lib/studio-draft-actions"

/**
 * The draft card's actions in Studio: the same server actions /drafts uses,
 * so Approve takes the same Lineup slot. Nothing here publishes; Post now is
 * not offered in the conversation.
 */
export const serverDraftActions: StudioDraftActions = {
  read: (versionId) => readStudioVersion(versionId),
  preview: (versionId) => previewApproval(versionId),
  save: (versionId, body) => saveVersionBody(versionId, body),
  approve: (versionId, body, expectedUpdatedAt) =>
    approveStudioVersion(versionId, body, expectedUpdatedAt),
  reopen: (versionId) => reopenVersion(versionId),
}
