"use client"

import * as React from "react"

import { Tag, Tags } from "@/components/kit"
import { heldLine, isConnected, isReading, isReady, needsYou, type Connector as ConnectorData } from "@/lib/connectors"

import { Connector } from "./connector"
import { useConnector } from "./connector-context"

/**
 * The fold's card (under 900px of workspace, and on a phone): the lab's
 * Grid, kept as the Table's fold.
 *
 * Top: the 36 tile, the name and what it does; at the end, the one verb
 * when it is ready to connect, else the state. Middle: a recess with what
 * it hands over (or, when it needs you, why, in ink), then its number or
 * its chips. Foot, under a hairline: the newest fact, and the fix when it
 * needs you.
 *
 * The name is the card's one button: it opens the sheet with every verb.
 * Its hit area is stretched over the card, and the card draws the focus
 * ring while the name has focus. The verbs sit above that layer.
 */
export function ConnectorCard({
  connector: c,
  isAction,
  onOpen,
}: {
  connector: ConnectorData
  isAction: boolean
  onOpen: (id: string) => void
}) {
  const open = React.useCallback(() => onOpen(c.id), [onOpen, c.id])
  const nameId = `connector-${c.id}-name`
  return (
    <Connector value={c} isAction={isAction} onOpen={open}>
      <article
        aria-labelledby={nameId}
        className="relative flex flex-col gap-kit-related rounded-kit-control bg-kit-object p-kit-group shadow-kit-inset has-[[data-card-open]:focus-visible]:outline-2 has-[[data-card-open]:focus-visible]:outline-offset-2 has-[[data-card-open]:focus-visible]:outline-kit-focus has-[[data-card-open]:focus-visible]:outline-solid"
      >
        <div className="flex items-start gap-kit-related">
          <Connector.Icon variant="tile" />
          <div className="flex min-w-0 flex-1 flex-col pt-px">
            <h3 className="min-w-0">
              <button
                type="button"
                id={nameId}
                data-card-open=""
                onClick={open}
                className="max-w-full cursor-pointer truncate text-left text-kit-body font-kit-strong text-kit-ink outline-hidden after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
              >
                {c.name}
              </button>
            </h3>
            <p className="truncate text-kit-small text-kit-ink-muted">{c.line}</p>
          </div>
          <div className="relative z-[1] flex shrink-0 items-center gap-kit-controls">
            {isReady(c) ? <Connector.Primary size="sm" aria-describedby={nameId} /> : <StateChip />}
          </div>
        </div>

        <Recess />

        <div className="relative z-[1] mt-auto flex min-h-kit-control-sm items-center justify-between gap-kit-related border-t border-kit-hairline pt-kit-related">
          <span className="min-w-0 truncate text-kit-small text-kit-ink-muted tabular-nums">
            {heldLine(c) ?? <Connector.Latest />}
          </span>
          {needsYou(c) ? <Connector.Primary size="sm" aria-describedby={nameId} /> : null}
        </div>
      </article>
    </Connector>
  )
}

/** Connected is the word on the quiet grey, no dot (a connection is permission); the rest are the State part. */
function StateChip() {
  const { connector: c } = useConnector()
  if (c.status.s === "connected") {
    return (
      <span className="inline-flex h-6 items-center rounded-full bg-kit-well px-2.5 text-kit-meta whitespace-nowrap text-kit-ink-muted">
        Connected
      </span>
    )
  }
  return (
    <span className="inline-flex h-6 items-center">
      <Connector.State />
    </span>
  )
}

/** What it hands over, or why it needs you; then the number, or the chips. */
function Recess() {
  const { connector: c } = useConnector()
  const interrupts = needsYou(c)
  const st = c.status
  const why = st.s === "setup" ? st.step : st.s === "failed" || st.s === "reauth" || st.s === "asks" ? st.why : null
  return (
    <div className="flex flex-col gap-kit-related rounded-kit-control-inner bg-kit-well px-kit-recess py-kit-recess-y">
      {interrupts ? (
        <p className="line-clamp-2 min-h-[2lh] text-kit-small text-pretty text-kit-ink">
          {why}
        </p>
      ) : (
        <p className="line-clamp-2 min-h-[2lh] text-kit-small text-pretty text-kit-ink-muted">{c.gives}</p>
      )}
      {isReading(c) && c.metric ? (
        <Connector.Metric />
      ) : !isConnected(c) && c.tags.length > 0 ? (
        <Tags>
          {c.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </Tags>
      ) : null}
    </div>
  )
}
