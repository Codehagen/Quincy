"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import {
  Alert02Icon,
  Bookmark01Icon,
  Clock01Icon,
  Image01Icon,
  Mail01Icon,
  Mic01Icon,
  PauseIcon,
} from "@hugeicons/core-free-icons"

import { ButtonAnchor, Button, GlyphTile, Text } from "@/components/kit"
import { ICON_DENSE } from "@/components/kit/control-styles"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"
import {
  latestLine,
  needsYou,
  primaryLabel,
  stateSentence,
  stateWord,
  usualText,
  type Connector as ConnectorData,
} from "@/lib/connectors"

import { ConnectorContext, useConnector } from "./connector-context"
import { ConnectorVerbs } from "./connector-verbs"

export { useConnector }

/**
 * One connector, as parts that read it from context. The table's cells, the
 * pane and the fold's card are each a different arrangement of the same
 * parts, so a state is said the same way wherever it shows:
 *
 * ```tsx
 * <Connector value={c} isAction={owner === c.id}>
 *   <Connector.Icon variant="tile" />
 *   <Connector.Name />
 *   <Connector.Line />
 *   <Connector.State />
 *   <Connector.Metric />
 *   <Connector.Primary />
 * </Connector>
 * ```
 *
 * `Connector.Verbs` is every verb the connector has (connector-verbs.tsx).
 *
 * The parts never fetch and never mutate on their own: `Primary` is a link
 * (a consent flow, GitHub's install screen), or, given `onOpen`, the button
 * that opens the connector where its form lives. Server actions belong to
 * the verbs (connector-verbs.tsx), which own their pending state and their
 * receipts.
 */

export type ConnectorProps = {
  value: ConnectorData
  isAction?: boolean
  onOpen?: () => void
  children: React.ReactNode
}

function ConnectorRoot({ value, isAction = false, onOpen, children }: ConnectorProps) {
  const ctx = React.useMemo(() => ({ connector: value, isAction, onOpen }), [value, isAction, onOpen])
  return <ConnectorContext.Provider value={ctx}>{children}</ConnectorContext.Provider>
}

/* ── Icon ─────────────────────────────────────────────────────────── */

const MATERIAL: Record<string, IconSvgElement> = {
  voice: Mic01Icon,
  bookmarks: Bookmark01Icon,
  email: Mail01Icon,
  photos: Image01Icon,
}

export type ConnectorIconProps = {
  /**
   * `mark`: the 16px monochrome mark of a dense row (a tile in a 36 row has
   * no air). `tile`: the kit's 36px GlyphTile, for the pane's head and a card.
   */
  variant?: "mark" | "tile"
}

/** Decorative: the name beside it says what it is. A listed-only connector is muted. */
function Icon({ variant = "mark" }: ConnectorIconProps) {
  const { connector: c } = useConnector()
  const quiet = c.status.s === "soon" || c.status.s === "off"
  if (variant === "tile") {
    return (
      <GlyphTile
        label={c.name}
        quiet={quiet}
        icon={MATERIAL[c.glyph]}
        mark={hasPlatformMark(c.glyph) ? <PlatformMark platform={c.glyph} size={16} /> : undefined}
      />
    )
  }
  return (
    <span aria-hidden className={`grid size-4 place-items-center ${quiet ? "text-kit-ink-muted" : "text-kit-ink"}`}>
      {hasPlatformMark(c.glyph) ? (
        <PlatformMark platform={c.glyph} size={14} />
      ) : MATERIAL[c.glyph] ? (
        <HugeiconsIcon icon={MATERIAL[c.glyph]!} {...ICON_DENSE} />
      ) : (
        <span className="text-kit-meta font-kit-strong">{c.name.slice(0, 1)}</span>
      )}
    </span>
  )
}

/* ── Words ────────────────────────────────────────────────────────── */

/** The name, at strong weight. Pass `id` so a repeated control can say which connector it acts on. */
function Name({ id }: { id?: string }) {
  const { connector: c } = useConnector()
  return (
    <Text id={id} weight="strong">
      {c.name}
    </Text>
  )
}

