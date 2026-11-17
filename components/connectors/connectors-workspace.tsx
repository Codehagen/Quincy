"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, WorkflowSquare01Icon } from "@hugeicons/core-free-icons"

import {
  Button,
  ButtonLink,
  DataList,
  DataListMeta,
  DataListTitle,
  EmptyRegion,
  EmptyState,
  KeyBar,
  KitPage,
  Panel,
  PanelBody,
  PanelHeader,
  SearchField,
  Sheet,
  SheetPanel,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Toolbar,
  ToolbarGroup,
  ToolbarTitle,
  WorkspacePage,
  WorkspacePanes,
  focusRestoredDataList,
  revealDataListRow,
  useLetterKeys,
  type DataListColumn,
  type DataListGroup,
} from "@/components/kit"
import { ICON_DENSE_CHEVRON } from "@/components/kit/control-styles"
import { FILTERS, isConnected, type Connector as ConnectorData, type ConnectorFilter } from "@/lib/connectors"

import { Connector } from "./connector"
import { ConnectorCard } from "./connector-card"
import { ConnectorPane } from "./connector-pane"
import { useConnectors, type ConnectorsStore, type OpenConnectorState } from "./use-connectors"

/**
 * /connectors: Sources and Channels as one page, a workspace
 * (docs/design/workspace.md; decided on the connectors lab, 2026-11-17: the
 * Table). A toolbar with the search, a filter row of tabs with counts and
 * the tally, a dense list grouped by what each connector needs from you
 * (Needs you · Connected · Built in · Ready to connect · Coming later), and
 * the open connector in a pane beside it with every verb. Under 900px of
 * workspace it folds into the Grid: a card per connector, whose name opens
 * the same detail in a sheet.
 *
 * Keys: j k move, / searches, ← → along the tabs, Tab into the pane.
 *
 * The open connector is controlled (`value`, `onValueChange`) or not
 * (`defaultValue`, which the page fills from `?open=`).
 */

export type ConnectorsWorkspaceProps = OpenConnectorState & {
  connectors: readonly ConnectorData[]
  /** The tab at first, from `?show=` (the old /sources and /channels land here). */
  defaultFilter?: ConnectorFilter
}

/** Under this the workspace is a phone or a split tablet: the cards. */
const FOLD = 900

function useFold(ref: React.RefObject<HTMLDivElement | null>) {
  const [fold, setFold] = React.useState<boolean | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFold(el.clientWidth < FOLD)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return fold
}

export function ConnectorsWorkspace({ connectors, defaultFilter, ...open }: ConnectorsWorkspaceProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const fold = useFold(ref)
  const store = useConnectors(connectors, { ...open, defaultFilter })
  return (
    <WorkspacePage ref={ref}>
      {/* Hidden only until the first measure (before paint), so a narrow
          screen never flashes the table before it folds. */}
      <div className="flex min-h-0 flex-1 flex-col" style={fold === null ? { visibility: "hidden" } : undefined}>
        {fold ? <ConnectorsGrid store={store} /> : <ConnectorsTable store={store} />}
      </div>
    </WorkspacePage>
  )
}

/* ── The table ────────────────────────────────────────────────────── */

const COLUMNS: DataListColumn<ConnectorData>[] = [
  {
    id: "mark",
    header: "",
    width: "1rem",
    cell: (c) => (
      <Connector value={c}>
        <Connector.Icon />
      </Connector>
    ),
    skeleton: "glyph",
  },
  {
    id: "name",
    header: "Connector",
    width: "minmax(0,1fr)",
    cell: (c) => <DataListTitle quiet={c.status.s === "soon" || c.status.s === "off"}>{c.name}</DataListTitle>,
    skeleton: "title",
  },
  { id: "does", header: "Does", width: "9rem", wide: true, cell: (c) => <DataListMeta>{c.line}</DataListMeta> },
  {
    id: "state",
    header: "State",
    width: "7.5rem",
    cell: (c) => (
      <Connector value={c}>
        <Connector.State />
      </Connector>
    ),
  },
  {
    id: "latest",
    header: "Latest",
    width: "11rem",
    align: "end",
    wide: true,
    cell: (c) => (
      <DataListMeta>
        <span className="block truncate tabular-nums">
          <Connector value={c}>
            <Connector.Latest />
          </Connector>
        </span>
      </DataListMeta>
    ),
  },
]

