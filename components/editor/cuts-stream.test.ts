import { describe, expect, it } from "vitest"

import type { CutsMessage } from "@/lib/editor/stream-parts"

import type { BeatState } from "./agent-cursor/director"
import { gateIsOpen, initialStreamState, reduce, runEdits, type RunRecord } from "./cuts-stream"

/**
 * The margin's run state (use-cuts-stream.ts), driven without React: what
 * keeps a run open while it asks, what one receipt counts, and what a part,
 * a send or a Stop does to the state.
 */

const beat = (id: string, more: Partial<BeatState> = {}): BeatState => ({
  id,
  ops: [],
  target: null,
  landed: true,
  ...more,
})

function assistant(id: string, parts: CutsMessage["parts"]): CutsMessage {
  return { id, role: "assistant", parts }
}

const asking = (state: "approval-requested" | "approval-responded" | "output-available") =>
  ({
    type: "tool-delete_clip",
    toolCallId: "c-1",
    state,
    input: { clipNumbers: [3] },
    ...(state === "output-available" ? { output: "done" } : {}),
    approval: { id: "a-1", ...(state === "approval-requested" ? {} : { approved: true }) },
  }) as unknown as CutsMessage["parts"][number]

const record = (more: Partial<RunRecord> = {}): RunRecord => ({
  startUs: 10,
  endUs: 8,
  entry: 1,
  revision: 5,
  edits: 2,
  ...more,
})

describe("the gate keeps the run open (cuts-stream)", () => {
  it("while the question waits and while its answer is on the way", () => {
    for (const state of ["approval-requested", "approval-responded"] as const) {
      expect(gateIsOpen("ready", assistant("m-1", [asking(state)]), new Set())).toBe(true)
    }
  })

  it("not once the call has run", () => {
    expect(gateIsOpen("ready", assistant("m-1", [asking("output-available")]), new Set())).toBe(false)
  })

  it("not after Stop or a failed send, so nobody's silence holds the timeline", () => {
    const last = assistant("m-1", [asking("approval-requested")])
    expect(gateIsOpen("ready", last, new Set(["m-1"]))).toBe(false)
    expect(gateIsOpen("error", last, new Set())).toBe(false)
  })

  it("not for a message from the person", () => {
    expect(gateIsOpen("ready", { id: "u", role: "user", parts: [] }, new Set())).toBe(false)
  })
})

describe("what one receipt counts (cuts-stream)", () => {
  it("the landed beats of this turn's calls and its self-check", () => {
    const last = assistant("m-1", [asking("output-available")])
    const beats = [
      beat("b0", { toolCallId: "c-1" }),
      beat("b1", { toolCallId: "c-1", landed: false }),
      beat("b2", { toolCallId: "check:m-1" }),
      beat("b3", { toolCallId: "c-other" }),
    ]
    expect(runEdits(last, beats, "check:m-1")).toBe(2)
  })

  it("for three cuts, each cut's landed edits, not the scenes it made", () => {
    const last = assistant("m-1", [
      {
        type: "data-cuts",
        data: {
          leadId: "s-a",
          cuts: ["a", "b"].map((x) => ({ sceneId: `s-${x}`, letter: x, name: x, where: "", hook: null, lengthS: 30 })),
        },
      },
    ])
    const beats = [
      beat("b0", { sceneId: "s-a", toolName: "add_scene" }),
      beat("b1", { sceneId: "s-a", toolName: "punch_in" }),
      beat("b2", { sceneId: "s-b", toolName: "reframe" }),
      beat("b3", { sceneId: "s-b", toolName: "add_captions", landed: false }),
    ]
    expect(runEdits(last, beats, "check:m-1")).toBe(2)
  })
})

describe("the run state (cuts-stream)", () => {
  it("a failure is shown until the next send", () => {
    let state = reduce(initialStreamState, { type: "failed", message: "Not saved." })
    expect(state.failure).toBe("Not saved.")
    state = reduce(state, { type: "sent" })
    expect(state.failure).toBeNull()
  })

  it("a send with nothing to clear keeps the same state", () => {
    expect(reduce(initialStreamState, { type: "sent" })).toBe(initialStreamState)
  })

  it("keeps each cut's revision", () => {
    let state = reduce(initialStreamState, { type: "cut-saved", sceneId: "s-a", revision: 5 })
    state = reduce(state, { type: "cut-saved", sceneId: "s-b", revision: 6 })
    expect(state.cutRevisions).toEqual({ "s-a": 5, "s-b": 6 })
  })

  it("marks a stopped turn without touching the old set", () => {
    const state = reduce(initialStreamState, { type: "stopped", messageId: "m-1" })
    expect(state.stopped.has("m-1")).toBe(true)
    expect(initialStreamState.stopped.size).toBe(0)
  })

  it("a run resumed after its question keeps one receipt: its start and its entry", () => {
    let state = reduce(initialStreamState, { type: "run-ended", messageId: "m-1", record: record() })
    state = reduce(state, {
      type: "run-ended",
      messageId: "m-1",
      record: record({ startUs: 8, endUs: 6, entry: null, revision: 6, edits: 3 }),
    })
    expect(state.runs["m-1"]).toEqual({ startUs: 10, endUs: 6, entry: 1, revision: 6, edits: 3 })
  })

  it("a later entry replaces the earlier one", () => {
    let state = reduce(initialStreamState, { type: "run-ended", messageId: "m-1", record: record() })
    state = reduce(state, { type: "run-ended", messageId: "m-1", record: record({ entry: 2 }) })
    expect(state.runs["m-1"].entry).toBe(2)
  })
})