/** What it does, in two or three words. */
function Line() {
  const { connector: c } = useConnector()
  return (
    <Text variant="small" tone="muted">
      {c.line}
    </Text>
  )
}

const STATE_ICON: Partial<Record<ConnectorData["status"]["s"], IconSvgElement>> = {
  waiting: Clock01Icon,
  paused: PauseIcon,
  failed: Alert02Icon,
  reauth: Alert02Icon,
  setup: Clock01Icon,
  asks: Alert02Icon,
}

/**
 * The state as a glyph and a word, StatusPill's register: no fill. The
 * connected mark is the word alone (a connection is permission, not a
 * running ritual, so no live dot). One that needs you says it in ink, never
 * red: nothing was destroyed.
 */
function State() {
  const { connector: c } = useConnector()
  const icon = STATE_ICON[c.status.s]
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-kit-meta whitespace-nowrap ${needsYou(c) ? "text-kit-ink" : "text-kit-ink-muted"}`}
    >
      {icon ? <HugeiconsIcon icon={icon} {...ICON_DENSE} aria-hidden className="shrink-0" /> : null}
      {stateWord(c)}
    </span>
  )
}

/** The newest fact, on one line that never truncates its meaning (a `short` is two or three words). */
function Latest() {
  const { connector: c } = useConnector()
  return <>{latestLine(c)}</>
}

/** The state as a sentence (states.md), where the action is. Ink when it interrupts. */
function Sentence() {
  const { connector: c } = useConnector()
  return (
    <Text role="status" tone={needsYou(c) ? "ink" : "muted"}>
      {stateSentence(c)}
    </Text>
  )
}

/**
 * The one number, against the person's own usual: what and over what window
 * on the left, "27 · usual 22" on the right, tabular. Nothing when the
 * loader left it out (the history is too thin to hold a usual).
 */
function Metric() {
  const { connector: c } = useConnector()
  const m = c.metric
  if (!m) return null
  return (
    <div className="flex items-baseline justify-between gap-kit-related text-kit-small">
      <span className="min-w-0 text-kit-ink-muted">
        {m.label} · {m.window}
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
        <span className="font-kit-strong text-kit-ink">{m.value}</span>
        <span className="text-kit-meta text-kit-ink-muted">· {usualText(m.usual)}</span>
      </span>
    </div>
  )
}

/* ── The one verb ─────────────────────────────────────────────────── */

/** A verb that leaves for a consent or install screen: a real link, never next/link. */
export function primaryHref(c: ConnectorData): string | null {
  const st = c.status
  if (st.s === "needs") return `/api/connect/${st.on}`
  if (c.id === "x-bookmarks" && st.s === "reauth") return "/api/connect/x"
  if (c.detail.id === "channel" && (st.s === "available" || st.s === "reauth")) {
    return `/api/connect/${c.detail.platform}`
  }
  if (c.detail.id === "github" && (st.s === "available" || st.s === "failed")) return c.detail.installUrl
  return null
}

export type ConnectorPrimaryProps = {
  size?: "sm"
  /** The id of the connector's name, so "Connect" on every card says which. */
  "aria-describedby"?: string
}

/**
 * The connector's one verb (Connect, Install, a fix), ink when the page's
 * precedence gives it the ink. A link when the verb leaves the app; else,
 * given `onOpen`, a button that opens the connector where its form is; else
 * nothing, because the verbs below hold it.
 */
function Primary({ size, ...rest }: ConnectorPrimaryProps) {
  const { connector: c, isAction, onOpen } = useConnector()
  const label = primaryLabel(c)
  if (!label) return null
  const variant = isAction ? "action" : "quiet"
  const href = primaryHref(c)
  if (href) {
    return (
      <ButtonAnchor href={href} variant={variant} size={size} pendingLabel="Opening…" {...rest}>
        {label}
      </ButtonAnchor>
    )
  }
  if (onOpen) {
    return (
      <Button variant={variant} size={size} onClick={onOpen} {...rest}>
        {label}
      </Button>
    )
  }
  return null
}

export const Connector = Object.assign(ConnectorRoot, {
  Icon,
  Name,
  Line,
  State,
  Latest,
  Sentence,
  Metric,
  Primary,
  Verbs: ConnectorVerbs,
})
