"use client"

import * as React from "react"

import type { DraftAngleResult } from "@/lib/angle-draft"
import type { Angle, Riff } from "@/lib/riffs"

import { LAB_RIFFS } from "./fixtures"

/**
 * One queue for the whole lab, so a Draft pressed in one direction shows in
 * the next, and the desktop and the phone frame are two windows onto the same
 * state. Every action is local: nothing calls a server action, nothing
 * spends. Draft answers after a short wait, as the real one does.
 */

/** Which frame an action came from, so only that frame shows the UndoBar (it takes focus). */
export type FrameId = "desktop" | "phone"

export type Queue = {
  /** The riffs still on the page, with drafted and dropped ideas applied. */
  riffs: Riff[]
  /** Ideas you set aside for later, in the order you did it. */
  later: readonly string[]
  draft: (angle: Angle) => Promise<DraftAngleResult>
  drop: (angleId: string) => void
  setLater: (angleId: string, on: boolean) => void
  dismiss: (riff: Riff, from: FrameId) => void
  undo: { riff: Riff; from: FrameId } | null
  restore: () => void
  reset: () => void
  /** The open riff per direction and frame-independent, so both frames agree. */
  open: Record<string, string | null>
  setOpen: (direction: string, id: string | null) => void
}

/** How long a Dismiss can be undone (ideas-screen.tsx's UNDO_MS). */
const UNDO_MS = 7000
/** How long the stand-in Draft takes to come back. */
const DRAFT_MS = 700

export function useQueue(size: number): Queue {
  const [drafted, setDrafted] = React.useState<ReadonlySet<string>>(() => new Set())
  const [dropped, setDropped] = React.useState<ReadonlySet<string>>(() => new Set())
  const [gone, setGone] = React.useState<ReadonlySet<string>>(() => new Set())
  const [later, setLaterList] = React.useState<readonly string[]>([])
  const [undo, setUndo] = React.useState<Queue["undo"]>(null)
  const [open, setOpenMap] = React.useState<Record<string, string | null>>({})
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const riffs = React.useMemo(
    () =>
      LAB_RIFFS.slice(0, size)
        .filter((r) => !gone.has(r.id))
        .map((r) => ({
          ...r,
          angles: r.angles
            .filter((a) => !dropped.has(a.id))
            .map((a) => (drafted.has(a.id) ? { ...a, status: "drafted" as const } : a)),
        })),
    [size, gone, dropped, drafted]
  )

  const draft = React.useCallback(
    (angle: Angle) =>
      new Promise<DraftAngleResult>((resolve) => {
        setTimeout(() => {
          setDrafted((s) => new Set(s).add(angle.id))
          resolve({
            ok: true,
            draftId: `lab-${angle.id}`,
            channels: [],
            written: true,
            fellBack: [],
            overLimit: [],
            existing: false,
            versions: [],
          })
        }, DRAFT_MS)
      }),
    []
  )

  const drop = React.useCallback((id: string) => setDropped((s) => new Set(s).add(id)), [])

  const setLater = React.useCallback((id: string, on: boolean) => {
    setLaterList((l) => (on ? [...l.filter((x) => x !== id), id] : l.filter((x) => x !== id)))
  }, [])

  const dismiss = React.useCallback((riff: Riff, from: FrameId) => {
    if (timer.current) clearTimeout(timer.current)
    setGone((s) => new Set(s).add(riff.id))
    setUndo({ riff, from })
    timer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }, [])

  const restore = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setUndo((u) => {
      if (u) {
        setGone((s) => {
          const next = new Set(s)
          next.delete(u.riff.id)
          return next
        })
      }
      return null
    })
  }, [])

  const reset = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setDrafted(new Set())
    setDropped(new Set())
    setGone(new Set())
    setLaterList([])
    setUndo(null)
    setOpenMap({})
  }, [])

  const setOpen = React.useCallback((direction: string, id: string | null) => {
    setOpenMap((m) => ({ ...m, [direction]: id }))
  }, [])

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return { riffs, later, draft, drop, setLater, dismiss, undo, restore, reset, open, setOpen }
}

/* ── Shared derivations ─────────────────────────────────────────────── */

/** Ideas still waiting on a decision. */
export function waitingIdeas(riff: Riff) {
  return riff.state === "ready" ? riff.angles.filter((a) => a.status !== "drafted").length : 0
}

export function isWaiting(riff: Riff) {
  return riff.state !== "ready" || waitingIdeas(riff) > 0
}

export function totalWaiting(riffs: Riff[]) {
  return riffs.reduce((n, r) => n + waitingIdeas(r), 0)
}

/** By the day string the server rendered, in order. */
export function groupByDay(riffs: Riff[]): [string, Riff[]][] {
  const groups = new Map<string, Riff[]>()
  for (const r of riffs) groups.set(r.capturedAt, [...(groups.get(r.capturedAt) ?? []), r])
  return [...groups.entries()]
}
