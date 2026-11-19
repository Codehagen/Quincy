import { EDITOR_TOOL_SENTENCES } from "@/lib/editor/turn-sentences"

import type { BeatState } from "./agent-cursor/director"
import { removedUs } from "./agent-cursor/timing"

/*
 * How a run's steps read in the margin: one press, one row (label | what it
 * removed). Shared by a run on the scene on screen and by each of three cuts.
 */

/** A step's label: what the press did, in words. */
export function stepTitle(beat: BeatState): string {
  const target = beat.target
  if (beat.toolName === "remove_silences" && target?.kind === "range") {
    return target.spans.length > 1 ? `Cut ${target.spans.length} pauses` : "Cut a pause"
  }
  if (beat.toolName === "delete_clip") return "Cut a line"
  // The self-check's fix (lib/editor/self-check.ts): not a tool the model calls.
  if (beat.toolName === "move_captions") return "Moved the captions"
  return sentenceFor(beat.toolName ?? "", "done")
}

/** The step's right-hand column: how much it removed, when it removed any. */
export function stepDetail(beat: BeatState): string | undefined {
  const us = removedUs(beat.target)
  return us > 0 ? `${(us / 1_000_000).toFixed(1)} s` : undefined
}

export function sentenceFor(tool: string, mood: "done" | "running"): string {
  const words = (EDITOR_TOOL_SENTENCES as Record<string, { done: string; running: string }>)[tool]
  return words ? words[mood] : tool.replaceAll("_", " ")
}

