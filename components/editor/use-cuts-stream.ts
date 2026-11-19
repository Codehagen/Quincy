"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, type ChatTransport } from "ai"

import type { CutsData, CutsMessage, RecommendData } from "@/lib/editor/stream-parts"
import { asksForThreeCuts } from "@/lib/editor/three-cuts"

import { beatFromPart, cutLane, type Director } from "./agent-cursor/director"
import type { ArrivalMode } from "./arrival/use-arrival"
import { cutBeats, gateIsOpen, initialStreamState, reduce, runEdits, toolCallIds } from "./cuts-stream"
import type { HistoryIds } from "./history"
import { checkCallId, useSelfCheck, type LookSource } from "./self-check/use-self-check"
import { networkFetch } from "./use-document"

/**
 * The cutting run's stream and its run state, for the margin to draw
 * (studio-chat.tsx). The transport, every data part the run sends, Stop and
 * its read-back, one undo group per run, and the self-check. The rules it
 * keeps are pure functions in cuts-stream.ts.
 */

/** The re-read after Stop: about ten seconds, then the save badge says it could not confirm. */
const READ_BACK_TRIES = 10
const READ_BACK_DELAY_MS = 1000

export type RunControls = {
  /** Start and end one undo group (use-document). */
  beginRun: () => void
  endRun: () => void
  /** Hold autosave: a stopped run's save is landing and its revision is on its way. */
  awaitSync: () => void
  /** The read-back gave up: the run's revision is unknown (the save badge says so). */
  syncLost: () => void
  undo: () => void
  redo: () => void
  /** The entry ids on the undo and redo stacks. */
  historyIds: HistoryIds
  /** The entry the last run committed. */
  runEntry: number | null
  /** The cut's length now. */
  durationUs: number
}

/** What a three-cuts run needs from the desk around the margin. */
export type CutsDesk = {
  /** A three-cuts run named its cuts: show their spines. */
  onCuts: (cuts: CutsData) => void
  onRecommend: (pick: RecommendData) => void
  /** Take one cut back out: its own undo. */
  undoCut: (sceneId: string) => void
  hasScene: (sceneId: string) => boolean
  durationOf: (sceneId: string) => number
  aspectOf: (sceneId: string) => number
}

/**
 * The network the editor talks to, swapped whole: the cutting run's transport
 * and every other request (save, read-back, self-check, transcript, strong
 * line). Only the prototype mock (app/prototypes/cuts-mock) passes one, so
 * the motion can be tuned on the real editor with no server; without it the
 * editor talks to its routes as always.
 */
export type StudioHarness = {
  transport: ChatTransport<CutsMessage>
  fetch: typeof fetch
  /** Whether the arrival plays: the mock plays it on every mount (use-arrival.ts). */
  arrival?: ArrivalMode
}