function ConnectorsTable({ store }: { store: ConnectorsStore }) {
  const searchRef = React.useRef<HTMLInputElement>(null)

  const groups: DataListGroup<ConnectorData>[] = store.groups.map((g) => {
    // "Needs you" alone is ink with the alert glyph: the one group that should
    // interrupt says so in its head, never with a tinted row (a tint would
    // read as selected, which is the well grey's job).
    const you = g.key === "you"
    return {
      key: g.key,
      name: g.name(g.items.length),
      label: (
        <span className={`inline-flex items-center gap-1.5 ${you ? "text-kit-ink" : "text-kit-ink-muted"}`}>
          {you ? <HugeiconsIcon icon={Alert02Icon} {...ICON_DENSE_CHEVRON} aria-hidden className="shrink-0" /> : null}
          <span className="font-kit-strong">{g.label}</span>
          <span className="tabular-nums">{g.items.length}</span>
        </span>
      ),
      items: g.items,
    }
  })

  const move = (by: 1 | -1) => {
    const flat = store.shown
    if (flat.length === 0) return
    const i = flat.findIndex((c) => c.id === store.openId)
    const next = flat[Math.min(flat.length - 1, Math.max(0, i + by))]!
    store.select(next.id)
    revealDataListRow(next.id)
  }
  useLetterKeys({ j: () => move(1), k: () => move(-1), "/": () => searchRef.current?.focus() })

  const open = store.open

  return (
    <FilterTabs store={store}>
      <Toolbar label="Connectors" divided={false}>
        <div className="flex min-w-0 items-baseline gap-kit-related">
          <ToolbarTitle>Connectors</ToolbarTitle>
          <p className="hidden truncate text-kit-meta text-kit-ink-muted @[56rem]/kit-workspace:block">
            What I read, and where I post.
          </p>
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
          <WhatReads size="sm" />
        </ToolbarGroup>
      </Toolbar>
      <Toolbar label="Filters" size="filter">
        <FilterTabList store={store} size="xs" />
        <ToolbarGroup end>
          <Tally store={store} />
        </ToolbarGroup>
      </Toolbar>
      <FilterPanels>
        <WorkspacePanes>
          <Panel label="Connectors">
            <PanelBody>
              <DataList
                label="Connectors"
                aria-keyshortcuts="j k"
                groups={groups}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                value={store.openId}
                onValueChange={store.select}
                columns={COLUMNS}
                empty={<Empty store={store} onRestore={focusRestoredDataList} />}
              />
            </PanelBody>
          </Panel>
          <Panel label="Open connector" width="clamp(380px, 38cqi, 520px)" edge="start">
            <PanelBody label="The open connector" scrollKey={store.openId}>
              {/* The strip: the kind at the start, the state at the end. The head
                  under it says the name and what it does, so nothing is said twice. */}
              <PanelHeader
                end={
                  open ? (
                    <Connector value={open}>
                      <Connector.State />
                    </Connector>
                  ) : undefined
                }
              >
                {open ? <span className="truncate">{open.kind === "source" ? "Source" : "Channel"}</span> : <span aria-hidden />}
              </PanelHeader>
              {open ? (
                <div className="px-kit-group py-kit-group">
                  <ConnectorPane key={open.id} connector={open} isAction={store.owner === open.id} />
                </div>
              ) : null}
            </PanelBody>
          </Panel>
        </WorkspacePanes>
      </FilterPanels>
      <KeyBar
        keys={[
          { keys: ["j", "k"], label: "Move" },
          { keys: ["/"], label: "Search" },
        ]}
      />
    </FilterTabs>
  )
}

/* ── The fold ─────────────────────────────────────────────────────── */

