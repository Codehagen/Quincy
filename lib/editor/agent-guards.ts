import type { UIMessage } from "ai"

import { verifyGateRecord } from "./server-keys"

/**
 * The agent route's guards that are not the gate itself: its cooldown and
 * the reading of what the browser sent back. Kept out of the route file
 * because a route module may only export what Next.js reads from it.
 */

/**
 * Between two runs a person starts (AGENTS.md, "Money": a ceiling and a
 * cooldown, both). The lock is a claim, not a cooldown: it comes off the
 * moment a run ends, so on its own it lets a script start eight-step runs
 * back to back all afternoon. Three seconds is below anything a person
 * typing a request would notice, and above what a loop would want.
 *
 * Read per user, not per project, from an attempt row written once the lock
 * is held, so opening a second project does not reset it.
 */
export const AGENT_COOLDOWN_MS = 3_000

/** The `usage_event.conversation_id` of the attempt row the cooldown reads. */
export const AGENT_TAG = "editor-agent"

/**
 * The attempt row of the run that continues after the person answers a
 * gate question, one per question.
 *
 * That run is sent by the browser the moment the person clicks
 * (`sendAutomaticallyWhen`), and a quick yes can land inside the cooldown of
 * the run that asked: refusing it would leave the person's answer with
 * nowhere to go. So a request that answers a question this server asked
 * (a signed gate record in the history, see server-keys.ts) skips the
 * cooldown once for that question, and the row written here makes the
 * second use of the same answer wait like any other request. Each skip was
 * bought by a run that passed the cooldown itself, so they cannot be
 * chained into a loop.
 */
export function continueTag(toolCallId: string): string {
  return `${AGENT_TAG}:continue:${toolCallId}`
}

/** How long a used answer stays used: longer than any question stays open. */
export const CONTINUE_WINDOW_MS = 24 * 60 * 60 * 1000

/** What the gate measured for one question, as it signed it. */
export type GateRecord = { clipIds: string[] }

/**
 * The gate questions in the history that this server asked.
 *
 * The `data-gate` part rides in the browser's copy of the conversation, so
 * it is only believed with a valid signature: a record the browser made up
 * is no record.
 */
export function gateRecords(messages: UIMessage[]): Map<string, GateRecord> {
  const records = new Map<string, GateRecord>()
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type !== "data-gate") continue
      const data = (part as { data?: unknown }).data
      if (typeof data !== "object" || data === null) continue
      const { toolCallId, clipIds, signature } = data as Record<string, unknown>
      if (typeof toolCallId !== "string" || typeof signature !== "string") continue
      if (!Array.isArray(clipIds) || !clipIds.every((id) => typeof id === "string")) continue
      if (!verifyGateRecord(toolCallId, clipIds, signature)) continue
      records.set(toolCallId, { clipIds })
    }
  }
  return records
}

/**
 * The question this request answers, if it is the browser's automatic
 * continuation after the person said yes or no to one this server asked.
 * Null for any other request.
 */
export function answeredQuestion(
  messages: UIMessage[],
  records: Map<string, GateRecord>
): string | null {
  const last = messages.at(-1)
  if (!last || last.role !== "assistant") return null
  const answered = (last.parts ?? []).flatMap((part) => {
    const { state, toolCallId } = part as { state?: unknown; toolCallId?: unknown }
    return state === "approval-responded" &&
      typeof toolCallId === "string" &&
      records.has(toolCallId)
      ? [toolCallId]
      : []
  })
  return answered.sort()[0] ?? null
}

/** Tool calls the browser already holds, by id. */
export function knownToolCalls(messages: UIMessage[]): Set<string> {
  return new Set(
    messages.flatMap((message) =>
      // A message without parts is malformed, and must not throw here: this
      // runs after the lock is taken.
      (message.parts ?? []).flatMap((part) =>
        "toolCallId" in part && typeof part.toolCallId === "string"
          ? [part.toolCallId]
          : []
      )
    )
  )
}

/** The same clips, in any order. */
export function sameClips(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}
