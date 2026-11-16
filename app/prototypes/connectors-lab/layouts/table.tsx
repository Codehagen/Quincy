"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Bookmark01Icon, Clock01Icon, Image01Icon, Mail01Icon, Mic01Icon, PauseIcon } from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import {
  DataList,
  DataListMeta,
  DataListTitle,
  KeyBar,
  LiveDot,
  Panel,
  PanelBody,
  PanelHeader,
  SearchField,
  Toolbar,
  ToolbarGroup,
  ToolbarTitle,
  WorkspacePage,
  WorkspacePanes,
  revealDataListRow,
  useLetterKeys,
  type DataListColumn,
  type DataListGroup,
} from "@/components/kit"
import { ICON_DENSE } from "@/components/kit/control-styles"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"

import { isConnected, needsYou, type Connector } from "../data"
import type { LabOptions } from "../lab-options"
import type { ConnectorsStore } from "../use-connectors"
import { actionOwner } from "../parts/action"
import { ConnectorDetail } from "../parts/detail"
import { FilterPanels, FilterTabList, FilterTabs } from "../parts/filter-tabs"
import { Empty, GridLayout, HeaderActions, Tally } from "./grid"

/**
 * 2 · Table: the same content as a workspace, the house pattern from Ideas
 * and Drafts. A toolbar (title, search, the two header controls), a filter
 * row (the tabs, the tally), a dense list grouped by what it needs from you,
 * and the open connector in a pane beside it: the same detail the grid's
 * sheet shows. Under 900px of workspace it folds into 1 · Grid.
 *
 * Keys: j k move, / search, ← → along the tabs, Tab into the pane.
 */

const FOLD = 900

const MATERIAL: Record<string, IconSvgElement> = { voice: Mic01Icon, bookmarks: Bookmark01Icon, email: Mail01Icon, photos: Image01Icon }

function Mark({ c }: { c: Connector }) {
  const quiet = c.status.s === "soon"
  return (
    <span aria-hidden className={`grid size-4 place-items-center ${quiet ? "text-kit-ink-muted" : "text-kit-ink"}`}>
      {hasPlatformMark(c.glyph) ? (
        <PlatformMark platform={c.glyph} size={14} />
      ) : (
        <HugeiconsIcon icon={MATERIAL[c.glyph] ?? Clock01Icon} {...ICON_DENSE} />
      )}
    </span>
  )
}

/** The state in a dense cell: StatusPill's register (mark and word, no fill). */
function State({ c, opts }: { c: Connector; opts: LabOptions }) {
  const st = c.status
  const word = (icon: IconSvgElement | null, text: string, ink = false) => (
    <span className={`inline-flex items-center gap-1.5 text-kit-meta whitespace-nowrap ${ink ? "text-kit-ink" : "text-kit-ink-muted"}`}>
      {icon ? <HugeiconsIcon icon={icon} {...ICON_DENSE} aria-hidden /> : null}
      {text}
    </span>
  )
  switch (st.s) {
    case "connected":
      return (
        <span className="inline-flex items-center gap-1.5 text-kit-meta whitespace-nowrap text-kit-ink-muted">
          {opts.mark === "dot" ? (
            <span aria-hidden className="grid size-4 place-items-center">
              <LiveDot />
            </span>
          ) : null}
          Connected
        </span>
      )
    case "waiting":
      return word(Clock01Icon, "Nothing yet")
    case "paused":
      return word(PauseIcon, "Paused")
    case "failed":
      return word(Alert02Icon, "Stopped", true)
    case "reauth":
      return word(Alert02Icon, "Reconnect", true)
    case "setup":
      return word(Clock01Icon, "Half set up", true)
    case "available":
      return word(null, "Ready")
    case "needs":
      return word(null, `Needs ${st.onName}`)
    case "builtin":
      return word(null, "Built in")
    case "soon":
      return word(null, "Later")
  }
}

function lastFact(c: Connector): string {
  const st = c.status
  if (st.s === "connected" || st.s === "paused") return st.last
  if (st.s === "waiting") return `Connected ${st.since}`
  if (st.s === "failed" || st.s === "reauth" || st.s === "setup") return primaryFix(c)
  return c.setup ?? ""
}

function primaryFix(c: Connector) {
  const st = c.status
  return st.s === "failed" || st.s === "reauth" ? st.fix : st.s === "setup" ? "Finish setup" : ""
}

function columns(opts: LabOptions): DataListColumn<Connector>[] {
  return [
    { id: "mark", header: "", width: "1rem", cell: (c) => <Mark c={c} />, skeleton: "glyph" },
    {
      id: "name",
      header: "Connector",
      width: "minmax(0,1fr)",
      cell: (c) => <DataListTitle quiet={c.status.s === "soon"}>{c.name}</DataListTitle>,
      skeleton: "title",
    },
    { id: "kind", header: "Does", width: "9rem", wide: true, cell: (c) => <DataListMeta>{c.line}</DataListMeta> },
    { id: "state", header: "State", width: "7.5rem", cell: (c) => <State c={c} opts={opts} /> },
    {
      id: "last",
      header: "Latest",
      width: "11rem",
      align: "end",
      wide: true,
      cell: (c) => (
        <DataListMeta>
          <span className="block truncate">{lastFact(c)}</span>
        </DataListMeta>
      ),
    },
  ]
}

