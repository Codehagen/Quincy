"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { parseAsString, useQueryState } from "nuqs"

import { archiveRiff, discardAngle, draftAngle } from "@/app/(app)/ideas/actions"
import type { DraftAngleResult } from "@/lib/angle-draft"
import type { Riff } from "@/lib/riffs"
import { useAnnounce } from "@/components/kit"
import { dismissedSentence, pickAngle } from "@/components/quincy"

import { NO_FILTERS, ideaRows, isOpen, matches, type IdeaFilters, type IdeaRow } from "./idea-rows"

/**
 * The Ideas page's state: the rows, the filters, which idea is open, and
 * the three verbs (Draft, Not this one, Undo). Every write is one of the
 * existing server actions in app/(app)/ideas/actions.ts; every guard on
 * spending (cooldown, entitlement, ownership) is theirs, behind them.
 *
 * - **The open idea is the URL** (`?idea=`, an angle id, or a source's riff
 *   id for a row with no idea). A riff id for a source that has ideas opens
 *   Quincy's pick in it, so a link to a source still lands somewhere useful.
 * - **Draft never fires by itself.** Only a press of D or of the button
 *   calls it; opening, moving, filtering and loading never do. A pending
 *   idea cannot be drafted twice (the press is ignored until the page reads
 *   it back drafted), and a held D is one press (useLetterKeys `once`).
 * - **Not this one waits for the Undo to leave.** `discardAngle` deletes and
 *   `archiveRiff` overwrites, and neither has an inverse, so a set-aside
 *   hides the row here and the write goes out when the Undo leaves: the next
 *   set-aside, a Draft, a capture, `UNDO_MS` of quiet, leaving the page, or
 *   closing the tab. Closing the tab sends an archive through the keepalive
 *   route (/api/riffs/archive), as the browser may cancel an ordinary
 *   request as the page dies. There is no keepalive route for a discard: a
 *   discard lost that way leaves the idea on the page, which is the safe way
 *   to lose it.
 */

/** How long a set-aside can be undone before it is written. */
export const UNDO_MS = 7000

/** A set-aside not written yet: one idea, or a whole source. */
export type Aside =
  | { kind: "idea"; row: IdeaRow; at: number }
  | { kind: "source"; riff: Riff; at: number }

/** The foot's sentence while it lasts, in the KeyBar's place. */
export type Notice =
  | { kind: "aside"; aside: Aside }
  | { kind: "drafted"; title: string; fellBack: boolean }
  | { kind: "failed"; message: string }

export type DraftRefusal = Extract<DraftAngleResult, { ok: false }> | { ok: false; message: string; reason?: undefined }

function without<T>(set: ReadonlySet<T>, value: T) {
  const next = new Set(set)
  next.delete(value)
  return next
}

