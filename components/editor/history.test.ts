import { describe, expect, it } from "vitest"

import { createDocument } from "@/lib/editor/document"
import type { EditOp } from "@/lib/editor/ops"

import { commit, amend, createHistory, entryState, idsOf, redo, undo } from "./history"
import { initialState, reduce } from "./use-document"

describe("history entries", () => {
  it("gives each commit an id that moves between the stacks with undo and redo", () => {
    let h = commit(commit(createHistory("a"), "b"), "c")
    expect(idsOf(h)).toEqual({ undo: [1, 2], redo: [] })

    h = undo(h)
    expect(h.present).toBe("b")
    expect(idsOf(h)).toEqual({ undo: [1], redo: [2] })

    h = redo(h)
    expect(h.present).toBe("c")
    expect(idsOf(h)).toEqual({ undo: [1, 2], redo: [] })
  })

  it("amend joins the entry on top and drops the redo stack", () => {
    let h = undo(commit(commit(createHistory("a"), "b"), "c"))
    h = amend(h, "b2")
    expect(h.present).toBe("b2")
    expect(idsOf(h)).toEqual({ undo: [1], redo: [] })
    expect(undo(h).present).toBe("a")
  })

  it("never reuses an id after a fork", () => {
    const h = commit(undo(commit(createHistory("a"), "b")), "c")
    expect(idsOf(h)).toEqual({ undo: [2], redo: [] })
  })

  it("says where an entry is", () => {
    const ids = { undo: [1, 2], redo: [3, 4] }
    expect(entryState(ids, 2)).toBe("undo")
    expect(entryState(ids, 1)).toBe("applied")
    expect(entryState(ids, 3)).toBe("redo")
    expect(entryState(ids, 4)).toBe("undone")
    expect(entryState(ids, 5)).toBe("gone")
    expect(entryState(ids, null)).toBe("gone")
  })
})

describe("a run's undo entry (use-document)", () => {
  const rename = (name: string): EditOp[] => [{ op: "rename", name }]

  function run(state: ReturnType<typeof initialState>, ...names: string[]) {
    let next = reduce(state, { type: "run-start" })
    for (const name of names) next = reduce(next, { type: "agent", ops: rename(name) })
    next = reduce(next, { type: "run-end" })
    return { state: next, entry: next.runEntry }
  }

  it("commits one entry per run, however many batches land", () => {
    const first = run(initialState(createDocument({ name: "Take" }), 1), "a", "b", "c")
    expect(idsOf(first.state.history)).toEqual({ undo: [first.entry], redo: [] })
    expect(first.state.history.present.metadata.name).toBe("c")
  })

  it("a run undone and replaced by another leaves the first run's checkpoint inert", () => {
    const tighten = run(initialState(createDocument({ name: "Take" }), 1), "tight")
    const undone = reduce(tighten.state, { type: "undo" })
    expect(entryState(idsOf(undone.history), tighten.entry)).toBe("redo")

    const three = run(undone, "cut a", "cut b", "cut c")
    const ids = idsOf(three.state.history)
    // The depth matches what Tighten left, but the entry on top is not its.
    expect(ids.undo).toHaveLength(1)
    expect(entryState(ids, tighten.entry)).toBe("gone")
    expect(entryState(ids, three.entry)).toBe("undo")
  })

  it("a run with another on top is applied, not undoable", () => {
    const first = run(initialState(createDocument({ name: "Take" }), 1), "one")
    const second = run(first.state, "two")
    const ids = idsOf(second.state.history)
    expect(entryState(ids, first.entry)).toBe("applied")
    expect(entryState(ids, second.entry)).toBe("undo")
  })
})
