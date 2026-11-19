import type { createChat } from "@shadcn/helpers/ai-sdk"
import type { UIMessage } from "ai"

import type { CommitMeta } from "@/lib/editor/agent"
import { paceOf, type Pace } from "@/lib/editor/pace"
import { needsCheck } from "@/lib/editor/self-check"

import type { Commit, Recorded } from "./record"
import { mockOffer } from "./server"

/*
 * How a recorded run is written onto the stream, in the order the agent
 * route writes it: the tool call, its `data-ops` parts (transient, one per
 * committed step), the tool's answer, Quincy's line, then `data-saved` and,
 * for a run that changed the picture or captions, the `data-check` offer.
 *
 * With the waits a model makes (lib/editor/pace.ts): a think before the
 * first call, a model step before each later call and before the line, and
 * the line streamed a word at a time. The tune panel's "Model pace" picks
 * the shape; "none" is the old back-to-back stream.
 */

type Turn = Parameters<ReturnType<typeof createChat<UIMessage>>["assistant"]>[0]
/** The helper's writer (not exported by name), read off `assistant`. */
export type Writer = Parameters<Extract<Turn, (...args: never[]) => unknown>>[0]["writer"]

/** Between parts: the replay model's beat (lib/editor/replay-model.ts). */
export const PART_GAP_MS = 40

export function opsPart(commit: Commit, sceneId?: string) {
  const meta: Partial<CommitMeta> = commit.meta ?? {}
  return {
    type: "data-ops" as const,
    data: { ops: commit.ops, toolCallId: meta.toolCallId, toolName: meta.toolName, sceneId: sceneId ?? meta.sceneId },
    transient: true,
  }
}

/** No waits: what a scenario gets when it is not given a pace. */
const BACK_TO_BACK = paceOf("none")

/** One tool call: input, each step's ops, then its words. */
export function writeCall(writer: Writer, call: Recorded, gapMs = PART_GAP_MS) {
  const handle = writer.tool(call.toolName, { toolCallId: call.toolCallId, input: call.input })
  for (const commit of call.commits) writer.sleep(gapMs).data(opsPart(commit))
  handle.sleep(PART_GAP_MS).output(call.output)
}

/** What ends a run that landed: the save, and the self-check offer it earned. */
export function writeEnd(writer: Writer, calls: Recorded[]) {
  if (calls.some((c) => c.commits.length > 0)) {
    writer.data({ type: "data-saved", data: { revision: 0 }, transient: true })
  }
  const landed = calls.filter((c) => c.commits.length > 0).map((c) => c.toolName)
  if (needsCheck(landed)) {
    writer.data({ type: "data-check", data: { offer: mockOffer() }, transient: true })
  }
}

/** Quincy's line after a model step, streamed at the pace's rate. */
export function writeLine(writer: Writer, say: string, pace: Pace = BACK_TO_BACK) {
  writer.sleep(pace.betweenMs()).text(say, { delayMs: pace.wordMs })
}

/** A whole one-turn run: think, the calls a model step apart, then the line. */
export function writeRun(writer: Writer, calls: Recorded[], say: string, gapMs?: number, pace: Pace = BACK_TO_BACK) {
  writer.sleep(pace.thinkMs)
  calls.forEach((call, index) => {
    if (index > 0) writer.sleep(pace.betweenMs())
    writeCall(writer, call, gapMs ?? pace.partMs)
  })
  writeLine(writer, say, pace)
  writeEnd(writer, calls)
}