export function useIdeas(fromServer: readonly Riff[]) {
  const router = useRouter()
  const announce = useAnnounce()

  const [gone, setGone] = React.useState<ReadonlySet<string>>(() => new Set())
  const [filters, setFilters] = React.useState<IdeaFilters>(NO_FILTERS)
  const [param, setParam] = useQueryState("idea", parseAsString)
  const [pending, setPending] = React.useState<ReadonlySet<string>>(() => new Set())
  const [refusals, setRefusals] = React.useState<ReadonlyMap<string, DraftRefusal>>(() => new Map())
  const [notice, setNotice] = React.useState<Notice | null>(null)

  const rows = React.useMemo(() => ideaRows(fromServer, gone), [fromServer, gone])
  const shown = React.useMemo(() => rows.filter((r) => matches(r, filters)), [rows, filters])

  /**
   * The open row: what `?idea=` names, kept while a filter hides it (the
   * detail keeps showing what you were reading) and dropped only when it is
   * gone. With nothing named, the first open row (newest first).
   */
  const selected = React.useMemo(() => {
    if (param) {
      const exact = rows.find((r) => r.key === param)
      if (exact) return exact
      const riff = rows.find((r) => r.riff.id === param)?.riff
      if (riff) {
        const pick = pickAngle(riff)
        return rows.find((r) => r.key === (pick?.id ?? param)) ?? rows.find((r) => r.riff.id === param) ?? null
      }
    }
    // From every row, not the view: a search or a filter does not change
    // what you were reading.
    return rows.find(isOpen) ?? rows[0] ?? null
  }, [param, rows])

  const select = React.useCallback(
    (key: string | null) => {
      void setParam(key)
    },
    [setParam]
  )

  /** The row after `row` in the view, else the one before: where the queue continues. */
  const neighbour = React.useCallback(
    (row: IdeaRow) => {
      const i = shown.findIndex((r) => r.key === row.key)
      const rest = shown.filter((r) => r.key !== row.key)
      return (i < 0 ? null : (rest[i] ?? rest[i - 1])) ?? rest[0] ?? null
    },
    [shown]
  )

  /* ── Set aside, and its Undo ─────────────────────────────────────────── */

  const pendingAside = React.useRef<Aside | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopTimer = React.useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  /** The write itself. A refusal or a throw brings the row back and says so. */
  const write = React.useCallback(
    (aside: Aside) => {
      const key = aside.kind === "idea" ? aside.row.key : aside.riff.id
      const request =
        aside.kind === "idea" ? discardAngle({ angleId: aside.row.key }) : archiveRiff({ riffId: aside.riff.id })
      request
        .then((result) => {
          if (!result.ok) throw new Error(result.message)
          router.refresh()
        })
        .catch((error: unknown) => {
          console.error(error)
          setGone((g) => without(g, key))
          const message = "That didn't go through. It's back in the list."
          setNotice({ kind: "failed", message })
          announce(message)
          router.refresh()
        })
    },
    [router, announce]
  )

  /** The Undo leaves: write what it was holding. Called at the top of every other verb. */
  const settle = React.useCallback(() => {
    stopTimer()
    const aside = pendingAside.current
    pendingAside.current = null
    if (aside) write(aside)
    setNotice(null)
  }, [stopTimer, write])

  // Leaving the page is the last moment to write it. Within the app the
  // screen unmounts with the page still alive, so the server action is safe;
  // a closing tab is not, so pagehide uses the keepalive route for an archive.
  React.useEffect(() => {
    const onPageHide = () => {
      const aside = pendingAside.current
      if (!aside) return
      pendingAside.current = null
      if (aside.kind === "source") {
        void fetch("/api/riffs/archive", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ riffId: aside.riff.id }),
        }).catch(() => {})
      } else {
        // Best effort: if the browser cancels it, the idea is simply still there.
        void discardAngle({ angleId: aside.row.key }).catch(() => {})
      }
    }
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("pagehide", onPageHide)
      if (timer.current != null) clearTimeout(timer.current)
      timer.current = null
      const aside = pendingAside.current
      pendingAside.current = null
      if (!aside) return
      if (aside.kind === "idea") void discardAngle({ angleId: aside.row.key }).catch(() => {})
      else void archiveRiff({ riffId: aside.riff.id }).catch(() => {})
    }
  }, [])

  /**
   * Not this one. An idea row sets aside the idea; a row with no idea (being
   * read, failed, emptied) sets aside its whole source, as `setAsideSource`.
   * Returns the row that opens next, so the page can move focus to it.
   */
  const setAside = React.useCallback(
    (row: IdeaRow): IdeaRow | null => {
      if (row.status === "drafted") return null
      settle()
      const aside: Aside = row.angle
        ? { kind: "idea", row, at: Date.now() }
        : { kind: "source", riff: row.riff, at: Date.now() }
      const key = row.angle ? row.key : row.riff.id
      const next = neighbour(row)
      pendingAside.current = aside
      timer.current = setTimeout(() => {
        timer.current = null
        if (pendingAside.current === aside) settle()
      }, UNDO_MS)
      setGone((g) => new Set(g).add(key))
      setNotice({ kind: "aside", aside })
      announce(`${asideSentence(aside)} Press U to undo.`)
      select(next?.key ?? null)
      return next
    },
    [settle, neighbour, announce, select]
  )

  /** Dismiss the whole source the open idea came from (every idea in it). */
  const setAsideSource = React.useCallback(
    (riff: Riff): IdeaRow | null => {
      settle()
      const aside: Aside = { kind: "source", riff, at: Date.now() }
      const first = rows.find((r) => r.riff.id === riff.id)
      const rest = shown.filter((r) => r.riff.id !== riff.id)
      const at = first ? shown.findIndex((r) => r.key === first.key) : -1
      const next = (at >= 0 ? (rest[at] ?? rest[at - 1]) : rest[0]) ?? null
      pendingAside.current = aside
      timer.current = setTimeout(() => {
        timer.current = null
        if (pendingAside.current === aside) settle()
      }, UNDO_MS)
      setGone((g) => new Set(g).add(riff.id))
      setNotice({ kind: "aside", aside })
      announce(`${asideSentence(aside)} Press U to undo.`)
      select(next?.key ?? null)
      return next
    },
    [settle, rows, shown, announce, select]
  )

  /** Undo the set-aside the foot is holding. Returns the key it reopened. */
  const undo = React.useCallback((): string | null => {
    const aside = pendingAside.current
    if (!aside) return null
    stopTimer()
    pendingAside.current = null
    const key = aside.kind === "idea" ? aside.row.key : aside.riff.id
    setGone((g) => without(g, key))
    setNotice(null)
    announce("Back in the list.")
    select(key)
    return key
  }, [stopTimer, announce, select])

  /* ── Draft ───────────────────────────────────────────────────────────── */

  // A pending idea stays pending until the page reads it back drafted (or
  // it is gone): between the action's answer and the refresh, a second
  // press would draft twice. Derived, so it lets go the moment the row does.
  const pendingNow = React.useMemo(
    () => new Set([...pending].filter((k) => rows.some((r) => r.key === k && r.status !== "drafted"))),
    [pending, rows]
  )

  /**
   * After a Draft lands: if the open view no longer shows drafted ideas, the
   * next row opens and takes focus, so the pressed button leaving does not
   * drop focus to the page (workspace.md, "Focus after an action").
   */
  const drafted = React.useRef<{ key: string; at: number } | null>(null)
  const [moved, setMoved] = React.useState<{ key: string } | null>(null)
  React.useEffect(() => {
    const d = drafted.current
    if (!d) return
    const row = rows.find((r) => r.key === d.key)
    if (row && row.status !== "drafted") return
    drafted.current = null
    if (selected?.key !== d.key || shown.some((r) => r.key === d.key)) return
    const next = shown[Math.min(Math.max(d.at, 0), shown.length - 1)]
    if (!next) return
    select(next.key)
    setMoved({ key: next.key })
  }, [rows, shown, selected, select])

  const draft = React.useCallback(
    async (row: IdeaRow) => {
      if (!row.angle || row.status === "drafted" || pendingNow.has(row.key)) return
      settle()
      const key = row.key
      setPending((p) => new Set(p).add(key))
      setRefusals((m) => {
        if (!m.has(key)) return m
        const next = new Map(m)
        next.delete(key)
        return next
      })
      const refuse = (refusal: DraftRefusal) => {
        setPending((p) => without(p, key))
        setRefusals((m) => new Map(m).set(key, refusal))
        announce(refusal.message)
      }
      let result: DraftAngleResult
      try {
        result = await draftAngle({ angleId: key })
      } catch {
        return refuse({ ok: false, message: "That didn't go through. Nothing was drafted." })
      }
      if (!result.ok) return refuse(result)
      const fellBack = !result.written
      setNotice({ kind: "drafted", title: row.title, fellBack })
      announce(
        fellBack
          ? `Drafted “${row.title}”, but only the hook came out. Write the rest in Drafts.`
          : `Drafted “${row.title}”. It waits in Drafts.`
      )
      // Where it stood, so the queue can carry on from there once the page
      // reads it back drafted and the Open view lets it go.
      drafted.current = { key, at: shown.findIndex((r) => r.key === key) }
      router.refresh()
    },
    [pendingNow, settle, announce, router, shown]
  )

  const setFilter = React.useCallback(<K extends keyof IdeaFilters>(key: K, value: IdeaFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }))
  }, [])

  const clearFilters = React.useCallback(() => setFilters((f) => ({ ...NO_FILTERS, status: f.status })), [])
  const showOpen = React.useCallback(() => setFilters(NO_FILTERS), [])

  return {
    rows,
    shown,
    filters,
    setFilter,
    clearFilters,
    showOpen,
    selected,
    select,
    pending: pendingNow as ReadonlySet<string>,
    refusals,
    notice,
    dismissNotice: () => setNotice(null),
    draft,
    /** The row opened after a Draft took the open one out of view; the page moves focus to it. */
    moved,
    setAside,
    setAsideSource,
    undo,
    /** For a verb outside this hook (a capture, an ask): the Undo leaves first. */
    settle,
  }
}

export type IdeasState = ReturnType<typeof useIdeas>

/** "Set aside “…”." or "Dismissed the ideas from your voice note (today)." Past tense, names the thing. */
export function asideSentence(aside: Aside) {
  return aside.kind === "idea" ? `Set aside “${aside.row.title}”.` : dismissedSentence(aside.riff)
}
