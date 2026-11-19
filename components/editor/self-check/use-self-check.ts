"use client"

import * as React from "react"

import type { EditOp, OpTarget } from "@/lib/editor/ops"
import { checkTimes } from "@/lib/editor/self-check"
import type { Scene } from "@/lib/editor/types"

import { beatFromPart, type Director } from "../agent-cursor/director"
import { networkFetch } from "../use-document"
import type { CheckFrame, CheckState } from "./check-frames"
import { grabFrames } from "./grab"

/**
 * The self-check's client half (plans/036, phase C).
 *
 * A run that changed the picture or captions ends with a signed offer
 * (`data-check`). While the offer is pending the run is still busy, so the
 * check's fix joins the run's undo group and its receipt. When the cursor
 * parks, the browser grabs up to three frames, sends them once, and lands
 * the fixes through the director: one press each.
 *
 * The server holds the ceiling (one check per run, three frames); this side
 * only never asks twice for one offer, since the offer is consumed on use.
 */

export type LookSource = {
  /** A scene as it is now (a ref read, not a render's copy); the one on screen without an id. */
  scene: (sceneId?: string) => Scene | undefined
  canvas: { width: number; height: number }
  proxyUrls: Record<string, string | null>
}

type CheckResponse = {
  frames: { atUs: number; note: string }[]
  say: string
  sceneId?: string
  steps: { toolName: string; ops: EditOp[] }[]
  revision: number | null
}

/** One run's earned look. Three cuts earn up to three, one per cut, looked at in turn. */
type Offer = { token: string; sceneId: string | null }

/** Where a check's state is kept: per turn, and per cut inside a three-cuts turn. */
export function checkKey(messageId: string, sceneId?: string | null): string {
  return sceneId ? `${messageId}:${sceneId}` : messageId
}

export function useSelfCheck({
  projectId,
  replay,
  director,
  look,
  onSaved,
  fetcher = networkFetch,
}: {
  projectId: string
  replay: boolean
  /** The network; the prototype mock passes a local one. */
  fetcher?: typeof fetch
  director: Director
  look: LookSource
  onSaved: (revision: number) => void
}) {
  const [offers, setOffers] = React.useState<Offer[]>([])
  const [checking, setChecking] = React.useState(false)
  const [checks, setChecks] = React.useState<Record<string, CheckState>>({})
  const abort = React.useRef<AbortController | null>(null)

  const latest = React.useRef({ look, onSaved, director })
  React.useEffect(() => {
    latest.current = { look, onSaved, director }
  })

  React.useEffect(() => () => abort.current?.abort(), [])

  const start = React.useCallback(
    async (messageId: string, targetsOf: (sceneId: string | null) => (OpTarget | null)[]) => {
      const head = offers[0]
      if (!head) return
      const { token, sceneId } = head
      const key = checkKey(messageId, sceneId)
      setOffers((prev) => prev.slice(1))
      setChecking(true)

      const controller = new AbortController()
      abort.current?.abort()
      abort.current = controller
      const { look: source } = latest.current
      const scene = source.scene(sceneId ?? undefined)

      try {
        if (!scene) return
        const times = checkTimes(scene, targetsOf(sceneId))
        const frames: CheckFrame[] = await grabFrames({
          scene,
          canvas: source.canvas,
          proxyUrls: source.proxyUrls,
          times,
          signal: controller.signal,
        })
        // No frame could be read: nothing to look at, nothing spent.
        if (frames.length === 0 || controller.signal.aborted) return

        setChecks((prev) => ({ ...prev, [key]: { status: "looking", frames } }))

        const response = await fetcher(
          `/api/editor/projects/${projectId}/check${replay ? "?replay=1" : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offer: token, frames }),
            signal: controller.signal,
          }
        )
        const body = (await response.json().catch(() => null)) as
          | (CheckResponse & { error?: string })
          | null

        if (!response.ok || !body) {
          setChecks((prev) => ({
            ...prev,
            [key]: { status: "failed", message: body?.error ?? "The check did not answer." },
          }))
          return
        }

        const notes = new Map(body.frames.map((f) => [f.atUs, f.note]))
        setChecks((prev) => ({
          ...prev,
          [key]: {
            status: "done",
            say: body.say,
            frames: frames.map((f) => ({ ...f, note: notes.get(f.atUs) })),
          },
        }))

        if (body.steps.length > 0) {
          const { director: cursor } = latest.current
          cursor.begin()
          body.steps.forEach((step, index) =>
            cursor.push(
              beatFromPart(`check-${key}-${index}`, {
                ops: step.ops,
                toolCallId: checkCallId(messageId),
                toolName: step.toolName,
                sceneId: sceneId ?? undefined,
              })
            )
          )
          cursor.finish()
        }
        if (body.revision !== null) latest.current.onSaved(body.revision)
      } catch (cause) {
        if (controller.signal.aborted) return
        console.error("[self-check]", cause)
        setChecks((prev) => ({
          ...prev,
          [key]: { status: "failed", message: "The check did not answer." },
        }))
      } finally {
        if (abort.current === controller) abort.current = null
        setChecking(false)
      }
    },
    [offers, projectId, replay, fetcher]
  )

  const receive = React.useCallback(
    (token: string, sceneId: string | null = null) =>
      setOffers((prev) => [...prev, { token, sceneId }]),
    []
  )

  /** Stop: drop the offer and any look in flight. Nothing lands. */
  const cancel = React.useCallback(() => {
    setOffers([])
    abort.current?.abort()
  }, [])

  return {
    /** A `data-check` part arrived: the run earned one look. */
    receive,
    pending: offers.length > 0,
    checking,
    checks,
    start,
    cancel,
  }
}

/** The tool call id a check's beats carry, so the run's receipt counts them. */
export function checkCallId(messageId: string): string {
  return `check:${messageId}`
}
