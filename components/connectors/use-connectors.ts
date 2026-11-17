"use client"

import * as React from "react"

import { useControllable } from "@/components/kit/use-controllable"
import {
  actionOwner,
  countConnectors,
  fallbackOpen,
  groupConnectors,
  matches,
  ordered,
  type Connector,
  type ConnectorCounts,
  type ConnectorFilter,
  type ConnectorId,
} from "@/lib/connectors"

export type OpenConnectorState = {
  /** The open connector's id (controlled). `null` means "the default row". */
  value?: ConnectorId | null
  /** The open connector at first (uncontrolled), e.g. from `?open=`. */
  defaultValue?: ConnectorId | null
  onValueChange?: (id: ConnectorId | null) => void
}

export type ConnectorsStore = {
  all: readonly Connector[]
  /** What the filter and the search leave, in the page's order. */
  shown: readonly Connector[]
  groups: ReturnType<typeof groupConnectors>
  filter: ConnectorFilter
  setFilter: (f: ConnectorFilter) => void
  q: string
  setQ: (q: string) => void
  counts: ConnectorCounts
  /** The connector that holds the page's one ink pill, or null. */
  owner: ConnectorId | null
  /** The open row: the one picked if it is shown, else the ink's, else the first. */
  openId: ConnectorId | null
  open: Connector | null
  select: (id: ConnectorId | null) => void
}

/**
 * The page's one store: the filter, the search and the open connector, over
 * the rows the server read. Nothing here calls the server; the verbs do,
 * and the page re-reads after them.
 */
export function useConnectors(
  all: readonly Connector[],
  { value, defaultValue = null, onValueChange, defaultFilter = "all" }: OpenConnectorState & { defaultFilter?: ConnectorFilter }
): ConnectorsStore {
  const [filter, setFilter] = React.useState<ConnectorFilter>(defaultFilter)
  const [q, setQ] = React.useState("")
  const [picked, select] = useControllable<ConnectorId | null>(value, defaultValue, onValueChange)

  const shown = React.useMemo(() => ordered(all.filter((c) => matches(c, filter, q))), [all, filter, q])
  const groups = React.useMemo(() => groupConnectors(shown), [shown])
  const flat = React.useMemo(() => groups.flatMap((g) => g.items), [groups])
  const owner = React.useMemo(() => actionOwner(all), [all])
  const counts = React.useMemo(() => countConnectors(all), [all])

  const openId = picked && flat.some((c) => c.id === picked) ? picked : fallbackOpen(flat, owner)
  const open = all.find((c) => c.id === openId) ?? null

  return { all, shown: flat, groups, filter, setFilter, q, setQ, counts, owner, openId, open, select }
}
