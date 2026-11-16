"use client"

import * as React from "react"
import { Listbox, ListboxGroup, ListboxGroupLabel, ListboxItem } from "@ui-sdk/react/listbox"

import { FOCUS_RING } from "@/components/kit/control-styles"
import { ideasFrom } from "@/components/quincy"

import type { Row } from "../data"
import type { Workspace } from "../use-workspace"
import { Age, Channels, ShapeTag, SourceCell, SourceGlyph, StatusPill } from "./cells"
import { WsButton } from "./toolbar"

/**
 * CANDIDATE — IdeaTable: the ideas as a dense, keyboard-first list with
 * columns. Behaviour is ui-sdk's Listbox (one tab stop, ↑/↓, Home/End,
 * typeahead on the title, selection follows focus), which Base UI does not
 * have outside a popup; the page adds j/k on top (use-workspace.ts).
 *
 * A listbox, not a grid: a row is one choice (open this idea), it holds no
 * control of its own, and its verbs live in the detail, as ListRow's do.
 * So the column heads are a visual row, hidden from assistive tech, and each
 * option's cells read in order as one sentence.
 *
 * `variant`:
 * - `table` — one line per idea, columns (glyph, idea, source, shape, for, age).
 * - `list` — two lines per idea (title, then the meta in one muted line), for
 *   a narrow middle pane.
 */

const ROW =
  `group/row relative mx-2 grid cursor-default items-center gap-x-3 rounded-kit-control-inner px-3 text-kit-ink select-none ${FOCUS_RING} focus-visible:outline-offset-0 ` +
  // Hover and selected surfaces live in candidates.css (--ws-row-hover, --ws-row-selected).
  "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none"

// Glyph · idea · source · shape · for · age. Source drops out when the pane is narrow (the glyph stays).
const TABLE_COLS =
  "grid-cols-[var(--ws-icon)_minmax(0,1fr)_5.5rem_3.25rem_3rem] @[46rem]/list:grid-cols-[var(--ws-icon)_minmax(0,1fr)_7.5rem_5.5rem_3.25rem_3rem]"

export function IdeaTable({
  ws,
  variant = "table",
  grouped = false,
  label = "Ideas",
}: {
  ws: Workspace
  variant?: "table" | "list"
  grouped?: boolean
  label?: string
}) {
  const rows = ws.shown
  const value = rows.some((r) => r.id === ws.selected?.id) ? ws.selected!.id : null

  const groups = React.useMemo(() => {
    if (!grouped) return null
    const m = new Map<string, Row[]>()
    for (const r of rows) m.set(r.riff.id, [...(m.get(r.riff.id) ?? []), r])
    return [...m.values()]
  }, [rows, grouped])

  const item = (r: Row) => (
    <ListboxItem
      key={r.id}
      value={r.id}
      label={r.title}
      data-ws-row={r.id}
      className={`${ROW} ${variant === "table" ? `${TABLE_COLS} py-1.5` : "grid-cols-[minmax(0,1fr)_auto] py-2"}`}
    >
      {variant === "table" ? <TableCells r={r} /> : <ListCells r={r} />}
    </ListboxItem>
  )

  return (
    <div className="@container/list flex min-h-0 flex-col">
      {variant === "table" ? <TableHead /> : null}
      <TableLoading variant={variant} />
      {rows.length === 0 ? (
        <Empty ws={ws} />
      ) : (
      <Listbox
        aria-label={label}
        aria-keyshortcuts="j k"
        value={value}
        onValueChange={(v) => {
          if (v) ws.select(v)
        }}
        data-ws-rows
        className="flex flex-col gap-px py-1.5 outline-none"
      >
        {groups
          ? groups.map((g) => (
              <ListboxGroup key={g[0]!.riff.id} className="flex flex-col gap-px pb-2">
                {/* Named once, as a sentence ("3 ideas from GitHub"): the source
                    and age beside it are for the eye, and read aloud they
                    would say the source twice. */}
                <ListboxGroupLabel aria-label={groupName(g[0]!)} className="mx-2 flex items-center gap-2 px-3 pt-3 pb-1.5">
                  <span aria-hidden className="inline-flex min-w-0">
                    <SourceCell riff={g[0]!.riff} />
                  </span>
                  <span aria-hidden className="ws-meta text-kit-ink-muted">·</span>
                  <span className="ws-meta font-kit-strong text-kit-ink">
                    {g[0]!.angle ? ideasFrom(g[0]!.riff).replace(/\.$/, "") : g[0]!.riff.state === "working" ? "Being read" : "No post in it"}
                  </span>
                  <span aria-hidden className="ms-auto">
                    <Age riff={g[0]!.riff} />
                  </span>
                </ListboxGroupLabel>
                {g.map(item)}
              </ListboxGroup>
            ))
          : rows.map(item)}
      </Listbox>
      )}
    </div>
  )
}

