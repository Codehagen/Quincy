import type { UIMessage } from "ai"

import type {
  CurrentDraftMeta,
  DraftArtifactResult,
} from "./draft-artifact"
import type { SourceArtifactResult } from "./source-artifact"

/**
 * The Studio conversation's message type: the AI SDK's `UIMessage`, typed with
 * the tools `chatTools` (lib/chat-tools.ts) actually registers.
 *
 * Written by hand because `chatTools` is annotated `Record<string, Tool>`, so
 * `InferUITools` can read no names from it. The names are pinned instead by
 * `STUDIO_TOOL_NAMES` and lib/studio-message.test.ts, which fails when a tool
 * is added, renamed or removed there. The scripted conversations in
 * lib/chat-fixtures are typed with this, so a renamed tool breaks them at
 * compile time rather than leaving a fixture that exercises nothing.
 *
 * Inputs mirror each tool's zod schema. Outputs are what `execute` returns:
 * the read tools answer prose; the draft tools and `read_source` answer the
 * objects the transcript draws.
 */
export type StudioTools = {
  read_riffs: { input: Record<string, never>; output: string }
  read_drafts: { input: Record<string, never>; output: string }
  read_lineup: { input: Record<string, never>; output: string }
  read_channels: { input: Record<string, never>; output: string }
  read_sources: { input: Record<string, never>; output: string }
  read_source: {
    input: { ref: string; includePatches?: boolean }
    output: SourceArtifactResult
  }
  read_story: { input: Record<string, never>; output: string }
  read_numbers: { input: Record<string, unknown>; output: string }
  capture_riff: { input: { text: string }; output: string }
  draft_angle: { input: { angleId: string }; output: DraftArtifactResult }
  revise_version: {
    input: {
      versionId: string
      instruction: string
      expectedUpdatedAt?: string
    }
    output: DraftArtifactResult
  }
}

export type StudioToolName = keyof StudioTools

/** Every tool name, in the order chat-tools.ts registers them. */
export const STUDIO_TOOL_NAMES = [
  "read_riffs",
  "read_drafts",
  "read_lineup",
  "read_channels",
  "read_sources",
  "read_source",
  "read_story",
  "read_numbers",
  "capture_riff",
  "draft_angle",
  "revise_version",
] as const satisfies readonly StudioToolName[]

/**
 * A user turn carries the versions on screen (`currentDrafts`), so "make it
 * shorter" reaches the version the person is looking at (lib/draft-artifact.ts,
 * `withCurrentDraftNote`). A scripted turn adds `createdAt`.
 */
export type StudioMetadata = Partial<CurrentDraftMeta> & {
  createdAt?: string
}

/** Studio sends no data parts. */
export type StudioData = Record<string, never>

export type StudioUIMessage = UIMessage<StudioMetadata, StudioData, StudioTools>

export type StudioPart = StudioUIMessage["parts"][number]

/** A tool part of any Studio tool, typed or dynamic. */
export type StudioToolPart = Extract<StudioPart, { toolCallId: string }>

/** The two tools whose output is a draft drawn as a card. */
export type DraftToolPart = Extract<
  StudioPart,
  { type: "tool-draft_angle" | "tool-revise_version" }
>

export type SourceToolPart = Extract<StudioPart, { type: "tool-read_source" }>
