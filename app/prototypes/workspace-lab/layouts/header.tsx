"use client"

import * as React from "react"
import { Mic01Icon } from "@hugeicons/core-free-icons"

import { Count } from "@/components/kit"

import { DRAFTED_PER_WEEK, optionsFor, type StatusFilter } from "../data"
import { CompactSearch, FilterMenu, type FilterOption } from "../parts/filters"
import { KeyBar, Toolbar, ToolbarGroup, WsButton } from "../parts/toolbar"
import type { Workspace } from "../use-workspace"

/* ── The one status ──────────────────────────────────────────────────── */

const AnnounceContext = React.createContext<(text: string) => void>(() => {})

/**
 * The workspace's one live region, mounted with the layout and never
 * remounted: a status node that arrives with its text already in it is
 * often not read at all, so every message (the count after a search, the
 * Undo note, the recorder) changes the text of this one node instead.
 * Rendered last, at the foot, where the Undo note shows.
 */
export function Announcer({ children }: { children: React.ReactNode }) {
  const [text, setText] = React.useState("")
  return (
    <AnnounceContext.Provider value={setText}>
      {children}
      <p role="status" className="sr-only">
        {text}
      </p>
    </AnnounceContext.Provider>
  )
}

function useAnnounce() {
  return React.useContext(AnnounceContext)
}

/**
 * The page head every layout shares: the name, the one number (against the
 * person's own week, never a bare total), search, and the capture action.
 * Record a thought is quiet here: the ink belongs to Draft this idea, in the
 * detail, and one view has one ink pill (actions.md).
 */
export function PageBar({
  ws,
  searchRef,
  searchWidth = "w-56",
  divided = true,
}: {
  ws: Workspace
  searchRef: React.RefObject<HTMLInputElement | null>
  searchWidth?: string
  /** Off when a FilterBar follows: the two rows read as one band with one hairline under it. */
  divided?: boolean
}) {
  const open = ws.rows.filter((r) => r.status === "waiting").length
  const drafted = ws.rows.filter((r) => r.status === "drafted").length
  const announce = useAnnounce()
  return (
    <Toolbar label="Ideas" divided={divided}>
      <div className="flex min-w-0 items-baseline gap-kit-related">
        <h1 className="ws-page-title shrink-0 text-kit-ink">Ideas</h1>
        <p className="ws-meta hidden truncate text-kit-ink-muted @[40rem]/ws:block">
          <Count value={open} /> {open === 1 ? "idea" : "ideas"} waiting.{" "}
          {drafted > 0 ? <Count value={drafted} /> : "None"} drafted this week; you usually draft {DRAFTED_PER_WEEK}.
        </p>
      </div>
      <ToolbarGroup end grow>
        <CompactSearch ref={searchRef} value={ws.filters.q} onValueChange={(v) => ws.setFilter("q", v)} placeholder="Search ideas" width={searchWidth} />
        <WsButton variant="quiet" icon={Mic01Icon} onClick={() => announce("The lab does not open the recorder.")}>
          Record a thought
        </WsButton>
      </ToolbarGroup>
    </Toolbar>
  )
}

/** The filters, with what each would leave, and a Clear once one is on. */
export function FilterBar({ ws, end, status = true }: { ws: Workspace; end?: React.ReactNode; status?: boolean }) {
  const f = ws.filters
  const on = f.source !== "all" || f.shape !== "all" || f.channel !== "all" || f.q !== ""
  const count = `${ws.shown.length} of ${ws.rows.length} ideas`
  // Said once the typing stops, not on every key: "4 of 19", "3 of 19"
  // while a word is being spelled is noise. Not on the first render.
  const announce = useAnnounce()
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => announce(count), 500)
    return () => clearTimeout(t)
  }, [count, announce])
  return (
    <Toolbar label="Filters" size="filter">
      <ToolbarGroup>
        {status ? (
          <FilterMenu<StatusFilter>
            label="Status"
            value={f.status}
            options={optionsFor(ws.rows, f, "status") as FilterOption<StatusFilter>[]}
            onValueChange={(v) => ws.setFilter("status", v)}
          />
        ) : null}
        <FilterMenu label="Source" value={f.source} options={optionsFor(ws.rows, f, "source")} onValueChange={(v) => ws.setFilter("source", v)} />
        <FilterMenu label="Shape" value={f.shape} options={optionsFor(ws.rows, f, "shape")} onValueChange={(v) => ws.setFilter("shape", v)} />
        <FilterMenu label="For" value={f.channel} options={optionsFor(ws.rows, f, "channel")} onValueChange={(v) => ws.setFilter("channel", v)} />
        {on ? (
          <WsButton variant="ghost" size="sm" onClick={ws.clearFilters}>
            Clear
          </WsButton>
        ) : null}
      </ToolbarGroup>
      <ToolbarGroup end>
        {/* Visible from 40rem: on a phone the filters take the row, and the
            list itself says how many are left. */}
        <span className="ws-mono hidden whitespace-nowrap text-kit-ink-muted @[40rem]/ws:inline">{count}</span>
        {end}
      </ToolbarGroup>
    </Toolbar>
  )
}

export const KEYS: [string, string][] = [
  ["j k", "Move"],
  ["D", "Draft"],
  ["N", "Not this one"],
  ["L", "Later"],
  ["U", "Undo"],
  ["/", "Search"],
]

/** "Set aside “The title”." — one stop, even when the title brings its own. */
function setAside(title: string) {
  return `Set aside “${title.replace(/\.+$/, "")}”.`
}

/**
 * The pane's foot: the key bar, or the one Undo after Not this one in its
 * place while it lasts. The note is visual; what it says goes to the
 * Announcer's live region, which was there before it.
 */
export function Foot({ ws }: { ws: Workspace }) {
  const announce = useAnnounce()
  const dropped = ws.lastDropped
  React.useEffect(() => {
    if (dropped) announce(`${setAside(dropped.title)} Press U to undo.`)
  }, [dropped, announce])
  return dropped ? <DroppedNote ws={ws} /> : <KeyBar keys={KEYS} />
}

function DroppedNote({ ws }: { ws: Workspace }) {
  if (!ws.lastDropped) return null
  return (
    <div className="ws-foot flex shrink-0 items-center gap-kit-related border-t border-kit-hairline">
      <p className="ws-meta min-w-0 flex-1 truncate text-kit-ink-muted">{setAside(ws.lastDropped.title)}</p>
      <WsButton variant="ghost" size="sm" hint="U" aria-keyshortcuts="u" onClick={ws.undoDrop}>
        Undo
      </WsButton>
    </div>
  )
}