function groupName(r: Row) {
  if (r.angle) return ideasFrom(r.riff).replace(/\.$/, "")
  return `${r.riff.sourceLabel}: ${r.riff.state === "working" ? "being read" : "no post in it"}`
}

const STATUS_EMPTY = {
  open: ["Nothing open.", "Every idea is drafted, put off or set aside. A new note brings new ones."],
  later: ["Nothing in Later.", "Ideas you put off with L wait here."],
  drafted: ["Nothing drafted yet.", "Ideas you draft with D show here."],
  all: ["No ideas yet.", "Record a thought, and the ideas in it show here."],
} as const

/**
 * The empty list. When a filter or a search empties it, Clear filters
 * clears them and goes back to Open (Clear alone keeps the status, and a
 * status can empty the list by itself, which would leave this same state).
 * When the status alone empties it, it says so and offers Open.
 */
function Empty({ ws }: { ws: Workspace }) {
  const f = ws.filters
  const narrowed = f.source !== "all" || f.shape !== "all" || f.channel !== "all" || f.q !== "" || f.riff !== "all"
  const toOpen = () => {
    ws.clearFilters()
    ws.setFilter("status", "open")
  }
  return (
    <div data-ws-rows className="flex flex-col items-start gap-kit-related px-kit-group pt-kit-related pb-kit-group">
      <div className="flex flex-col gap-kit-tight">
        <p className="ws-row-title font-kit-strong text-kit-ink">{narrowed ? "No ideas match." : STATUS_EMPTY[f.status][0]}</p>
        <p className="ws-row-title text-kit-ink-muted">
          {narrowed ? "Clear a filter, or search for a word you said instead of one Quincy wrote." : STATUS_EMPTY[f.status][1]}
        </p>
      </div>
      {narrowed ? (
        <WsButton variant="quiet" size="sm" onClick={toOpen}>
          Clear filters
        </WsButton>
      ) : f.status !== "open" ? (
        <WsButton variant="quiet" size="sm" onClick={toOpen}>
          Show open ideas
        </WsButton>
      ) : null}
    </div>
  )
}

/**
 * The column heads: a 32px band with a full-bleed hairline, the same height
 * as the detail's source strip, so one line runs across both panes. Labels
 * sit on the rows' content edge (8 inset + 12 padding = 20 = px-kit-group).
 */
function TableHead() {
  return (
    <div
      aria-hidden
      className={`sticky top-0 z-[1] grid h-(--ws-head-h) ${TABLE_COLS} items-center gap-x-3 border-b border-kit-hairline bg-kit-ground px-kit-group`}
    >
      <span />
      <span className="ws-meta font-kit-strong text-kit-ink-muted">Idea</span>
      <span className="ws-meta hidden font-kit-strong text-kit-ink-muted @[46rem]/list:block">Source</span>
      <span className="ws-meta font-kit-strong text-kit-ink-muted">Shape</span>
      <span className="ws-meta font-kit-strong text-kit-ink-muted">For</span>
      <span className="ws-meta text-right font-kit-strong text-kit-ink-muted">Age</span>
    </div>
  )
}

// Varied, so the bars read as text of different lengths, not as a grid.
const LOADING_TITLES = ["62%", "48%", "71%", "55%", "38%", "66%", "52%", "44%"] as const

/**
 * The rows' shape while the ideas load: same grid, same row height, same
 * inset, so nothing moves when the rows arrive. Static (no shimmer), so it
 * needs no reduced-motion path. Shown by the lab's "Table" control.
 */
