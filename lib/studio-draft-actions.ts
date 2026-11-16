import type { ApprovalPreview } from "./draft-writes"
import type { ApprovalPlacement } from "./scheduling"

/**
 * What a draft card in the Studio conversation can do to its row. Approve
 * lands in the same Lineup slot as /drafts (app/(app)/drafts/actions.ts);
 * nothing here publishes.
 *
 * An interface, so the transcript can render against the real server actions
 * (components/studio/studio-draft-actions.ts) or against the in-memory ones
 * the scripted fixtures use (lib/chat-fixtures/draft-actions.ts), and a test
 * or the kit lab never reaches the database. Type-only imports: this file is
 * in the browser bundle.
 */
export type Refusal = { ok: false; message: string }

export type StudioDraftActions = {
  /** The row as it is now: a refresh after Approve must not show a live editor. */
  read(versionId: string): Promise<
    { ok: true; body: string; state: "writing" | "approved"; updatedAt: string } | Refusal
  >
  /** Where Approve would put it, before it is pressed. */
  preview(versionId: string): Promise<ApprovalPreview>
  save(versionId: string, body: string): Promise<{ ok: true; body: string; updatedAt: string } | Refusal>
  approve(
    versionId: string,
    body: string,
    expectedUpdatedAt: string,
  ): Promise<{ ok: true; placement: ApprovalPlacement } | Refusal>
  /** Undo: back to writing, its queued post removed. */
  reopen(versionId: string): Promise<void>
}
