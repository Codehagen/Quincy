"use client"

import * as React from "react"

import type { Riff } from "@/lib/riffs"

import { RESERVE, RIFFS } from "./data"

/**
 * The decisions, made locally, so every variant is a thing you can work rather
 * than a picture of one.
 *
 * The production `AngleActions` calls the `draftAngle` server action, and that
 * is the one production component this surface deliberately does not mount.
 * `/prototypes/*` sits behind the auth proxy, so with a live session that
 * action **writes real rows** — clicking through fixture riffs to compare
 * layouts would leave real drafts in the database and spend real model calls at
 * roughly a cent each. Without a session it fails at the last step, which would
 * make "Draft this" a dead button on the one control the page exists to offer.
 *
 * So the decision is local and reversible. Everything downstream of it — the
 * angle receding, the counts ticking, the riff emptying out — is the real
 * behaviour driven by the real `AngleCard`.
 */

/** How long a fake model call takes. Long enough to watch a skeleton hold. */
const GENERATE_MS = 1500
/** How long a draft write takes. Long enough to see the pending label. */
const DRAFT_MS = 400

export type Board = ReturnType<typeof useRiffBoard>

/** `working` while an ask is in flight; `empty` when Quincy had nothing. */
export type AskState = "working" | "empty"

export function useRiffBoard() {
  const [riffs, setRiffs] = React.useState<Riff[]>(RIFFS)
  /** The angle whose draft is in flight, so its button can say so. */
  const [drafting, setDrafting] = React.useState<string | null>(null)
  /**
   * Channel asks, keyed `riffId:channelId`.
   *
   * A map rather than a boolean per riff: you can be waiting on X and LinkedIn
   * for the same riff at once, and the two have to be able to come back
   * separately — one of them finding nothing is a real outcome.
   */
  const [asks, setAsks] = React.useState<Record<string, AskState>>({})

  /**
   * Ids from a counter rather than a clock. `Date.now()` and `Math.random()`
   * are both banned in render by the repo's purity lint, and a counter is
   * stable across a re-render in a way a clock-derived id is not.
   */
  const nextId = React.useRef(0)

  /** Every pending timer, so unmount cannot write into a dead tree. */
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([])
  React.useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const later = React.useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }, [])

  const draft = React.useCallback(
    (angleId: string) => {
      // The double-click guard `disabled={pending}` gives the real button.
      // Without it two clicks are two drafts of one angle.
      if (drafting) return
      setDrafting(angleId)
      later(() => {
        setRiffs((current) =>
          current.map((riff) => ({
            ...riff,
            angles: riff.angles.map((angle) =>
              angle.id === angleId
                ? { ...angle, status: "drafted" as const }
                : angle
            ),
          }))
        )
        setDrafting(null)
      }, DRAFT_MS)
    },
    [drafting, later]
  )

  /** Drops one angle. The riff stays, even if this was its last — an empty
   *  riff is a real state and every variant needs an answer for it. */
  const discardAngle = React.useCallback((angleId: string) => {
    setRiffs((current) =>
      current.map((riff) => ({
        ...riff,
        angles: riff.angles.filter((angle) => angle.id !== angleId),
      }))
    )
  }, [])

  const discardRiff = React.useCallback((riffId: string) => {
    setRiffs((current) => current.filter((riff) => riff.id !== riffId))
  }, [])

  /**
   * "Nothing here goes to X — make me one."
   *
   * The whole point of the Channels variant. Resolves from `RESERVE`, and
   * resolves to **`empty`** when that riff has nothing for that channel: an ask
   * that can only ever succeed is not an ask, and "Quincy could not find one"
   * is the outcome the design most needs an answer for.
   */
  const askForChannel = React.useCallback(
    (riffId: string, channelId: string) => {
      const key = `${riffId}:${channelId}`
      if (asks[key] === "working") return
      setAsks((current) => ({ ...current, [key]: "working" }))

      later(() => {
        const reserve = RESERVE[key]
        if (!reserve) {
          setAsks((current) => ({ ...current, [key]: "empty" }))
          return
        }

        nextId.current += 1
        const angle = { ...reserve, id: `${key}-${nextId.current}` }
        setRiffs((current) =>
          current.map((riff) =>
            riff.id === riffId
              ? { ...riff, angles: [...riff.angles, angle] }
              : riff
          )
        )
        setAsks((current) => {
          const next = { ...current }
          delete next[key]
          return next
        })
      }, GENERATE_MS)
    },
    [asks, later]
  )

  /** Clears an `empty` result so the offer can be made again. */
  const clearAsk = React.useCallback((key: string) => {
    setAsks((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  /** Replaces the queue wholesale. The Faults variant drives its own. */
  const load = React.useCallback((next: Riff[]) => setRiffs(next), [])

  return {
    riffs,
    drafting,
    asks,
    draft,
    discardAngle,
    discardRiff,
    askForChannel,
    clearAsk,
    load,
  }
}

/**
 * What is still a question — never what exists. A number that keeps saying
 * seven after you have dealt with four is wrong in the direction that matters.
 */
export function countOpen(riffs: Riff[]) {
  const angles = riffs.reduce(
    (n, r) => n + r.angles.filter((a) => a.status !== "drafted").length,
    0
  )
  const open = riffs.filter(
    (r) => r.state === "ready" && r.angles.some((a) => a.status !== "drafted")
  ).length
  return { riffs: open, angles }
}

/** Group by the server-rendered day string, exactly as the shipped page does. */
export function groupByDay(riffs: Riff[]): [string, Riff[]][] {
  const groups = new Map<string, Riff[]>()
  for (const riff of riffs) {
    const list = groups.get(riff.capturedAt) ?? []
    list.push(riff)
    groups.set(riff.capturedAt, list)
  }
  return [...groups.entries()]
}