const GROUPS: { key: string; name: (n: number) => string; label: string; test: (c: Connector) => boolean }[] = [
  { key: "you", label: "Needs you", name: (n) => `${n} need you`, test: needsYou },
  { key: "in", label: "Connected", name: (n) => `${n} connected`, test: (c) => isConnected(c) && !needsYou(c) },
  { key: "built", label: "Built in", name: (n) => `${n} built in`, test: (c) => c.status.s === "builtin" },
  { key: "ready", label: "Ready to connect", name: (n) => `${n} ready to connect`, test: (c) => c.status.s === "available" || c.status.s === "needs" },
  { key: "later", label: "Coming later", name: (n) => `${n} coming later`, test: (c) => c.status.s === "soon" },
]

export function TableLayout({ store, opts }: { store: ConnectorsStore; opts: LabOptions }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [fold, setFold] = React.useState<boolean | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFold(el.clientWidth < FOLD)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col" style={fold === null ? { visibility: "hidden" } : undefined}>
      {fold ? <GridLayout store={store} opts={opts} /> : <TableSurface store={store} opts={opts} />}
    </div>
  )
}

function TableSurface({ store, opts }: { store: ConnectorsStore; opts: LabOptions }) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  const owner = actionOwner(store.all, opts)
  const cols = React.useMemo(() => columns(opts), [opts])

  const groups: DataListGroup<Connector>[] = GROUPS.map((g) => {
    const items = store.shown.filter(g.test)
    return {
      key: g.key,
      name: g.name(items.length),
      label: <span className="text-kit-meta font-kit-strong text-kit-ink-muted">{g.label}</span>,
      items,
    }
  }).filter((g) => g.items.length > 0)
  const flat = groups.flatMap((g) => g.items)

  // The open row: the one picked, else the first that needs you, else the first.
  const openId = store.selectedId && flat.some((c) => c.id === store.selectedId) ? store.selectedId : (flat[0]?.id ?? null)
  const open = store.all.find((c) => c.id === openId) ?? null

  const move = (by: 1 | -1) => {
    if (flat.length === 0) return
    const i = flat.findIndex((c) => c.id === openId)
    const next = flat[Math.min(flat.length - 1, Math.max(0, i + by))]!
    store.select(next.id)
    revealDataListRow(next.id)
  }
  useLetterKeys({ j: () => move(1), k: () => move(-1), "/": () => searchRef.current?.focus() })

  return (
    <WorkspacePage>
      <FilterTabs store={store}>
        <Toolbar label="Connectors" divided={false}>
          <div className="flex min-w-0 items-baseline gap-kit-related">
            <ToolbarTitle>Connectors</ToolbarTitle>
            <p className="hidden truncate text-kit-meta text-kit-ink-muted @[56rem]/kit-workspace:block">What I read, and where I post.</p>
          </div>
          <ToolbarGroup end grow>
            <SearchField
              ref={searchRef}
              size="sm"
              shortcut="/"
              aria-label="Search connectors"
              placeholder="Search"
              value={store.q}
              onValueChange={store.setQ}
            />
            <HeaderActions opts={opts} isAction={owner === "header"} size="sm" />
          </ToolbarGroup>
        </Toolbar>
        <Toolbar label="Filters" size="filter">
          <FilterTabList store={store} size="xs" />
          <ToolbarGroup end>
            <Tally store={store} />
          </ToolbarGroup>
        </Toolbar>
        <FilterPanels store={store} className="flex min-h-0 flex-1 flex-col">
          <WorkspacePanes>
            <Panel label="Connectors">
              <PanelBody>
                <DataList
                  label="Connectors"
                  aria-keyshortcuts="j k"
                  groups={groups}
                  getKey={(c) => c.id}
                  getLabel={(c) => c.name}
                  value={openId}
                  onValueChange={store.select}
                  columns={cols}
                  status={store.phase === "loading" ? "loading" : "ready"}
                  loadingLabel="Reading your connections"
                  empty={<Empty store={store} />}
                />
              </PanelBody>
            </Panel>
            <Panel label="Open connector" width="clamp(380px, 38cqi, 520px)" edge="start">
              <PanelBody label="The open connector" scrollKey={openId}>
                <PanelHeader end={open && store.phase === "live" ? <State c={open} opts={opts} /> : undefined}>
                  {open && store.phase === "live" ? (
                    <span className="truncate">
                      {open.kind === "source" ? "Source" : "Channel"} · {open.line}
                    </span>
                  ) : (
                    <span aria-hidden />
                  )}
                </PanelHeader>
                {open && store.phase === "live" ? (
                  <div className="px-kit-group py-kit-group">
                    <ConnectorDetail c={open} store={store} opts={opts} isAction={owner === open.id} />
                  </div>
                ) : null}
              </PanelBody>
            </Panel>
          </WorkspacePanes>
        </FilterPanels>
      </FilterTabs>
      <KeyBar
        keys={[
          { keys: ["j", "k"], label: "Move" },
          { keys: ["/"], label: "Search" },
        ]}
      />
    </WorkspacePage>
  )
}
