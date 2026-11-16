"use client"

import * as React from "react"
import { ArrowRight01Icon, MoreVerticalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button, IconButton, Menu, MenuItem, MenuPanel, MenuSeparator, MenuTrigger, Skeleton, Switch, Tag, Tags } from "@/components/kit"

import { isConnected, type Connector } from "../data"
import type { LabOptions } from "../lab-options"
import type { ConnectorsStore } from "../use-connectors"
import { MetricRow } from "./metric-row"
import { Glyph, Proposed, StatusChip, nameId, primaryLabel } from "./marks"

/**
 * The card's surface per frame. In the panel it is a secondary object (the
 * inset ring) at the control radius: 18 minus 20 of padding leaves nothing
 * to derive, so the next radius down keeps the hierarchy, and its well takes
 * the next one again. On the ground it is an object, lifted on its own.
 */
const FRAME = {
  panel: { card: "rounded-kit-control shadow-kit-inset", well: "rounded-kit-control-inner" },
  ground: { card: "rounded-kit-object shadow-kit-object", well: "rounded-kit-control" },
} as const

/**
 * 1 · Grid's card: the reference's card, on the kit.
 *
 * Top: the 36px glyph tile (the kit's, not the reference's 32), the name at
 * 560 and a muted line, and at the end either the state and a ⋮ menu, or the
 * one verb, quiet unless the page's precedence gives it the ink. Middle: a
 * recess (the well) with two lines of what it hands over, then the one
 * number when connected or the chips when not. Foot, under a hairline: the
 * newest fact and the switch, or what connecting costs and a link.
 *
 * The name is the card's one button to open it (the detail sheet). Its hit
 * area is stretched over the card, so the whole card opens it, and the
 * card draws the focus ring when the name has focus. The controls sit
 * above that layer. Tab order: name, then the card's controls.
 */
