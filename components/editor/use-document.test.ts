import { describe, expect, it } from "vitest"

import { createDocument } from "@/lib/editor/document"
import type { EditOp } from "@/lib/editor/ops"
import type { Scene } from "@/lib/editor/types"

import { idsOf } from "./history"
import { autosaveDelay, conflictVerdict, initialState, reduce } from "./use-document"

type State = ReturnType<typeof initialState>

const rename = (name: string): EditOp[] => [{ op: "rename", name }]
const dirty = (state: State) => state.seq !== state.savedSeq
const fresh = () => initialState(createDocument({ name: "Take" }), 4)

function delayOf(state: State) {
  return autosaveDelay({
    dirty: dirty(state),
    awaitingSync: state.awaitingSync,
    network: state.network,
    attempts: state.attempts,
  })
}

describe("saving (use-document)", () => {
  it("a save for an older seq leaves the document dirty", () => {
    let state = reduce(fresh(), { type: "apply", ops: rename("a") })
    const sentSeq = state.seq
    // Another edit while the request is in flight.
    state = reduce(state, { type: "apply", ops: rename("b") })
    state = reduce(state, { type: "saved", revision: 5, seq: sentSeq })
    expect(state.revision).toBe(5)
    expect(dirty(state)).toBe(true)
  })

  it("a synced revision does not mark local work saved", () => {
    let state = reduce(fresh(), { type: "apply", ops: rename("a") })
    state = reduce(state, { type: "synced", revision: 9 })
    expect(state.revision).toBe(9)
    expect(dirty(state)).toBe(true)
  })

  it("an agent batch is never dirty", () => {
    let state = reduce(fresh(), { type: "run-start" })
    state = reduce(state, { type: "agent", ops: rename("a") })
    state = reduce(state, { type: "agent", ops: rename("b") })
    expect(dirty(state)).toBe(false)
  })

  it("selecting a scene is saved but adds no undo entry", () => {
    const base = createDocument({ name: "Take" })
    const second: Scene = { ...base.scenes[0], id: "scene-b", name: "B" }
    let state = initialState(base, 1)
    state = reduce(state, { type: "apply", ops: [{ op: "add_scene", scene: second }] })
    state = reduce(state, { type: "undo" })
    state = reduce(state, { type: "redo" })
    const before = idsOf(state.history)

    state = reduce(state, { type: "apply", ops: [{ op: "select_scene", sceneId: "scene-b" }] })
    expect(state.history.present.currentSceneId).toBe("scene-b")
    expect(idsOf(state.history)).toEqual(before)
    expect(dirty(state)).toBe(true)
  })

  it("keeps the redo stack across a scene selection", () => {
    const base = createDocument({ name: "Take" })
    let state = reduce(initialState(base, 1), { type: "apply", ops: rename("a") })
    state = reduce(state, { type: "undo" })
    state = reduce(state, {
      type: "apply",
      ops: [{ op: "select_scene", sceneId: base.scenes[0].id }],
    })
    expect(idsOf(state.history).redo).toHaveLength(1)
  })

  it("a run stays one entry while it waits on its question", () => {
    // The margin keeps the run open across the gate (no run-end between the
    // halves), so the resumed half amends the first half's entry.
    let state = reduce(fresh(), { type: "run-start" })
    state = reduce(state, { type: "agent", ops: rename("before the question") })
    state = reduce(state, { type: "agent", ops: rename("after the answer") })
    state = reduce(state, { type: "run-end" })
    expect(idsOf(state.history).undo).toEqual([state.runEntry])
    expect(reduce(state, { type: "undo" }).history.present.metadata.name).toBe("Take")
  })
})