function ConnectorsGrid({ store }: { store: ConnectorsStore }) {
  const [sheetId, setSheetId] = React.useState<string | null>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  useLetterKeys({ "/": () => searchRef.current?.focus() })
  const open = store.all.find((c) => c.id === sheetId) ?? null
  const firstRun = !store.all.some(isConnected)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <KitPage
        title="Connectors"
        width="wide"
        summary={
          firstRun
            ? "Nothing connected yet. Start with X: I learn how you write from what you already posted."
            : "What I read, and where I post. I read nothing you haven't connected."
        }
        actions={<WhatReads />}
      >
        <div className="@container/connectors flex flex-col gap-kit-group">
          <Tabs value={store.filter} onValueChange={(v) => store.setFilter(v as ConnectorFilter)} layout="fill">
            <div className="flex flex-wrap items-center justify-between gap-x-kit-group gap-y-kit-related">
              <FilterTabList store={store} />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-kit-group gap-y-kit-related">
                <Tally store={store} />
                <div className="w-full @[36rem]/connectors:w-64">
                  <SearchField
                    ref={searchRef}
                    size="sm"
                    shortcut="/"
                    aria-label="Search connectors"
                    placeholder="Search"
                    value={store.q}
                    onValueChange={store.setQ}
                  />
                </div>
              </div>
            </div>
            <FilterPanels>
              {/* One white object holding the cards from 36rem; on a phone the
                  cards sit on the ground, since one column needs every pixel. */}
              <div className="@[36rem]/connectors:rounded-kit-object @[36rem]/connectors:bg-kit-object @[36rem]/connectors:p-kit-group @[36rem]/connectors:shadow-kit-object">
                {store.shown.length === 0 ? (
                  <EmptyRegion>
                    <Empty store={store} />
                  </EmptyRegion>
                ) : (
                  <div className="grid grid-cols-1 gap-kit-stack @[36rem]/connectors:grid-cols-2 @[52rem]/connectors:grid-cols-3">
                    {store.shown.map((c) => (
                      <ConnectorCard key={c.id} connector={c} isAction={store.owner === c.id} onOpen={setSheetId} />
                    ))}
                  </div>
                )}
              </div>
            </FilterPanels>
          </Tabs>
        </div>
      </KitPage>

      <Sheet
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setSheetId(null)
        }}
      >
        {open ? (
          <SheetPanel title={open.name} description={`${open.kind === "source" ? "Source" : "Channel"} · ${open.line}`}>
            <ConnectorPane connector={open} isAction={store.owner === open.id} variant="sheet" />
          </SheetPanel>
        ) : null}
      </Sheet>
    </div>
  )
}

/* ── Shared ───────────────────────────────────────────────────────── */

/** The tabs over the whole surface, so the strip sits in a Toolbar and the panel fills the rest. */
function FilterTabs({ store, children }: { store: ConnectorsStore; children: React.ReactNode }) {
  return (
    <Tabs value={store.filter} onValueChange={(v) => store.setFilter(v as ConnectorFilter)} layout="fill">
      {children}
    </Tabs>
  )
}

/** All · Connected · Sources · Channels, each with its count. Scrolls inside itself on a phone. */
function FilterTabList({ store, size = "md" }: { store: ConnectorsStore; size?: "md" | "xs" }) {
  return (
    <div className="-m-1 max-w-full overflow-x-auto p-1 [scrollbar-width:none]">
      <TabList aria-label="Show" size={size}>
        {FILTERS.map((f) => (
          <Tab key={f.value} value={f.value} count={store.counts[f.value]}>
            {f.label}
          </Tab>
        ))}
      </TabList>
    </div>
  )
}

/** One panel per tab; only the active one mounts. The list inside is the tab stop, not the panel. */
function FilterPanels({ children }: { children: React.ReactNode }) {
  return (
    <>
      {FILTERS.map((f) => (
        <TabPanel key={f.value} value={f.value} tabIndex={-1}>
          {children}
        </TabPanel>
      ))}
    </>
  )
}

/** "4 connected · 2 ready · 16 later", muted. Every connector counted once. */
function Tally({ store }: { store: ConnectorsStore }) {
  return (
    <p className="text-kit-small whitespace-nowrap text-kit-ink-muted tabular-nums">
      {store.counts.connected} connected · {store.counts.ready} ready · {store.counts.later} later
    </p>
  )
}

/** The header's one quiet control: the rhythms that read what comes in. */
function WhatReads({ size }: { size?: "sm" }) {
  return (
    <ButtonLink href="/rhythm" icon={WorkflowSquare01Icon} size={size}>
      What reads them
    </ButtonLink>
  )
}

/** Centred, with the friend (states.md): the search found nothing, or nothing is connected yet. */
function Empty({ store, onRestore }: { store: ConnectorsStore; onRestore?: () => void }) {
  if (store.q.trim()) {
    return (
      <EmptyState frame="none" bold="Nothing matches that." rest="Try another word, or clear the search.">
        <Button
          size="sm"
          onClick={() => {
            store.setQ("")
            onRestore?.()
          }}
        >
          Clear the search
        </Button>
      </EmptyState>
    )
  }
  if (store.filter === "connected") {
    return (
      <EmptyState
        frame="none"
        bold="Nothing connected yet."
        rest="Connect X and I'll learn how you write from what you already posted."
      >
        <Button
          size="sm"
          onClick={() => {
            store.setFilter("all")
            onRestore?.()
          }}
        >
          See them all
        </Button>
      </EmptyState>
    )
  }
  return <EmptyState frame="none" bold="Nothing here yet." rest="Every connector is under All." />
}
