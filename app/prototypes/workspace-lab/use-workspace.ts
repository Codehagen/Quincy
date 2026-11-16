"use client"

import * as React from "react"

import { pickAngle } from "@/components/quincy"

import { LAB_RIFFS, NO_FILTERS, matches, rowsFor, type Filters, type Row } from "./data"

/**
 * One store for the whole lab: the three layouts, the desktop frame and the
 * phone are windows onto the same ideas, so a Draft pressed in one shows in
 * the next. Every action is local; nothing calls a server action, nothing
 * spends. Draft answers after a short wait, as the real one does.
 */

const DRAFT_MS = 700

export type Workspace = {
  rows: Row[]
  /** The rows the filters and the search leave. */
  shown: Row[]
  filters: Filters
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  clearFilters: () => void
  selected: Row | null
  select: (id: string | null) => void
  /** Ideas whose Draft is on its way. */
  pending: ReadonlySet<string>
  /**
   * The three verbs. `from` is the element the action came from (a button in
   * the detail, a row): if the action takes that element away (the button
   * unmounts, the row leaves the view), focus goes to the open row inside
   * the same `[data-letter-keys]` window instead of falling to the body.
   */
  draft: (row: Row, from?: Element | null) => void
  drop: (row: Row, from?: Element | null) => void
  toggleLater: (row: Row, from?: Element | null) => void
  /** The last idea set aside with Not this one, for one Undo. */
  lastDropped: Row | null
  undoDrop: () => void
  reset: () => void
}

function add(s: ReadonlySet<string>, id: string) {
  return new Set(s).add(id)
}
function remove(s: ReadonlySet<string>, id: string) {
  const n = new Set(s)
  n.delete(id)
  return n
}

export function useWorkspace(): Workspace {
  const [drafted, setDrafted] = React.useState<ReadonlySet<string>>(() => new Set())
  const [dropped, setDropped] = React.useState<ReadonlySet<string>>(() => new Set())
  const [later, setLater] = React.useState<ReadonlySet<string>>(() => new Set())
  const [pending, setPending] = React.useState<ReadonlySet<string>>(() => new Set())
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS)
  const [lastDropped, setLastDropped] = React.useState<Row | null>(null)
  // Quincy's pick opens first (pickAngle on the newest source), as RiffCard does.
  const [selectedId, setSelectedId] = React.useState<string | null>(() => pickAngle(LAB_RIFFS[0]!)?.id ?? null)

  const rows = React.useMemo(() => rowsFor(LAB_RIFFS, { drafted, dropped, later }), [drafted, dropped, later])
  const shown = React.useMemo(() => rows.filter((r) => matches(r, filters)), [rows, filters])
  // The selection survives a filter that hides it (the detail keeps showing
  // what you were reading), but not a drop.
  const selected = rows.find((r) => r.id === selectedId) ?? null

  const neighbour = React.useCallback(
    (row: Row) => {
      const i = shown.findIndex((r) => r.id === row.id)
      return shown[i + 1] ?? shown[i - 1] ?? null
    },
    [shown]
  )

  // Draft answers after a wait, so its completion reads the store as it is
  // then, not as it was when D was pressed.
  const now = React.useRef({ shown, filters, selectedId })
  React.useLayoutEffect(() => {
    now.current = { shown, filters, selectedId }
  })

  // Focus to restore after an action that took the focused element away.
  // Read after the commit that removed it, when the body has the focus.
  const refocus = React.useRef<Element | null>(null)
  const askRefocus = React.useCallback((from?: Element | null) => {
    if (from) refocus.current = from.closest("[data-letter-keys]") ?? from.ownerDocument.body
  }, [])
  React.useEffect(() => {
    const scope = refocus.current
    if (!scope) return
    refocus.current = null
    const active = scope.ownerDocument.activeElement
    if (active && active !== scope.ownerDocument.body) return
    const row = selectedId ? scope.querySelector<HTMLElement>(`[data-ws-row="${CSS.escape(selectedId)}"]`) : null
    row?.focus()
  })

  const draft = React.useCallback(
    (row: Row, from?: Element | null) => {
      if (!row.angle || row.status === "drafted") return
      const id = row.id
      setPending((s) => add(s, id))
      setTimeout(() => {
        const { shown: list, filters: f, selectedId: sel } = now.current
        setPending((s) => remove(s, id))
        setDrafted((s) => add(s, id))
        setLater((s) => remove(s, id))
        // Drafted leaves Open and Later, so the next row opens, as after
        // Not this one; j then carries on from here instead of from the top.
        if (sel === id && (f.status === "open" || f.status === "later")) {
          const i = list.findIndex((r) => r.id === id)
          setSelectedId((i < 0 ? null : (list[i + 1] ?? list[i - 1])?.id) ?? null)
        }
        askRefocus(from)
      }, DRAFT_MS)
    },
    [askRefocus]
  )

  const drop = React.useCallback(
    (row: Row, from?: Element | null) => {
      if (!row.angle || row.status === "drafted") return
      const next = neighbour(row)
      setDropped((s) => add(s, row.id))
      setLastDropped(row)
      if (selectedId === row.id) setSelectedId(next?.id ?? null)
      askRefocus(from)
    },
    [neighbour, selectedId, askRefocus]
  )

  const undoDrop = React.useCallback(() => {
    setLastDropped((last) => {
      if (last) {
        setDropped((s) => remove(s, last.id))
        setSelectedId(last.id)
      }
      return null
    })
  }, [])

  const toggleLater = React.useCallback(
    (row: Row, from?: Element | null) => {
      if (!row.angle || row.status === "drafted") return
      const leaving = row.status === "later" ? filters.status === "later" : filters.status === "open"
      setLater((s) => (s.has(row.id) ? remove(s, row.id) : add(s, row.id)))
      // Out of the current view, so the next row opens, as after Not this one.
      if (leaving && selectedId === row.id) setSelectedId(neighbour(row)?.id ?? null)
      askRefocus(from)
    },
    [filters.status, neighbour, selectedId, askRefocus]
  )

  const setFilter = React.useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }))
  }, [])

  const reset = React.useCallback(() => {
    setDrafted(new Set())
    setDropped(new Set())
    setLater(new Set())
    setPending(new Set())
    setFilters(NO_FILTERS)
    setLastDropped(null)
    setSelectedId(pickAngle(LAB_RIFFS[0]!)?.id ?? null)
  }, [])

  return {
    rows,
    shown,
    filters,
    setFilter,
    clearFilters: () => setFilters((f) => ({ ...NO_FILTERS, status: f.status })),
    selected,
    select: setSelectedId,
    pending,
    draft,
    drop,
    toggleLater,
    lastDropped,
    undoDrop,
    reset,
  }
}

