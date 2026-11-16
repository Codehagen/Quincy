"use client"

import * as React from "react"

import { Button, HoldButton, Switch, Text, Well } from "@/components/kit"

import { isConnected, type Connector } from "../data"
import type { LabOptions } from "../lab-options"
import type { ConnectorsStore } from "../use-connectors"
import { MetricRow } from "./metric-row"
import { Glyph, Proposed, primaryLabel, stateSentence } from "./marks"

/**
 * Everything about one connector: the grid's sheet and the table's pane.
 * The state as a sentence, what it hands over, its one number, its switch,
 * and every verb it has, real or proposed. Disconnect is a hold, at the end,
 * away from the rest (removing.md).
 */
export function ConnectorDetail({
  c,
  store,
  opts,
  isAction,
  showHead = true,
}: {
  c: Connector
  store: ConnectorsStore
  opts: LabOptions
  /** This connector's verb is the page's one ink pill right now. */
  isAction: boolean
  /** The pane draws its own head; the sheet's title is the name. */
  showHead?: boolean
}) {
  const show = opts.proposed === "show"
  const connected = isConnected(c)
  const verb = primaryLabel(c)
  const interrupts = c.status.s === "failed" || c.status.s === "reauth" || c.status.s === "setup"
  const more = c.actions.filter((a) => !a.hold && !["connect", "install"].includes(a.id))
  const hold = connected ? c.actions.find((a) => a.hold) : undefined

  return (
    <div className="flex flex-col gap-kit-group">
      {showHead ? (
        <div className="flex items-center gap-kit-related">
          <Glyph c={c} />
          <div className="flex min-w-0 flex-col">
            <Text weight="strong">{c.name}</Text>
            <Text variant="small" tone="muted">
              {c.kind === "source" ? "Source" : "Channel"} · {c.line}
            </Text>
          </div>
        </div>
      ) : null}

      {/* The state, where the action is (states.md): one sentence, ink when it interrupts. */}
      <div role="status" className="flex flex-col gap-kit-related">
        <Text tone={interrupts ? "ink" : "muted"}>{stateSentence(c)}</Text>
        {verb ? (
          <div>
            <Button
              variant={isAction ? "action" : "quiet"}
              pending={store.pending === c.id}
              pendingLabel={c.status.s === "available" ? "Connecting…" : "Working…"}
              onClick={() => store.primary(c.id)}
            >
              {verb}
            </Button>
          </div>
        ) : null}
      </div>

      <Text tone="muted">{c.gives}</Text>

      {c.metric && connected ? (
        <Well>
          <MetricRow m={c.metric} />
        </Well>
      ) : null}

      {c.reading && connected ? (
        <div className="flex flex-col gap-kit-tight">
          <Switch
            label={c.reading.label}
            checked={c.reading.on}
            onCheckedChange={(on) => store.toggleReading(c.id, on)}
          />
          {!c.reading.real ? (
            <span>
              <Proposed show={show} why={c.reading.ref} />
            </span>
          ) : null}
        </div>
      ) : null}

      {more.length > 0 && (connected || c.status.s === "builtin" || c.status.s === "soon") ? (
        <div className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">
          {more.map((a) => (
            <div key={a.id} className="flex items-center gap-kit-controls">
              <Button size="sm" variant="ghost">
                {a.label}
              </Button>
              {!a.real ? <Proposed show={show} why={a.ref} /> : null}
              {show ? <span className="truncate font-kit-mono text-kit-mono-sm text-kit-ink-muted">{a.real ? a.ref : ""}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {hold ? (
        <div className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">
          <Text variant="small" tone="muted">
            {c.kind === "channel"
              ? `Quincy stops publishing to ${c.name}. Drafts for it stay.`
              : `Quincy stops reading ${c.name}. What it already read stays.`}
          </Text>
          <div>
            <HoldButton onConfirm={() => store.disconnect(c.id)} pendingLabel="Disconnecting…" doneLabel="Disconnected">
              {hold.label}
            </HoldButton>
          </div>
        </div>
      ) : null}
    </div>
  )
}
