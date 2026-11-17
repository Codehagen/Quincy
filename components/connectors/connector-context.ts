"use client"

import * as React from "react"

import type { Connector as ConnectorData } from "@/lib/connectors"

/** What every Connector part reads: the connector, whether it holds the ink, how to open it. */
type ConnectorContextValue = {
  connector: ConnectorData
  /** This connector's verb is the page's one ink pill. */
  isAction: boolean
  /** Opens the connector (the fold's sheet). Absent where it is already open. */
  onOpen?: () => void
}

export const ConnectorContext = React.createContext<ConnectorContextValue | null>(null)

export function useConnector(): ConnectorContextValue {
  const ctx = React.useContext(ConnectorContext)
  if (!ctx) throw new Error("Connector parts must sit inside <Connector>.")
  return ctx
}