/**
 * The page's keys: j / k (and ↓ / ↑ outside a list) move, D drafts, N sets
 * aside, L puts off, U undoes the last set-aside, / goes to search, Escape
 * leaves it. Ignored in a text field, with a modifier held, or inside an
 * open menu. Bound to the document, so only one window of the store (the
 * desktop frame) passes `enabled`.
 *
 * Heard in the capture phase, and a handled key goes no further: with focus
 * on a row, the Listbox's typeahead would otherwise take N, D, L or U as
 * the first letter of a title and move to another idea before the action
 * ran; and the app's bare D (theme, components/theme-provider.tsx) would
 * flip the theme on every Draft.
 */
const HANDLED = new Set(["j", "k", "/", "d", "n", "l", "u"])

export function useWorkspaceKeys(
  ws: Workspace,
  {
    enabled,
    searchRef,
    rowSelector = "[data-ws-row]",
  }: { enabled: boolean; searchRef: React.RefObject<HTMLInputElement | null>; rowSelector?: string }
) {
  // Read through a ref so the listener binds once and never sees a stale store.
  const live = React.useRef(ws)
  React.useLayoutEffect(() => {
    live.current = ws
  })

  // Where the open row last stood in the view. When it leaves (drafted,
  // put off, filtered out), j and k carry on from there, not from the top.
  const lastAt = React.useRef(0)
  React.useLayoutEffect(() => {
    const i = ws.shown.findIndex((r) => r.id === ws.selected?.id)
    if (i >= 0) lastAt.current = i
  })

  React.useEffect(() => {
    if (!enabled) return
    function move(by: number) {
      const w = live.current
      if (w.shown.length === 0) return
      const i = w.shown.findIndex((r) => r.id === w.selected?.id)
      // Gone from the view: the row now at its old place is the next one down.
      const to = i >= 0 ? i + by : by > 0 ? lastAt.current : lastAt.current - 1
      const next = w.shown[Math.min(w.shown.length - 1, Math.max(0, to))]!
      w.select(next.id)
      // Follow with focus when focus is already on a row, so arrow keys and
      // j/k agree about where you are; otherwise only keep it in view.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`${rowSelector}[data-ws-row="${CSS.escape(next.id)}"]`)
        if (!el) return
        if (document.activeElement?.closest(rowSelector)) el.focus({ preventScroll: true })
        el.scrollIntoView({ block: "nearest" })
      })
    }
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (e.key === "Escape" && t === searchRef.current) {
        searchRef.current?.blur()
        return
      }
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      if (t?.closest('[role="menu"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const w = live.current
      const row = w.selected
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (!HANDLED.has(key)) return
      e.preventDefault()
      e.stopPropagation()
      // The element the key came from, so focus can follow if the action takes it away.
      const from = t && t !== t.ownerDocument.body ? t : null
      switch (key) {
        case "j":
          return move(1)
        case "k":
          return move(-1)
        case "/":
          return searchRef.current?.focus()
        case "d":
          if (row) w.draft(row, from)
          return
        case "n":
          if (row) w.drop(row, from)
          return
        case "l":
          if (row) w.toggleLater(row, from)
          return
        case "u":
          return w.undoDrop()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [enabled, searchRef, rowSelector])
}