export function useCutsStream({
  projectId,
  director,
  controls,
  onSaved,
  onRunningChange,
  look,
  desk,
  harness,
}: {
  projectId: string
  director: Director
  controls: RunControls
  onSaved: (revision: number) => void
  onRunningChange: (running: boolean) => void
  look: LookSource
  desk: CutsDesk
  harness?: StudioHarness
}) {
  const [state, dispatch] = React.useReducer(reduce, initialStreamState)

  // Development only: `?replay=1` on the page plays the model's part from a
  // script (lib/editor/replay-model.ts), so the cursor can be watched on a
  // real project without a model call. The routes refuse it in production.
  const [replay] = React.useState(
    () =>
      process.env.NODE_ENV !== "production" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("replay") === "1"
  )

  const fetcher = harness?.fetch ?? networkFetch

  const [transport] = React.useState<ChatTransport<CutsMessage>>(() => {
    if (harness) return harness.transport
    return new DefaultChatTransport({
      api: `/api/editor/projects/${projectId}/agent${replay ? "?replay=1" : ""}`,
    })
  })

  const savedRef = React.useRef(onSaved)
  React.useEffect(() => {
    savedRef.current = onSaved
  }, [onSaved])

  const controlsRef = React.useRef(controls)
  React.useEffect(() => {
    controlsRef.current = controls
  }, [controls])

  const beatSeq = React.useRef(0)
  const savedRevision = React.useRef<number | null>(null)

  /** The self-check: one look at three frames after a run that changed what is on screen. */
  const selfCheck = useSelfCheck({
    projectId,
    replay,
    director,
    look,
    fetcher,
    onSaved: (revision) => {
      savedRevision.current = revision
      savedRef.current(revision)
    },
  })

  /**
   * After Stop, the server still saves what the run already cut (see the
   * agent route's onEnd), but the stream is closed, so `data-saved` never
   * reaches us. Without the new revision the next autosave 409s on the run's
   * own write. So autosave holds (use-document's awaitingSync) while this
   * reads the project back until the run's lock is off, then takes its
   * revision, and the held save goes out on top of it. The timeline stays
   * open: edits made meanwhile are kept and saved once the revision is here.
   *
   * A bounded read of our own row: at most READ_BACK_TRIES requests. If it
   * never sees the lock come off, it says so through the save badge rather
   * than letting the next save fail as a conflict nobody made.
   */
  const readingBack = React.useRef(false)
  const readBack = React.useCallback(async () => {
    if (readingBack.current) return
    readingBack.current = true
    controlsRef.current.awaitSync()
    try {
      for (let attempt = 0; attempt < READ_BACK_TRIES; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, READ_BACK_DELAY_MS))
        try {
          const response = await fetcher(`/api/editor/projects/${projectId}`, { cache: "no-store" })
          // A refusal now may be a blip; the tries are bounded either way.
          if (!response.ok) continue
          const project = (await response.json()) as { revision: number; lock: { status: string } | null }
          if (!project.lock || project.lock.status === "unlocked") {
            savedRef.current(project.revision)
            return
          }
        } catch {
          // Offline for a moment: the next try may reach it.
        }
      }
      controlsRef.current.syncLost()
    } finally {
      readingBack.current = false
    }
  }, [projectId, fetcher])

  const { messages, sendMessage, status, stop, error, regenerate, clearError, addToolApprovalResponse } =
    useChat<CutsMessage>({
      transport,
      // An answered question resumes the run on its own: the approved cut
      // lands with the cursor like any other step.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onFinish: ({ isAbort }) => {
        if (isAbort) void readBack()
      },
      /**
       * Every data part the run sends, in order. `data-ops` is transient and
       * only ever visible here: it goes to the director, which lands it with
       * a press. A reload that replayed past ops would double every edit.
       */
      onData: (part) => {
        if (part.type === "data-ops") {
          director.push(beatFromPart(`b${beatSeq.current++}`, part.data))
        } else if (part.type === "data-cuts") {
          // One cursor per cut, out of step, the first leading.
          const data = part.data
          director.setLanes(data.cuts.map((cut, index) => ({ ...cutLane(index, cut.letter), key: cut.sceneId })))
          desk.onCuts(data)
        } else if (part.type === "data-recommend") {
          desk.onRecommend(part.data)
        } else if (part.type === "data-saved") {
          const { revision, sceneId } = part.data
          savedRevision.current = revision
          if (sceneId) dispatch({ type: "cut-saved", sceneId, revision })
          onSaved(revision)
        } else if (part.type === "data-check") {
          const { offer, sceneId } = part.data
          selfCheck.receive(offer, sceneId ?? null)
        } else if (part.type === "data-run-failed") {
          dispatch({ type: "failed", message: part.data.message })
        }
      },
    })

  const streaming = status === "submitted" || status === "streaming"
  const gateOpen = gateIsOpen(status, messages.at(-1), state.stopped)
  // The run is over when the stream has ended and the cursor has parked.
  // A pending or running self-check keeps the run open, so its fix joins
  // the run's undo and its receipt.
  const isBusy = streaming || gateOpen || director.busy || selfCheck.pending || selfCheck.checking

  React.useEffect(() => {
    onRunningChange(isBusy)
  }, [isBusy, onRunningChange])

  /* ── One run: one undo group, one record ──────────────────────────────── */

  const runStart = React.useRef<number | null>(null)
  const latest = React.useRef({ controls, messages, beats: director.beats })
  React.useEffect(() => {
    latest.current = { controls, messages, beats: director.beats }
  })

  const streamOpen = React.useRef(false)
  React.useEffect(() => {
    if (streaming && !streamOpen.current) {
      streamOpen.current = true
      // A stream that resumes a run after its question opens the cursor
      // again but not a new run: same undo entry, same receipt.
      if (runStart.current === null) {
        runStart.current = latest.current.controls.durationUs
        savedRevision.current = null
        latest.current.controls.beginRun()
      }
      director.begin()
    } else if (!streaming && streamOpen.current) {
      streamOpen.current = false
      director.finish()
    }
  }, [streaming, director])

  React.useEffect(() => {
    if (isBusy || runStart.current === null) return
    const { controls: now, messages: all, beats } = latest.current
    const startUs = runStart.current
    runStart.current = null
    now.endRun()
    const last = all.at(-1)
    if (!last || last.role !== "assistant") return
    dispatch({
      type: "run-ended",
      messageId: last.id,
      record: {
        startUs,
        endUs: now.durationUs,
        entry: now.runEntry,
        revision: savedRevision.current,
        // Counted over the whole turn, so a run resumed after a question
        // reads as one receipt.
        edits: runEdits(last, beats, checkCallId(last.id)),
      },
    })
  }, [isBusy])

  /* ── The self-check, once the cursor has parked ─────────────────────── */

  const { pending: checkPending, checking, start: startCheck, cancel: cancelCheck } = selfCheck
  React.useEffect(() => {
    if (!checkPending || checking || streaming || director.busy) return
    const last = latest.current.messages.at(-1)
    if (!last || last.role !== "assistant") return
    const calls = toolCallIds(last)
    const landed = latest.current.beats.filter((b) => b.landed)
    void startCheck(last.id, (sceneId) =>
      (sceneId
        ? cutBeats(landed, sceneId)
        : landed.filter((b) => b.toolCallId && calls.has(b.toolCallId))
      ).map((b) => b.target)
    )
  }, [checkPending, checking, streaming, director.busy, startCheck])

  /* ── Sending, stopping ─────────────────────────────────────────────── */

  /** Sends a request unless a run is open; says whether it went. */
  const send = React.useCallback(
    (text: string): boolean => {
      const trimmed = text.trim()
      if (!trimmed || isBusy) return false
      dispatch({ type: "sent" })
      clearError()
      void sendMessage(
        { text: trimmed },
        asksForThreeCuts(trimmed) ? { body: { mode: "three-cuts" } } : undefined
      )
      return true
    },
    [isBusy, sendMessage, clearError]
  )

  /**
   * Esc or Stop: the cursor parks, what landed stays, the rest is skipped.
   * A stream cut off here is saved by the server after we stop listening, so
   * the read-back starts now, before anything could autosave on the old
   * revision. A sent self-check is left to answer (use-self-check's `sent`).
   */
  const halt = React.useCallback(() => {
    const last = messages.at(-1)
    if (last?.role === "assistant") dispatch({ type: "stopped", messageId: last.id })
    director.stop()
    cancelCheck()
    if (streaming) void readBack()
    void stop()
  }, [director, messages, stop, cancelCheck, streaming, readBack])

  /**
   * Esc is bound once per run, not once per render. `halt` changes with
   * every streamed part, so the listener was swapped on each render; a
   * keydown listener ahead of it that sets state (the desk's Esc clears its
   * selections) can re-render synchronously mid-dispatch, and then the old
   * listener is removed and the new one, added during the dispatch, is not
   * called. About one press in three was lost in the mock that way.
   */
  const haltOnEscape = React.useEffectEvent(halt)
  React.useEffect(() => {
    if (!isBusy) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") haltOnEscape()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isBusy])

  /** Try the failed request again, as the same kind of run it was. */
  const retry = React.useCallback(
    (asked: string | null) =>
      void regenerate(asked !== null && asksForThreeCuts(asked) ? { body: { mode: "three-cuts" } } : undefined),
    [regenerate]
  )

  return {
    messages,
    status,
    error,
    isBusy,
    ...state,
    checks: selfCheck.checks,
    send,
    halt,
    retry,
    respond: (id: string, approved: boolean) => void addToolApprovalResponse({ id, approved }),
  }
}
