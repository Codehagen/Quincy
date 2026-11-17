"use client"

import * as React from "react"

import { Text, Well } from "@/components/kit"
import { isConnected, isReading, type Connector as ConnectorData } from "@/lib/connectors"

import { Connector } from "./connector"

export type ConnectorPaneProps = {
  connector: ConnectorData
  /** This connector's verb is the page's one ink pill. */
  isAction: boolean
  /**
   * `pane`: the table's pane, which draws its own head (the 36 tile, the
   * name and what it does). `sheet`: the fold's sheet, whose title is the
   * name already, so the head is left out.
   */
  variant?: "pane" | "sheet"
}

/**
 * Everything about one connector: the table's pane and the fold's sheet.
 * The state as a sentence with its one verb, what it hands over, what
 * connecting takes, its one number against the usual, then every verb it
 * has. Disconnect is a hold, last, away from the rest (removing.md).
 *
 * A connector that stopped, is half set up or asks you something shows its
 * sentence in ink and its fix, never its number.
 */
export function ConnectorPane({ connector: c, isAction, variant = "pane" }: ConnectorPaneProps) {
  const connected = isConnected(c)
  return (
    <Connector value={c} isAction={isAction}>
      <div className="flex flex-col gap-kit-group">
        {variant === "pane" ? (
          <div className="flex items-center gap-kit-related">
            <Connector.Icon variant="tile" />
            <div className="flex min-w-0 flex-col">
              <Connector.Name />
              <Connector.Line />
            </div>
          </div>
        ) : null}

        {/* The state, where the action is (states.md). */}
        <div className="flex flex-col items-start gap-kit-related">
          <Connector.Sentence />
          <Connector.Primary />
        </div>

        <Text tone="muted">{c.gives}</Text>

        {!connected && c.status.s !== "builtin" ? (
          <Text variant="small" tone="muted">
            What it takes: {c.setup}.
          </Text>
        ) : null}

        {c.metric && isReading(c) ? (
          <Well>
            <Connector.Metric />
          </Well>
        ) : null}

        <Connector.Verbs />
      </div>
    </Connector>
  )
}
