import type { UIMessage } from "ai"

/**
 * The object Studio puts in the conversation when a draft exists.
 *
 * Tool output used to be a sentence pointing at /drafts. The card in the
 * transcript is a view of these rows — `versionId` is the source of truth,
 * the body is a snapshot at generation time, and the editor reloads/saves
 * against the row.
 */

export type DraftVersionRef = {
  versionId: string
  channel: string
  label: string
  body: string
  state: "writing" | "approved"
  updatedAt: string
  displayName?: string | null
  handle?: string | null
  avatarUrl?: string | null
}

export type DraftArtifactOutput = {
  ok: true
  message: string
  pieceId: string
  versions: DraftVersionRef[]
  existing: boolean
  fellBack: string[]
  overLimit: string[]
  /** True while tokens are still arriving. The row does not exist yet. */
  streaming?: boolean
}

export type DraftArtifactFailure = {
  ok: false
  message: string
}

export type DraftArtifactResult = DraftArtifactOutput | DraftArtifactFailure

export type CurrentDraftMeta = {
  currentDrafts: DraftVersionRef[]
}

export function isDraftVersionRef(value: unknown): value is DraftVersionRef {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    typeof row.versionId === "string" &&
    typeof row.channel === "string" &&
    typeof row.label === "string" &&
    typeof row.body === "string" &&
    (row.state === "writing" || row.state === "approved") &&
    typeof row.updatedAt === "string"
  )
}

export function isDraftArtifactOutput(
  value: unknown
): value is DraftArtifactOutput {
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  return (
    row.ok === true &&
    typeof row.message === "string" &&
    typeof row.pieceId === "string" &&
    Array.isArray(row.versions) &&
    row.versions.every(isDraftVersionRef)
  )
}

export function artifactMessage(value: unknown): string | null {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message: unknown }).message
    return typeof message === "string" ? message : null
  }
  return null
}

export function toDraftVersionRef(
  row: {
    id: string
    channel: string
    label: string
    body: string
    state: string
    updatedAt: Date
  },
  author?: {
    displayName?: string | null
    handle?: string | null
    avatarUrl?: string | null
  }
): DraftVersionRef {
  return {
    versionId: row.id,
    channel: row.channel,
    label: row.label,
    body: row.body,
    state: row.state === "approved" ? "approved" : "writing",
    updatedAt: row.updatedAt.toISOString(),
    displayName: author?.displayName ?? null,
    handle: author?.handle ?? null,
    avatarUrl: author?.avatarUrl ?? null,
  }
}

export function draftedMessage({
  existing,
  channels,
  fellBack,
  overLimit,
}: {
  existing: boolean
  channels: string[]
  fellBack: string[]
  overLimit: string[]
}): string {
  if (existing) {
    return "That angle was already drafted. The writing is in this conversation. Nothing was written twice and nothing was charged."
  }

  const where = channels.length
    ? ` One version per channel: ${channels.join(", ")}.`
    : ""
  const fell = fellBack.length
    ? ` Quincy could not write ${fellBack.join(", ")} this time, so ${
        fellBack.length === 1 ? "that version is" : "those versions are"
      } the hook itself and need your rewrite.`
    : ""
  const long = overLimit.length
    ? ` ${overLimit.join(", ")} came out over the platform limit and needs cutting.`
    : ""

  return `Drafted.${where} The writing is in this conversation, waiting for you to approve. Nothing goes out until you do.${fell}${long}`
}

export function revisedMessage({
  label,
  overLimit,
}: {
  label: string
  overLimit: boolean
}): string {
  const long = overLimit
    ? ` ${label} is over the platform limit and needs cutting.`
    : ""
  return `Revised the ${label} version. The writing is in this conversation. Nothing goes out until you approve.${long}`
}

/**
 * The drafts the next turn should target, taken from the last user message's
 * metadata. Injected only when converting to model messages — never written
 * back into the transcript.
 */
export function readCurrentDrafts(message: UIMessage): DraftVersionRef[] {
  const meta = message.metadata
  if (!meta || typeof meta !== "object") return []
  const drafts = (meta as { currentDrafts?: unknown }).currentDrafts
  if (!Array.isArray(drafts)) return []
  return drafts.filter(isDraftVersionRef)
}

export function currentDraftsFromParts(
  messages: {
    parts: { type: string; state?: string; output?: unknown }[]
  }[]
): DraftVersionRef[] {
  const latest = new Map<string, DraftVersionRef>()

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        (part.type !== "tool-draft_angle" &&
          part.type !== "tool-revise_version") ||
        part.state !== "output-available"
      ) {
        continue
      }
      if (!isDraftArtifactOutput(part.output)) continue
      if (part.output.streaming) continue
      for (const version of part.output.versions) {
        latest.set(version.versionId, version)
      }
    }
  }

  return [...latest.values()]
}

/**
 * Append a model-only note naming the current versions. The UI already shows
 * the cards; this is how "make it shorter" gets a version id without the
 * model guessing from the transcript.
 */
export function withCurrentDraftNote(messages: UIMessage[]): UIMessage[] {
  if (messages.length === 0) return messages
  const last = messages[messages.length - 1]
  if (last.role !== "user") return messages

  const drafts = readCurrentDrafts(last)
  if (drafts.length === 0) return messages

  const note = [
    "<current_draft>",
    "The user is looking at these versions. A revision request targets one of these ids, never a new angle, unless they asked to start over.",
    ...drafts.map(
      (version) =>
        `<version id="${version.versionId}" channel="${version.channel}" updated="${version.updatedAt}">\n${version.body}\n</version>`
    ),
    "</current_draft>",
  ].join("\n")

  return [
    ...messages.slice(0, -1),
    {
      ...last,
      parts: [...last.parts, { type: "text" as const, text: note }],
    },
  ]
}
