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
  // Reading and its number belong to a connector that reads; one that
  // stopped or is half set up shows its fix instead.
  const reads = c.status.s === "connected" || c.status.s === "waiting" || c.status.s === "paused"

  return (
    <div className="flex flex-col gap-kit-group">
      {showHead ? (
        <div className="flex items-center gap-kit-related">
          <Glyph c={c} />
          <div className="flex min-w-0 flex-col">
            <Text weight="strong">{c.name}</Text>
            <Text variant="small" tone="muted">
              {c.line}
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

      {c.setup && !connected && c.status.s !== "builtin" ? (
        <Text variant="small" tone="muted">
          What it takes: {c.setup}.
        </Text>
      ) : null}

      {c.metric && reads ? (
        <Well>
          <MetricRow m={c.metric} />
        </Well>
      ) : null}

      {c.reading && reads ? (
        // The switch beside its own words, so the "proposed" tag sits with
        // the label it qualifies rather than on a line of its own.
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-kit-related select-none">
          <span className="flex min-w-0 items-center gap-kit-controls text-kit-body text-kit-ink">
            {c.reading.label}
            {!c.reading.real ? <Proposed show={show} why={c.reading.ref} /> : null}
          </span>
          <Switch
            aria-label={`${c.reading.label}: ${c.name}`}
            checked={c.reading.on}
            onCheckedChange={(on) => store.toggleReading(c.id, on)}
          />
        </label>
      ) : null}

      {more.length > 0 && (connected || c.status.s === "builtin" || c.status.s === "soon") ? (
        // The verbs as quiet pills side by side: one left edge with the text
        // above (a ghost button's padding pushed its label off it). Separated
        // from the reading by a hairline, which divides; it does not lift.
        <div className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">
          <div className="flex flex-wrap items-center gap-kit-controls">
            {more.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-kit-controls">
                <Button size="sm">{a.label}</Button>
                {!a.real ? <Proposed show={show} why={a.ref} /> : null}
              </span>
            ))}
          </div>
          {opts.wiring === "on" ? (
            <ul className="flex flex-col gap-0.5 font-kit-mono text-kit-mono-sm text-kit-ink-muted">
              {more.map((a) => (
                <li key={a.id} className="truncate">
                  {a.label}: {a.ref}
                </li>
              ))}
            </ul>
          ) : null}
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