describe("after Stop (use-document)", () => {
  it("holds autosave until the read-back brings the run's revision, then saves on it", () => {
    let state = reduce(fresh(), { type: "await-sync" })
    state = reduce(state, { type: "apply", ops: rename("by hand") })
    expect(delayOf(state)).toBeNull()

    state = reduce(state, { type: "synced", revision: 7 })
    expect(state.awaitingSync).toBe(false)
    expect(state.revision).toBe(7)
    expect(delayOf(state)).toBe(1200)
  })

  it("a 409 from the run's own save waits for the read-back, then retries", () => {
    let state = reduce(fresh(), { type: "apply", ops: rename("by hand") })
    state = reduce(state, { type: "await-sync" })
    state = reduce(state, { type: "save-start" })
    state = reduce(state, { type: "save-conflict", sent: 4, actual: 5 })
    expect(state.network.status).toBe("clean")
    expect(delayOf(state)).toBeNull()

    state = reduce(state, { type: "synced", revision: 5 })
    expect(delayOf(state)).toBe(1200)
  })

  it("a 409 after the run's revision arrived in flight retries on it", () => {
    let state = reduce(fresh(), { type: "apply", ops: rename("by hand") })
    state = reduce(state, { type: "save-start" })
    state = reduce(state, { type: "synced", revision: 5 })
    state = reduce(state, { type: "save-conflict", sent: 4, actual: 5 })
    expect(state.network.status).toBe("clean")
    expect(delayOf(state)).toBe(1200)
  })

  it("a real conflict stays a conflict and stops autosave", () => {
    let state = reduce(fresh(), { type: "apply", ops: rename("by hand") })
    state = reduce(state, { type: "save-start" })
    state = reduce(state, { type: "save-conflict", sent: 4, actual: 6 })
    expect(state.network.status).toBe("conflict")
    expect(delayOf(state)).toBeNull()
    // A later revision from a run does not excuse it.
    state = reduce(state, { type: "synced", revision: 6 })
    expect(state.network.status).toBe("conflict")
  })

  it("a read-back that gives up says so and writes nothing", () => {
    let state = reduce(fresh(), { type: "await-sync" })
    state = reduce(state, { type: "apply", ops: rename("by hand") })
    state = reduce(state, { type: "sync-lost" })
    expect(state.network.status).toBe("unsynced")
    expect(state.awaitingSync).toBe(false)
    expect(delayOf(state)).toBeNull()
  })
})

describe("conflictVerdict", () => {
  it("retries when a newer revision reached us and covers the winner", () => {
    expect(conflictVerdict({ revision: 5, awaitingSync: false }, 4, 5)).toBe("retry")
  })

  it("waits while a stopped run's revision is on its way", () => {
    expect(conflictVerdict({ revision: 4, awaitingSync: true }, 4, 5)).toBe("wait")
  })

  it("is a conflict when nothing we know of explains the winner", () => {
    expect(conflictVerdict({ revision: 4, awaitingSync: false }, 4, 5)).toBe("conflict")
    expect(conflictVerdict({ revision: 5, awaitingSync: false }, 4, 6)).toBe("conflict")
    expect(conflictVerdict({ revision: 5, awaitingSync: false }, 4, null)).toBe("conflict")
  })
})

describe("autosaveDelay", () => {
  const base = { dirty: true, awaitingSync: false, attempts: 0 }

  it("waits for quiet, and only when there is work", () => {
    expect(autosaveDelay({ ...base, network: { status: "clean" } })).toBe(1200)
    expect(autosaveDelay({ ...base, dirty: false, network: { status: "clean" } })).toBeNull()
  })

  it("backs off after failures and stops once given up", () => {
    const error = (givenUp: boolean) => ({ status: "error" as const, message: "x", givenUp })
    expect(autosaveDelay({ ...base, attempts: 1, network: error(false) })).toBe(1500)
    expect(autosaveDelay({ ...base, attempts: 2, network: error(false) })).toBe(4000)
    expect(autosaveDelay({ ...base, attempts: 9, network: error(false) })).toBe(10_000)
    expect(autosaveDelay({ ...base, attempts: 3, network: error(true) })).toBeNull()
  })

  it("never fires during a save, a conflict or an unconfirmed run", () => {
    expect(autosaveDelay({ ...base, network: { status: "saving" } })).toBeNull()
    expect(autosaveDelay({ ...base, network: { status: "conflict" } })).toBeNull()
    expect(autosaveDelay({ ...base, network: { status: "unsynced" } })).toBeNull()
    expect(autosaveDelay({ ...base, awaitingSync: true, network: { status: "clean" } })).toBeNull()
  })

  it("gives up after three failures in a row", () => {
    let state = reduce(fresh(), { type: "apply", ops: rename("a") })
    for (let i = 0; i < 3; i++) state = reduce(state, { type: "save-failed", message: "no" })
    expect(state.network).toEqual({ status: "error", message: "no", givenUp: true })
    state = reduce(state, { type: "retry" })
    expect(delayOf(state)).toBe(1200)
  })
})
