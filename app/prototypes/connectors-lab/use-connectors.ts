"use client"

import * as React from "react"

import { connectorsFor, matches, rank, type Connector, type Filter, type Scenario, type Status } from "./data"

/**
 * One local store for both directions, so a Connect in the grid shows in the
 * table. Nothing here calls the server: each verb stands in for the real
 * action named in data.ts, with a short wait so pending labels show.
 */

export type ConnectorsStore = {
  phase: "loading" | "live"
  all: Connector[]
  shown: Connector[]
  filter: Filter
  setFilter: (f: Filter) => void
  q: string
  setQ: (q: string) => void
  counts: Record<Filter, number> & { later: number; ready: number }
  selectedId: string | null
  select: (id: string | null) => void
  pending: string | null
  /** The card's main verb: Connect, Install again, Reconnect, Finish setup. */
  primary: (id: string) => void
  disconnect: (id: string) => Promise<void>
  toggleReading: (id: string, on: boolean) => void
  reset: () => void
}

/** What a connector says right after it connects, per id. */
function connectedNow(c: Connector): Status {
  if (c.kind === "channel") return { s: "connected", last: "Connected just now" }
  if (c.id === "x-posts") return { s: "connected", last: "Read just now" }
  if (c.id === "x-bookmarks") return { s: "connected", last: "Reads daily at 12:00" }
  return { s: "waiting", since: "just now" }
}

export function useConnectors(scenario: Scenario): ConnectorsStore {
  const [all, setAll] = React.useState(() => connectorsFor(scenario))
  const [filter, setFilter] = React.useState<Filter>("all")
  const [q, setQ] = React.useState("")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)

  // A new scenario is a new account: reset everything it shaped.
  const [seen, setSeen] = React.useState(scenario)
  if (seen !== scenario) {
    setSeen(scenario)
    setAll(connectorsFor(scenario))
    setPending(null)
  }

  const update = React.useCallback((fn: (list: Connector[]) => Connector[]) => setAll((l) => fn(l)), [])

  const wait = (id: string, then: () => void) => {
    setPending(id)
    window.setTimeout(() => {
      then()
      setPending(null)
    }, 700)
  }

  const primary = (id: string) => {
    const c = all.find((x) => x.id === id)
    if (!c) return
    // A connector that needs another one connects that one (X, for the read-back and bookmarks).
    const target = c.status.s === "needs" ? c.status.on : id
    wait(id, () =>
      update((list) =>
        list.map((x) => {
          if (x.id === target) return { ...x, status: connectedNow(x) }
          // X connected: what reads it can be connected now.
          if (target === "x" && x.status.s === "needs" && x.status.on === "x") return { ...x, status: { s: "available" } }
          return x
        })
      )
    )
  }

  const disconnect = async (id: string) => {
    await new Promise((r) => window.setTimeout(r, 300))
    update((list) =>
      list.map((x) => {
        if (x.id === id) return { ...x, status: { s: "available" }, metric: undefined }
        if (id === "x" && (x.id === "x-posts" || x.id === "x-bookmarks")) return { ...x, status: { s: "needs", on: "x", onName: "X" }, metric: undefined }
        return x
      })
    )
  }

  const toggleReading = (id: string, on: boolean) =>
    update((list) => list.map((x) => (x.id === id && x.reading ? { ...x, reading: { ...x.reading, on } } : x)))

  const shown = React.useMemo(
    () =>
      all
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => matches(c, filter, q))
        .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
        .map(({ c }) => c),
    [all, filter, q]
  )

  const counts = React.useMemo(() => {
    const n = (f: Filter) => all.filter((c) => matches(c, f, "")).length
    return {
      all: n("all"),
      connected: n("connected"),
      source: n("source"),
      channel: n("channel"),
      later: all.filter((c) => c.status.s === "soon").length,
      ready: all.filter((c) => c.status.s === "available" || c.status.s === "needs").length,
    }
  }, [all])

  return {
    phase: scenario === "loading" ? "loading" : "live",
    all,
    shown,
    filter,
    setFilter,
    q,
    setQ,
    counts,
    selectedId,
    select: setSelectedId,
    pending,
    primary,
    disconnect,
    toggleReading,
    reset: () => {
      setAll(connectorsFor(scenario))
      setFilter("all")
      setQ("")
      setSelectedId(null)
    },
  }
}
