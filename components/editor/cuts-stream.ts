import { isToolUIPart } from "ai"

import type { CutsData, CutsMessage, RecommendData } from "@/lib/editor/stream-parts"

import type { BeatState } from "./agent-cursor/director"

/**
 * The run state of the cutting margin, as pure functions over the stream
 * (use-cuts-stream.ts holds them in React). Kept free of React and of the
 * components so the rules the margin draws from can be tested in node: when
 * a run counts as open, what one run's receipt counts, and what a part or a
 * Stop does to the state.
 */

/** A finished run: what the checkpoint and the receipt read. */
export type RunRecord = {
  startUs: number
  endUs: number
  /** The undo entry the run committed (history.ts); null if it pushed none. */
  entry: number | null
  revision: number | null
  edits: number
}

export type StreamState = {
  /** A run that failed after it streamed (`data-run-failed`), in words. */
  failure: string | null
  /** The turns the person stopped: their skipped steps say so. */
  stopped: ReadonlySet<string>
  /** The revision each of three cuts was saved as. */
  cutRevisions: Readonly<Record<string, number>>
  /** Each assistant turn's receipt, by message id. */
  runs: Readonly<Record<string, RunRecord>>
}

export const initialStreamState: StreamState = {
  failure: null,
  stopped: new Set(),
  cutRevisions: {},
  runs: {},
}

export type StreamAction =
  /** The person sent a request: an old failure is no longer the news. */
  | { type: "sent" }
  | { type: "failed"; message: string }
  /** `data-saved` for one of three cuts. */
  | { type: "cut-saved"; sceneId: string; revision: number }
  | { type: "stopped"; messageId: string }
  /** The run settled: its receipt, merged with one the same turn already has. */
  | { type: "run-ended"; messageId: string; record: RunRecord }

export function reduce(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case "sent":
      return state.failure === null ? state : { ...state, failure: null }
    case "failed":
      return { ...state, failure: action.message }
    case "cut-saved":
      return { ...state, cutRevisions: { ...state.cutRevisions, [action.sceneId]: action.revision } }
    case "stopped":
      return { ...state, stopped: new Set(state.stopped).add(action.messageId) }
    case "run-ended": {
      // A run resumed after its question settles twice on one turn. The
      // receipt keeps where it started and the undo entry it already had.
      const prev = state.runs[action.messageId]
      const { record } = action
      return {
        ...state,
        runs: {
          ...state.runs,
          [action.messageId]: {
            ...record,
            startUs: prev?.startUs ?? record.startUs,
            entry: record.entry ?? prev?.entry ?? null,
          },
        },
      }
    }
  }
}

/**
 * The run is waiting on its question, or the answer is on its way back.
 *
 * The stream ends at the question, but the run does not: the answer resumes
 * the same turn, and it must stay one undo entry with one receipt. Closing
 * the run here made it two, and "Undo the run" took back only the half after
 * the answer. So the run stays open and the timeline locked while it asks —
 * a hand edit in between would otherwise be folded into the run's entry.
 * "approval-responded" counts too: the SDK sends the answer a tick after
 * recording it, and in that tick nothing would be streaming.
 *
 * Stop or a failed send lets go, so a question nobody answers never holds
 * the timeline for good.
 */
export function gateIsOpen(
  status: string,
  last: CutsMessage | undefined,
  stopped: ReadonlySet<string>
): boolean {
  return (
    status !== "error" &&
    last?.role === "assistant" &&
    !stopped.has(last.id) &&
    last.parts.some(
      (p) => isToolUIPart(p) && (p.state === "approval-requested" || p.state === "approval-responded")
    )
  )
}

/**
 * What one run's receipt counts: the edits that landed. For three cuts, every
 * cut's edits; otherwise the beats of this turn's tool calls and its
 * self-check (`checkCall`), so a resumed run reads as one receipt.
 */
export function runEdits(last: CutsMessage, beats: readonly BeatState[], checkCall: string): number {
  const three = cutsOf(last)
  if (three) {
    return three.cuts.reduce((sum, cut) => sum + cutBeats(beats, cut.sceneId).filter((b) => b.landed).length, 0)
  }
  const calls = toolCallIds(last).add(checkCall)
  return beats.filter((b) => b.landed && b.toolCallId && calls.has(b.toolCallId)).length
}

export function cutsOf(message: CutsMessage): CutsData | null {
  for (const part of message.parts) if (part.type === "data-cuts") return part.data
  return null
}

export function recommendationOf(message: CutsMessage): RecommendData | null {
  for (const part of message.parts) if (part.type === "data-recommend") return part.data
  return null
}

/** The beats of one cut that are its edits (making the scene is not one). */
export function cutBeats(beats: readonly BeatState[], sceneId: string): BeatState[] {
  return beats.filter((b) => b.sceneId === sceneId && b.toolName !== "add_scene")
}

export function toolCallIds(message: CutsMessage): Set<string> {
  return new Set(message.parts.filter(isToolUIPart).map((p) => p.toolCallId))
}
