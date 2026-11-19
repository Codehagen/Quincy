"use client"

import * as React from "react"

import { applyOps, type EditOp } from "@/lib/editor/ops"
import { UNLOCKED, type VideoDocument } from "@/lib/editor/types"

import {
  amend,
  commit,
  createHistory,
  idsOf,
  redo as redoHistory,
  replacePresent,
  undo as undoHistory,
  type History,
} from "./history"

/** The browser's fetch, called through a stable function so it can be a default. */
export const networkFetch: typeof fetch = (input, init) => fetch(input, init)

/**
 * The document being edited, the history behind it, and getting it saved.
 *
 * Every change goes through `applyOps` rather than mutating the document here.
 * That is not ceremony: the reducer is what stamps provenance, and provenance
 * is what lets an agent run be undone without taking your own edits with it. A
 * component that reached in and set `startUs` directly would produce a clip
 * nobody appears to have touched.
 *
 * One reducer rather than three pieces of state, because undo has to move the
 * document and both stacks together — as separate `useState` calls that is
 * three renders where two of them show an inconsistent history, and it needs a
 * ref to read the current document, which is a ref written during render.
 *
 * History holds **documents, not snapshots**. A snapshot carries a revision,
 * and the revision is server-side concurrency rather than a version number —
 * undoing to an older revision and then saving it would tell the server we read
 * something we did not, which is the exact lie the check exists to catch. The
 * revision here only ever moves forward, to whatever the server last confirmed.
 */

export type SaveState =
  | { status: "clean" }
  | { status: "dirty" }
  | { status: "saving" }
  | { status: "conflict" }
  | { status: "error"; message: string; givenUp: boolean }
  /**
   * A stopped run saved on the server and its revision never reached us.
   * Saving on top of a revision we do not know would 409 or, worse, look
   * like someone else's edit; reloading is the honest way out.
   */
  | { status: "unsynced" }

/** The network's opinion only. Whether work is unsaved is derived from seq. */
type Network = Exclude<SaveState, { status: "dirty" }>

/** Milliseconds of quiet before a save. Long enough that a drag is one write. */
const AUTOSAVE_DELAY = 1200

/**
 * How many times a failing save retries itself before it stops and says so.
 *
 * There has to be a limit. Without one the timer re-arms on every failure and
 * the editor sits there posting the same body forever — which is what it did:
 * twelve requests deep against a server that was never going to accept them,
 * and it would have kept going all afternoon. A blip deserves a retry; a wall
 * deserves a person.
 */
const MAX_ATTEMPTS = 3

/** Backoff between attempts. Doubling, so a wall is hit quickly and quietly. */
const RETRY_DELAY = [1500, 4000, 10_000]

/**
 * How long until the next autosave, or null when none may fire.
 *
 * Pure so the whole schedule can be read in one place and tested: a conflict,
 * a save in flight, a give-up and an unconfirmed run all stop it; an error
 * backs off; anything else waits for a quiet moment.
 */
export function autosaveDelay(state: {
  dirty: boolean
  awaitingSync: boolean
  network: Network
  attempts: number
}): number | null {
  if (!state.dirty) return null
  // A stopped run's save is still landing on the server. Its revision is the
  // only safe base for ours, so nothing is written until the read-back brings
  // it — or says it cannot.
  if (state.awaitingSync) return null
  const { network } = state
  if (network.status === "conflict" || network.status === "saving") return null
  if (network.status === "unsynced") return null
  // Given up means given up. The work is still here, beforeunload guards the
  // tab, and there is a Retry — but nothing fires on its own again.
  if (network.status === "error") {
    if (network.givenUp) return null
    return RETRY_DELAY[state.attempts - 1] ?? RETRY_DELAY.at(-1)!
  }
  return AUTOSAVE_DELAY
}