export function ConnectorCard({
  c,
  store,
  opts,
  isAction,
  onOpen,
}: {
  c: Connector
  store: ConnectorsStore
  opts: LabOptions
  isAction: boolean
  onOpen: (id: string) => void
}) {
  const show = opts.proposed === "show"
  const connected = isConnected(c)
  const verb = primaryLabel(c)
  const st = c.status
  const interrupts = st.s === "failed" || st.s === "reauth" || st.s === "setup"
  const compact = opts.density === "compact"
  const id = nameId(c, "card")
  const more = c.actions.filter((a) => !a.hold && !["connect", "install"].includes(a.id))
  const verbInTop = verb && (st.s === "available" || st.s === "needs")

  return (
    <article
      aria-labelledby={id}
      data-frame={opts.frame}
      className={`cl-card relative flex flex-col bg-kit-object ${FRAME[opts.frame].card} ${compact ? "gap-kit-related p-kit-related" : "gap-kit-related p-kit-group"} has-[[data-card-open]:focus-visible]:outline-2 has-[[data-card-open]:focus-visible]:outline-offset-2 has-[[data-card-open]:focus-visible]:outline-kit-focus has-[[data-card-open]:focus-visible]:outline-solid`}
    >
      <div className="flex items-start gap-kit-related">
        <Glyph c={c} />
        <div className="flex min-w-0 flex-1 flex-col pt-px">
          <h3 className="min-w-0">
            <button
              type="button"
              id={id}
              data-card-open=""
              onClick={() => onOpen(c.id)}
              className="max-w-full cursor-pointer truncate text-left text-kit-body font-kit-strong text-kit-ink outline-hidden after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
            >
              {c.name}
            </button>
          </h3>
          <p className="truncate text-kit-small text-kit-ink-muted">
            {c.line}
          </p>
        </div>
        <div className="relative z-[1] flex shrink-0 items-center gap-kit-controls">
          {verbInTop ? (
            <Button
              size="sm"
              variant={isAction ? "action" : "quiet"}
              pending={store.pending === c.id}
              pendingLabel="Connecting…"
              onClick={() => store.primary(c.id)}
              aria-describedby={id}
            >
              {verb}
            </Button>
          ) : (
            <>
              <StatusChip c={c} opts={opts} />
              {connected ? (
                <Menu>
                  <MenuTrigger render={<IconButton icon={MoreVerticalIcon} aria-label={`More for ${c.name}`} />} />
                  <MenuPanel align="end">
                    <MenuItem onClick={() => onOpen(c.id)}>Open</MenuItem>
                    {more.map((a) => (
                      <MenuItem key={a.id}>
                        <span className="flex items-center gap-kit-controls">
                          {a.label}
                          {!a.real ? <Proposed show={show} why={a.ref} /> : null}
                        </span>
                      </MenuItem>
                    ))}
                    <MenuSeparator />
                    <MenuItem onClick={() => onOpen(c.id)}>Disconnect…</MenuItem>
                  </MenuPanel>
                </Menu>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* The recess: what it hands over, then the number or the chips. A
          card that stopped says why here instead, in ink (states.md). */}
      <div className={`flex flex-col gap-kit-related bg-kit-well px-kit-recess py-kit-recess-y ${FRAME[opts.frame].well}`}>
        {interrupts ? (
          <p role="status" className="line-clamp-2 min-h-[2lh] text-kit-small text-pretty text-kit-ink">
            {st.s === "setup" ? st.step : st.s === "failed" || st.s === "reauth" ? st.why : null}
          </p>
        ) : (
          <p className="line-clamp-2 min-h-[2lh] text-kit-small text-pretty text-kit-ink-muted">{c.gives}</p>
        )}
        {connected && opts.metric === "on" && c.metric && !interrupts ? (
          <MetricRow m={c.metric} />
        ) : !connected && opts.tags === "on" && c.tags ? (
          <Tags>
            {c.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </Tags>
        ) : null}
      </div>

      <div className="relative z-[1] mt-auto flex min-h-kit-control-sm items-center justify-between gap-kit-related border-t border-kit-hairline pt-kit-related">
        <Foot c={c} store={store} opts={opts} isAction={isAction} onOpen={onOpen} />
      </div>
    </article>
  )
}

function Foot({
  c,
  store,
  opts,
  isAction,
  onOpen,
}: {
  c: Connector
  store: ConnectorsStore
  opts: LabOptions
  isAction: boolean
  onOpen: (id: string) => void
}) {
  const show = opts.proposed === "show"
  const st = c.status
  const muted = "min-w-0 truncate text-kit-small text-kit-ink-muted"

  if (st.s === "failed" || st.s === "reauth" || st.s === "setup") {
    return (
      <>
        <span className={muted}>{st.s === "failed" ? "Not reading" : st.s === "setup" ? "One step left" : "Paused until you do"}</span>
        <Button
          size="sm"
          variant={isAction ? "action" : "quiet"}
          pending={store.pending === c.id}
          pendingLabel="Working…"
          onClick={() => store.primary(c.id)}
          aria-describedby={nameId(c, "card")}
        >
          {primaryLabel(c) ?? "Fix"}
        </Button>
      </>
    )
  }

  if (st.s === "connected" || st.s === "waiting" || st.s === "paused") {
    const last = st.s === "connected" ? st.last : st.s === "waiting" ? `Connected ${st.since}` : st.last
    return (
      <>
        <span className={muted}>{last}</span>
        {c.reading ? (
          <span className="flex shrink-0 items-center gap-kit-controls">
            {!c.reading.real ? <Proposed show={show} why={c.reading.ref} /> : null}
            <Switch
              aria-label={`${c.reading.label}: ${c.name}`}
              checked={c.reading.on}
              onCheckedChange={(on) => store.toggleReading(c.id, on)}
            />
          </span>
        ) : c.kind === "channel" ? (
          <FootLink onClick={() => onOpen(c.id)} describedBy={nameId(c, "card")}>
            Topics and times
          </FootLink>
        ) : null}
      </>
    )
  }

  if (st.s === "soon") {
    return (
      <>
        <span className={muted}>{c.setup}</span>
        <span className="flex shrink-0 items-center gap-kit-controls">
          <Proposed show={show} why="no request path exists" />
          <FootLink onClick={() => onOpen(c.id)} describedBy={nameId(c, "card")}>
            Ask for it
          </FootLink>
        </span>
      </>
    )
  }

  // available, needs, builtin
  return (
    <>
      <span className={muted}>{c.setup}</span>
      {c.guide ? (
        <span className="flex shrink-0 items-center gap-kit-controls">
          {!c.guide.real ? <Proposed show={show} why={c.guide.ref} /> : null}
          <FootLink onClick={() => onOpen(c.id)} describedBy={nameId(c, "card")}>
            {c.guide.label}
          </FootLink>
        </span>
      ) : null}
    </>
  )
}

/** The reference's "Setup guide ›": a text button with a chevron, 44px tall on touch. */
function FootLink({ children, onClick, describedBy }: { children: string; onClick: () => void; describedBy: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-describedby={describedBy}
      className="relative inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-kit-chip text-kit-small font-kit-strong whitespace-nowrap text-kit-ink outline-hidden transition-[color] duration-(--kit-duration-state) ease-kit-out hover:text-kit-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus focus-visible:outline-solid motion-reduce:transition-none pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2"
    >
      {children}
      <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.75} aria-hidden />
    </button>
  )
}

/** Loading: the card's shape in static bars, no shimmer (so no motion path). */
export function CardSkeleton({ opts }: { opts: LabOptions }) {
  return (
    <div
      aria-hidden
      data-frame={opts.frame}
      className={`flex flex-col gap-kit-related bg-kit-object ${FRAME[opts.frame].card} ${opts.density === "compact" ? "p-kit-related" : "p-kit-group"}`}
    >
      <div className="flex items-center gap-kit-related">
        <span className="size-9 shrink-0 rounded-kit-control bg-kit-skeleton" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton width="45%" />
          <Skeleton width="30%" />
        </div>
      </div>
      <div className={`flex flex-col gap-2 bg-kit-well px-kit-recess py-kit-recess-y ${FRAME[opts.frame].well}`}>
        <Skeleton width="92%" />
        <Skeleton width="70%" />
      </div>
      <div className="flex min-h-kit-control-sm items-center border-t border-kit-hairline pt-kit-related">
        <Skeleton width="38%" />
      </div>
    </div>
  )
}
