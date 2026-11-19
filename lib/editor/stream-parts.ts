import type { UIMessage } from "ai"

import type { EditOp } from "./ops"

/**
 * The data parts the cutting runs stream, by name: one map for the writers
 * (the agent route, three-cuts-run.ts, the prototype mock) and the reader
 * (the margin's `onData`, cuts-turn.tsx). A part named here with the wrong
 * shape no longer compiles on either side, where before each side cast
 * `part.data` to the shape it hoped for.
 *
 * Transient parts (`ops`, `saved`, `check`, `run-failed`) reach only
 * `onData`; the rest also stay in the message.
 */

/** One committed step of a tool call. `sceneId` names a three-cuts cut's scene. */
export type OpsData = { ops: EditOp[]; toolCallId?: string; toolName?: string; sceneId?: string }

/**
 * Why the run waits on the person (lib/editor/gate.ts). The route signs the
 * clips it measured (server-keys.ts) so a yes runs only on those clips; the
 * prototype mock has no server secret and asks without them.
 */
export type GateData = {
  toolCallId: string
  reason: string
  sentences: number
  percent: number
  clipIds?: string[]
  signature?: string
}

/** The revision the server now holds; for three cuts, the cut it saved. */
export type SavedData = { revision: number; sceneId?: string }

/** The signed self-check offer (self-check-server.ts); for three cuts, its cut. */
export type CheckData = { offer: string; sceneId?: string }

export type RunFailedData = { message: string }

/** Three cuts named before they start: the cursors and the spines read it. */
export type CutsData = {
  leadId: string
  cuts: { sceneId: string; letter: string; name: string; where: string; hook: string | null; lengthS: number }[]
}

/** One cut's sub-run has ended: its line and whether any edit landed. */
export type CutDone = { sceneId: string; letter: string; say: string; landed: boolean }

/** Which cut to post first, and why (three-cuts.ts, `recommend`). */
export type RecommendData = { sceneId: string; letter: string; reason: string }

export type CutsDataParts = {
  ops: OpsData
  gate: GateData
  saved: SavedData
  check: CheckData
  "run-failed": RunFailedData
  cuts: CutsData
  "cut-done": CutDone
  recommend: RecommendData
}

/** A message of the cutting chat, its data parts typed. */
export type CutsMessage = UIMessage<unknown, CutsDataParts>
