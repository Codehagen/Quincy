"use client"

import * as React from "react"

import { applyOps, type EditOp } from "@/lib/editor/ops"
import { UNLOCKED, type VideoDocument } from "@/lib/editor/types"

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

type State = {
  document: VideoDocument
  past: VideoDocument[]
  future: VideoDocument[]
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

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "apply": {
      if (action.ops.length === 0) return state

      const result = applyOps(
        // A synthetic snapshot: applyOps wants one, but the concurrency check
        // belongs to the server. No expectedRevision is passed, so it reduces
        // and stamps without asserting anything about what the server holds.
        { document: state.document, revision: state.revision, lock: UNLOCKED },
        action.ops,
        { author: "user" }
      )

      return {
        ...state,
        document: result.snapshot.document,
        past: [...state.past, state.document],
        // Any new edit forks the timeline; a redo stack that survived it would
        // offer to reapply changes to a document that no longer exists.
        future: [],
        seq: state.seq + 1,
      }
    }

    case "agent": {
      if (action.ops.length === 0) return state

      const result = applyOps(
        { document: state.document, revision: state.revision, lock: UNLOCKED },
        action.ops,
        { author: "agent" }
      )

      return {
        ...state,
        document: result.snapshot.document,
        past: [...state.past, state.document],
        future: [],
        // seq and savedSeq move together: the browser is being told what the
        // server already has, so this is a change to the document that is not
        // a change to save.
        seq: state.seq + 1,
        savedSeq: state.seq + 1,
      }
    }

    case "synced":
      return { ...state, revision: action.revision }

    case "undo": {
      const previous = state.past.at(-1)
      if (!previous) return state

      return {
        ...state,
        document: previous,
        past: state.past.slice(0, -1),
        future: [state.document, ...state.future],
        seq: state.seq + 1,
      }
    }

    case "redo": {
      const [next, ...rest] = state.future
      if (!next) return state

      return {
        ...state,
        document: next,
        past: [...state.past, state.document],
        future: rest,
        seq: state.seq + 1,
      }
    }

    case "saved":
      // savedSeq is what was actually written, not the current seq — so an
      // edit made while the request was in flight leaves the document dirty
      // and the autosave picks it up on the next quiet moment.
      return { ...state, revision: action.revision, savedSeq: action.seq }
  }
}

export function useDocument(
  projectId: string,
  initial: VideoDocument,
  initialRevision: number
) {
  const [state, dispatch] = React.useReducer(reduce, {
    document: initial,
    past: [],
    future: [],
    revision: initialRevision,
    seq: 0,
    savedSeq: 0,
  })

  /** Only ever the network's opinion. Whether work is unsaved is derived. */
  const [network, setNetwork] = React.useState<SaveState>({ status: "clean" })
  const [attempts, setAttempts] = React.useState(0)

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
  const undo = React.useCallback(() => dispatch({ type: "undo" }), [])
  const redo = React.useCallback(() => dispatch({ type: "redo" }), [])

  const flush = React.useCallback(
    async (document: VideoDocument, revision: number, seq: number) => {
      setNetwork({ status: "saving" })

      try {
        const response = await fetch(`/api/editor/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document, revision }),
        })

        if (response.status === 409) {
          // Someone or something else wrote first. Not recoverable by retrying
          // the same body — that is what made it a conflict — so it is
          // surfaced rather than swallowed, and local work is left intact.
          setNetwork({ status: "conflict" })
          return
        }

        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          fail(detail?.error ?? "Save failed.")
          return
        }

        const saved = (await response.json()) as { revision: number }
        dispatch({ type: "saved", revision: saved.revision, seq })
        setAttempts(0)
        setNetwork({ status: "clean" })
      } catch {
        fail("Save could not reach the server.")
      }

      function fail(message: string) {
        setAttempts((count) => {
          const next = count + 1
          setNetwork({
            status: "error",
            message,
            givenUp: next >= MAX_ATTEMPTS,
          })
          return next
        })
      }
    },
    [projectId]
  )

  /** Try again after the automatic attempts have stopped. */
  const retry = React.useCallback(() => {
    setAttempts(0)
    setNetwork({ status: "clean" })
  }, [])

  /**
   * Autosave on quiet.
   *
   * The timer re-arms on every edit, so a drag is one write rather than sixty.
   * It does not run while a conflict is unresolved: retrying the write that
   * just lost would either fail identically or, worse, succeed and overwrite
   * whatever won.
   */
  React.useEffect(() => {
    if (!dirty) return
    if (network.status === "conflict" || network.status === "saving") return
    // Given up means given up. The work is still here, beforeunload guards the
    // tab, and there is a Retry — but nothing fires on its own again.
    if (network.status === "error" && network.givenUp) return

    const delay =
      network.status === "error"
        ? (RETRY_DELAY[attempts - 1] ?? RETRY_DELAY.at(-1)!)
        : AUTOSAVE_DELAY

    const timer = setTimeout(
      () => void flush(state.document, state.revision, state.seq),
      delay
    )

    return () => clearTimeout(timer)
  }, [
    dirty,
    state.document,
    state.revision,
    state.seq,
    network,
    attempts,
    flush,
  ])

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
  const save: SaveState =
    network.status === "conflict" || network.status === "error"
      ? network
      : network.status === "saving"
        ? network
        : dirty
          ? { status: "dirty" }
          : { status: "clean" }

  return {
    document: state.document,
    apply,
    applyAgentOps,
    syncRevision,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    save,
    retry,
  }
}
