"use client"

import * as React from "react"
import { PlusSignIcon, WorkflowSquare01Icon } from "@hugeicons/core-free-icons"

import {
  Button,
  ButtonLink,
  EmptyRegion,
  EmptyState,
  KitPage,
  LiveDot,
  SearchField,
  Sheet,
  SheetPanel,
  Text,
  useLetterKeys,
} from "@/components/kit"

import { isConnected } from "../data"
import type { LabOptions } from "../lab-options"
import type { ConnectorsStore } from "../use-connectors"
import { actionOwner } from "../parts/action"
import { CardSkeleton, ConnectorCard } from "../parts/card"
import { ConnectorDetail } from "../parts/detail"
import { FilterPanels, FilterTabList, FilterTabs } from "../parts/filter-tabs"
import { Proposed } from "../parts/marks"

/**
 * 1 · Grid: the reference, translated. A KitPage (wide) with the title, one
 * line and two header controls; a filter row of tabs with counts, the tally
 * and the search; then the cards in a grid, inside one white panel (or each
 * on the ground). A card opens a sheet with everything about it.
 *
 * Keys: Tab walks name → controls → next card; ← → move along the tabs; /
 * goes to the search. Esc closes the sheet.
 */
export function GridLayout({ store, opts }: { store: ConnectorsStore; opts: LabOptions }) {
  const [sheetId, setSheetId] = React.useState<string | null>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  useLetterKeys({ "/": () => searchRef.current?.focus() })
  const owner = actionOwner(store.all, opts)
  const open = store.all.find((c) => c.id === sheetId) ?? null
  const firstRun = store.phase === "live" && !store.all.some(isConnected)

  return (
    <KitPage
      title="Connectors"
      width="wide"
      summary={
        firstRun
          ? "Nothing connected yet. Start with X: I learn how you write from what you already posted."
          : "What I read, and where I post. I read nothing you haven't connected."
      }
      actions={<HeaderActions opts={opts} isAction={owner === "header"} />}
    >
      <div className="@container/cl flex flex-col gap-kit-group">
        <FilterTabs store={store}>
          <div className="flex flex-wrap items-center justify-between gap-x-kit-group gap-y-kit-related">
            <FilterTabList store={store} />
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-kit-group gap-y-kit-related">
              <Tally store={store} />
              <div className="w-full @[36rem]/cl:w-64">
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

          <FilterPanels store={store}>
            <div data-frame={opts.frame} className={`cl-panel ${opts.frame === "panel" ? "@[36rem]/cl:rounded-kit-object @[36rem]/cl:bg-kit-object @[36rem]/cl:shadow-kit-object" : ""}`}>
              {store.phase === "loading" ? (
                <>
                  <Text as="div" role="status" tone="muted" variant="small">
                    <LiveDot pulse>Reading your connections.</LiveDot>
                  </Text>
                  <div className="cl-grid mt-kit-related" data-cols={opts.cols} data-density={opts.density}>
                    {Array.from({ length: opts.cols * 2 }, (_, i) => (
                      <CardSkeleton key={i} opts={opts} />
                    ))}
                  </div>
                </>
              ) : store.shown.length === 0 ? (
                <EmptyRegion>
                  <Empty store={store} />
                </EmptyRegion>
              ) : (
                <div className="cl-grid" data-cols={opts.cols} data-density={opts.density}>
                  {store.shown.map((c) => (
                    <ConnectorCard key={c.id} c={c} store={store} opts={opts} isAction={owner === c.id} onOpen={setSheetId} />
                  ))}
                </div>
              )}
            </div>
          </FilterPanels>
        </FilterTabs>
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => {
        if (!o) setSheetId(null)
      }}>
        {open ? (
          <SheetPanel title={open.name} description={`${open.kind === "source" ? "Source" : "Channel"} · ${open.line}`}>
            <ConnectorDetail c={open} store={store} opts={opts} isAction={owner === open.id} showHead={false} />
          </SheetPanel>
        ) : null}
      </Sheet>
    </KitPage>
  )
}

export function HeaderActions({ opts, isAction, size }: { opts: LabOptions; isAction: boolean; size?: "sm" }) {
  return (
    <>
      <ButtonLink href="/rhythm" icon={WorkflowSquare01Icon} size={size}>
        What reads them
      </ButtonLink>
      <span className="flex items-center gap-kit-controls">
        <Button variant={isAction ? "action" : "quiet"} icon={isAction ? undefined : PlusSignIcon} size={size}>
          Ask for one
        </Button>
        <Proposed show={opts.proposed === "show"} why="no request path exists; could open Studio with the ask" />
      </span>
    </>
  )
}

/** "4 connected · 4 ready · 16 later", in muted text. Every connector counted once. */
export function Tally({ store }: { store: ConnectorsStore }) {
  if (store.phase === "loading") return null
  const connected = store.all.filter(isConnected).length
  return (
    <p className="text-kit-small whitespace-nowrap text-kit-ink-muted tabular-nums">
      {connected} connected · {store.counts.ready} ready · {store.counts.later} later
    </p>
  )
}

/** Centred, with the friend (states.md): filtered empty, or nothing connected yet. */
export function Empty({ store }: { store: ConnectorsStore }) {
  if (store.q.trim()) {
    return (
      <EmptyState frame="none" bold="Nothing matches that." rest="Try another word, or clear the search.">
        <Button size="sm" onClick={() => store.setQ("")}>
          Clear the search
        </Button>
      </EmptyState>
    )
  }
  if (store.filter === "connected") {
    return (
      <EmptyState frame="none" bold="Nothing connected yet." rest="Connect X and I'll learn how you write from what you already posted.">
        <Button size="sm" onClick={() => store.setFilter("all")}>
          See them all
        </Button>
      </EmptyState>
    )
  }
  return <EmptyState frame="none" bold="Nothing here yet." rest="Every connector is under All." />
}