/**
 * What a 409 means, given what we have learned since the request left.
 *
 * - `retry`: a run's revision reached us while the save was in flight, and it
 *   is at least the one that won. The winner was the run's own save, which
 *   this document already holds, so the same work saved on top of it is right.
 * - `wait`: a stopped run's save is still to be confirmed. The 409 is most
 *   likely that save; the read-back decides, and the retry after it is the
 *   test — if someone else really wrote, it 409s again and becomes a conflict.
 * - `conflict`: someone or something else wrote first. Retrying the same body
 *   would either fail identically or overwrite whatever won.
 */
export function conflictVerdict(
  state: { revision: number; awaitingSync: boolean },
  sent: number,
  actual: number | null
): "retry" | "wait" | "conflict" {
  if (actual !== null && state.revision > sent && state.revision >= actual) return "retry"
  if (state.awaitingSync) return "wait"
  return "conflict"
}

type State = {
  /** The document now, and the undo and redo entries behind it (history.ts). */
  history: History<VideoDocument>
  /** What the server last confirmed it holds. Never a local guess. */
  revision: number
  /**
   * Bumped by every local change. A save captures it and hands it back, and
   * the reducer only calls the document clean if it has not moved since.
   *
   * Without it there is a real race with a plain boolean: edit, autosave
   * starts, edit again while it is in flight, the response clears `dirty`, and
   * the second edit is never written. It survives a reload as a lost edit
   * nobody can explain.
   */
  seq: number
  /** The `seq` the server has. Unsaved work is exactly `seq !== savedSeq`. */
  savedSeq: number
  /**
   * An agent run is landing, and whether its first op has pushed the history.
   *
   * One run is one undo (plans/036): a tightening lands as a dozen presses,
   * one batch each, and undoing it a press at a time would be twelve undos
   * for what the person asked for in one sentence. The first batch of a run
   * pushes the document as it was before the run; the rest replace it.
   */
  run: "idle" | "open" | "pushed"
  /** The history entry the last run committed: its checkpoint asks for this one. */
  runEntry: number | null
  /** Only ever the network's opinion. Whether work is unsaved is derived. */
  network: Network
  /** Failed saves in a row, for the backoff and the give-up. */
  attempts: number
  /**
   * A stopped run saved on the server and its revision has not reached us.
   *
   * Stop closes the stream before the run's `data-saved` part can arrive,
   * and the server saves after it meters the run, so its revision moves late.
   * Until the read-back brings it, every save would carry a stale revision
   * and 409 on the run's own write — and a conflict stops autosave for good.
   */
  awaitingSync: boolean
}

export function initialState(document: VideoDocument, revision: number): State {
  return {
    history: createHistory(document),
    revision,
    seq: 0,
    savedSeq: 0,
    run: "idle",
    runEntry: null,
    network: { status: "clean" },
    attempts: 0,
    awaitingSync: false,
  }
}