function TableLoading({ variant }: { variant: "table" | "list" }) {
  return (
    <div data-ws-loading className="flex-col gap-px py-1.5">
      <span role="status" className="sr-only">
        Loading ideas
      </span>
      {LOADING_TITLES.map((w, i) => (
        <div
          key={i}
          aria-hidden
          className={`mx-2 grid min-h-(--ws-row-h) items-center gap-x-3 px-3 ${variant === "table" ? TABLE_COLS : "grid-cols-[minmax(0,1fr)_auto]"}`}
        >
          {variant === "table" ? <span className="size-(--ws-icon) rounded-kit-chip bg-kit-skeleton" /> : null}
          <span className="h-kit-skeleton rounded-full bg-kit-skeleton" style={{ width: w }} />
          {variant === "table" ? (
            <>
              <span className="hidden h-kit-skeleton w-14 rounded-full bg-kit-skeleton @[46rem]/list:block" />
              <span className="h-kit-skeleton w-10 rounded-full bg-kit-skeleton" />
              <span className="h-kit-skeleton w-6 rounded-full bg-kit-skeleton" />
            </>
          ) : null}
          <span className="ms-auto h-kit-skeleton w-7 rounded-full bg-kit-skeleton" />
        </div>
      ))}
    </div>
  )
}

/**
 * Regular (460) for every title; the open row alone goes to 560 and ink
 * (candidates.css, on [data-selected]).
 * Nineteen titles at 560 is a wall, and weight is the one cue a selected
 * row has that does not depend on a 1.1:1 grey.
 */
function Title({ r, lines = 1 }: { r: Row; lines?: 1 | 2 }) {
  const quiet = r.status === "drafted" || r.status === "reading" || r.status === "failed"
  return (
    <span
      onPointerEnter={fullTitleIfCut}
      className={`ws-row-title min-w-0 ${lines === 1 ? "truncate" : "line-clamp-2 text-pretty"} ${quiet ? "text-kit-ink-muted" : "text-kit-ink"}`}
    >
      {r.title}
    </span>
  )
}

/**
 * The full title as the native hint, and only where it adds something: the
 * title is actually cut, and the row is not the open one (whose full title
 * is already on screen, in the detail's margin). Measured on the way in,
 * so a title that fits never carries a hint that repeats it. Option and
 * label stay the accessible name; this is a pointer-only convenience.
 */
function fullTitleIfCut(e: React.PointerEvent<HTMLSpanElement>) {
  const el = e.currentTarget
  const open = el.closest("[data-selected]") !== null
  const cut = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
  if (cut && !open) el.title = el.textContent ?? ""
  else el.removeAttribute("title")
}

function TableCells({ r }: { r: Row }) {
  return (
    <>
      <span className="grid place-items-center text-kit-ink-muted">
        <SourceGlyph id={r.riff.sourceId} />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <Title r={r} />
        {r.status === "drafted" || r.status === "later" ? <StatusPill status={r.status} /> : null}
      </span>
      <span className="ws-meta hidden min-w-0 truncate text-kit-ink-muted @[46rem]/list:block">{r.riff.sourceLabel}</span>
      <span className="min-w-0">
        {r.angle ? <ShapeTag>{r.angle.shape}</ShapeTag> : <StatusPill status={r.status} />}
      </span>
      <Channels channels={r.channels} />
      <span className="text-right">
        <Age riff={r.riff} />
      </span>
    </>
  )
}

function ListCells({ r }: { r: Row }) {
  return (
    <>
      <span className="flex min-w-0 flex-col gap-0.5">
        <Title r={r} lines={2} />
        <span className="flex min-w-0 items-center gap-2">
          <SourceCell riff={r.riff} />
          {r.angle ? (
            <>
              <span aria-hidden className="ws-meta text-kit-ink-muted">·</span>
              <ShapeTag>{r.angle.shape}</ShapeTag>
            </>
          ) : null}
          {r.status !== "waiting" ? <StatusPill status={r.status} /> : null}
        </span>
      </span>
      <span className="self-start pt-0.5">
        <Age riff={r.riff} />
      </span>
    </>
  )
}