type Action =
  | { type: "apply"; ops: EditOp[] }
  /**
   * An agent run's ops, arriving from the stream while it works.
   *
   * Separate from `apply` for two reasons that both matter. The author is the
   * agent, so provenance records who cut what and undoing a run can leave the
   * user's own edits alone. And the server is applying the same ops to its own
   * copy and will save them itself, so this must not mark the document dirty —
   * an autosave racing the run's own write is the conflict the lock exists to
   * prevent.
   */
  | { type: "agent"; ops: EditOp[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saved"; revision: number; seq: number }
  /**
   * The revision the server holds after a run saved on our behalf.
   *
   * Not `saved`: nothing local was written, so `savedSeq` must track the seq
   * the agent's ops left behind rather than whatever a request captured.
   */
  | { type: "synced"; revision: number }
  | { type: "run-start" }
  | { type: "run-end" }
  /** A stopped run's save is landing on the server: hold autosave for its revision. */
  | { type: "await-sync" }
  /** The read-back gave up: the run's revision is unknown. */
  | { type: "sync-lost" }
  | { type: "save-start" }
  /** A 409: `sent` is the revision the request carried, `actual` the one that won. */
  | { type: "save-conflict"; sent: number; actual: number | null }
  | { type: "save-failed"; message: string }
  | { type: "retry" }

/**
 * Select a scene, and nothing else: where the person is looking, not what the
 * cut is. Saved, so the project reopens on it, but never an undo entry — Cmd+Z
 * should take back an edit, not a click on a tab, and a navigation pushed on
 * top of a run would leave "Undo the run" pointing at the wrong entry.
 */
function viewOnly(ops: EditOp[]): boolean {
  return ops.every((op) => op.op === "select_scene")
}

/** Exported for its tests (use-document.test.ts). */
export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "apply": {
      if (action.ops.length === 0) return state

      const result = applyOps(
        // A synthetic snapshot: applyOps wants one, but the concurrency check
        // belongs to the server. No expectedRevision is passed, so it reduces
        // and stamps without asserting anything about what the server holds.
        { document: state.history.present, revision: state.revision, lock: UNLOCKED },
        action.ops,
        { author: "user" }
      )

      return {
        ...state,
        // Any new edit forks the timeline; a redo stack that survived it would
        // offer to reapply changes to a document that no longer exists. A
        // navigation forks nothing, so it keeps the stacks as they are.
        history: viewOnly(action.ops)
          ? replacePresent(state.history, result.snapshot.document)
          : commit(state.history, result.snapshot.document),
        seq: state.seq + 1,
      }
    }

    case "agent": {
      if (action.ops.length === 0) return state

      const result = applyOps(
        { document: state.history.present, revision: state.revision, lock: UNLOCKED },
        action.ops,
        { author: "agent" }
      )

      const joins = state.run === "pushed"
      return {
        ...state,
        history: joins
          ? amend(state.history, result.snapshot.document)
          : commit(state.history, result.snapshot.document),
        run: state.run === "idle" ? "idle" : "pushed",
        runEntry: state.run === "open" ? state.history.nextId : state.runEntry,
        // seq and savedSeq move together: the browser is being told what the
        // server already has, so this is a change to the document that is not
        // a change to save.
        seq: state.seq + 1,
        savedSeq: state.seq + 1,
      }
    }

    case "synced":
      return {
        ...state,
        revision: action.revision,
        awaitingSync: false,
        // A revision from the server is exactly what "unsynced" was missing.
        network: state.network.status === "unsynced" ? { status: "clean" } : state.network,
      }

    case "await-sync":
      return { ...state, awaitingSync: true }

    case "sync-lost":
      return { ...state, awaitingSync: false, network: { status: "unsynced" } }

    case "save-start":
      return { ...state, network: { status: "saving" } }

    case "save-conflict": {
      const verdict = conflictVerdict(state, action.sent, action.actual)
      // Retry and wait both leave the work dirty with nothing failing: the
      // autosave fires again on the revision we now hold, or once the
      // read-back brings it.
      if (verdict !== "conflict") return { ...state, network: { status: "clean" } }
      return { ...state, network: { status: "conflict" } }
    }

    case "save-failed": {
      const attempts = state.attempts + 1
      return {
        ...state,
        attempts,
        network: { status: "error", message: action.message, givenUp: attempts >= MAX_ATTEMPTS },
      }
    }

    case "retry":
      return { ...state, attempts: 0, network: { status: "clean" } }

    case "run-start":
      return { ...state, run: "open", runEntry: null }

    case "run-end":
      return { ...state, run: "idle" }

    case "undo": {
      if (state.history.past.length === 0) return state
      return { ...state, history: undoHistory(state.history), seq: state.seq + 1 }
    }

    case "redo": {
      if (state.history.future.length === 0) return state
      return { ...state, history: redoHistory(state.history), seq: state.seq + 1 }
    }

    case "saved":
      // savedSeq is what was actually written, not the current seq — so an
      // edit made while the request was in flight leaves the document dirty
      // and the autosave picks it up on the next quiet moment.
      return {
        ...state,
        revision: action.revision,
        savedSeq: action.seq,
        attempts: 0,
        network: { status: "clean" },
      }
  }
}

export function useDocument(
  projectId: string,
  initial: VideoDocument,
  initialRevision: number,
  /** The network. The prototype mock passes a local one (StudioHarness). */
  fetcher: typeof fetch = networkFetch
) {
  const [state, dispatch] = React.useReducer(reduce, initialRevision, (revision) =>
    initialState(initial, revision)
  )

  const dirty = state.seq !== state.savedSeq

  const apply = React.useCallback(
    (ops: EditOp[]) => dispatch({ type: "apply", ops }),
    []
  )
  const applyAgentOps = React.useCallback(
    (ops: EditOp[]) => dispatch({ type: "agent", ops }),
    []
  )
  const syncRevision = React.useCallback(
    (revision: number) => dispatch({ type: "synced", revision }),
    []
  )
  const awaitSync = React.useCallback(() => dispatch({ type: "await-sync" }), [])
  const syncLost = React.useCallback(() => dispatch({ type: "sync-lost" }), [])
  const beginRun = React.useCallback(() => dispatch({ type: "run-start" }), [])
  const endRun = React.useCallback(() => dispatch({ type: "run-end" }), [])
  const undo = React.useCallback(() => dispatch({ type: "undo" }), [])
  const redo = React.useCallback(() => dispatch({ type: "redo" }), [])

  const flush = React.useCallback(
    async (document: VideoDocument, revision: number, seq: number) => {
      dispatch({ type: "save-start" })

      try {
        const response = await fetcher(`/api/editor/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document, revision }),
        })

        if (response.status === 409) {
          // The reducer decides whether this is a real conflict or the run's
          // own save arriving late (conflictVerdict). Local work stays intact
          // either way.
          const detail = (await response.json().catch(() => null)) as {
            actual?: number
          } | null
          dispatch({
            type: "save-conflict",
            sent: revision,
            actual: typeof detail?.actual === "number" ? detail.actual : null,
          })
          return
        }

        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          dispatch({ type: "save-failed", message: detail?.error ?? "Save failed." })
          return
        }

        const saved = (await response.json()) as { revision: number }
        dispatch({ type: "saved", revision: saved.revision, seq })
      } catch {
        dispatch({ type: "save-failed", message: "Save could not reach the server." })
      }
    },
    [projectId, fetcher]
  )

  /** Try again after the automatic attempts have stopped. */
  const retry = React.useCallback(() => dispatch({ type: "retry" }), [])

  /**
   * Autosave on quiet. When it may fire, and how long it waits, is
   * autosaveDelay's call; the timer re-arms on every edit, so a drag is one
   * write rather than sixty.
   */
  const delay = autosaveDelay({
    dirty,
    awaitingSync: state.awaitingSync,
    network: state.network,
    attempts: state.attempts,
  })
  React.useEffect(() => {
    if (delay === null) return
    const timer = setTimeout(
      () => void flush(state.history.present, state.revision, state.seq),
      delay
    )
    return () => clearTimeout(timer)
  }, [delay, state.history.present, state.revision, state.seq, flush])

  /**
   * Say something before the tab closes on unsaved work.
   *
   * Browsers ignore custom text and show their own prompt now, which is fine —
   * the point is the prompt existing, because the autosave window is over a
   * second and closing inside it silently loses the edit.
   */
  React.useEffect(() => {
    if (!dirty) return

    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  /**
   * Derived, not mirrored. A conflict or an error outranks everything, then a
   * save in flight, then unsaved work — and "clean" only when the document
   * genuinely matches what the server confirmed.
   */
  const network = state.network
  const save: SaveState =
    network.status === "conflict" || network.status === "error" || network.status === "unsynced"
      ? network
      : network.status === "saving"
        ? network
        : dirty
          ? { status: "dirty" }
          : { status: "clean" }

  const historyIds = React.useMemo(() => idsOf(state.history), [state.history])

  return {
    document: state.history.present,
    apply,
    applyAgentOps,
    syncRevision,
    awaitSync,
    syncLost,
    undo,
    redo,
    beginRun,
    endRun,
    /** The entry ids on each stack: a run's checkpoint acts only while its entry is on top. */
    historyIds,
    /** The history entry the last agent run committed, or null before any did. */
    runEntry: state.runEntry,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    save,
    retry,
  }
}
