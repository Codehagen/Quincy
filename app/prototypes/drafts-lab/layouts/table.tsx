"use client"

import * as React from "react"

import {
  DataList,
  EmptyRegion,
  Panel,
  PanelBody,
  PanelHeader,
  Tag,
  WorkspacePage,
  WorkspacePanes,
} from "@/components/kit"

import { DATA_WIDE_PX, FROM_COLUMN_PX, FromGlyph, ROW_FIXED_PX, columns, fromName } from "../parts/cells"
import { AllDecided, DraftsFilters, DraftsFoot, DraftsToolbar, FilteredEmpty, KEYS_POST, NothingYet } from "../parts/chrome"
import { DraftSheet } from "../parts/draft-sheet"
import { useDraftKeys } from "../parts/keys"
import type { LabOptions } from "../lab-options"
import type { DraftsStore, Row } from "../use-drafts"
import { LineupSurface } from "./lineup"

/**
 * 1 · Table: Ideas' picked layout, for Drafts. A toolbar of two rows, a
 * dense table of drafts, and the open draft marked up in a pane beside it.
 * The pane is wider than Ideas' (default clamp(440px, 46cqi, 720px)): a
 * draft is read, not scanned, and from 512px of content (a 552 pane, from a
 * ~1200 workspace) the beat brackets stand in the margin. Under the fold it is Lineup, with the same store and
 * keys (Ideas' Table folds into Inline the same way).
 */

const FOLD_MIN_WIDTH = 900
const TITLE_MIN = 280

/**
 * What replaces the right pane (round 2). Its width is said twice: as CSS for
 * the pane, and as a number for the fold rule, so the two agree.
 */
export type PaneSpec = {
  width: (o: LabOptions) => string
  widthAt: (workspace: number, o: LabOptions) => number
  render: (row: Row, store: DraftsStore) => React.ReactNode
}

function round1Width(width: number, o: LabOptions) {
  return Math.min(o.detailMax, Math.max(o.detailMin, (width * o.detailShare) / 100))
}

export function shouldFold(width: number, o: LabOptions, pane?: PaneSpec) {
  if (width < FOLD_MIN_WIDTH) return true
  const detail = pane ? pane.widthAt(width, o) : round1Width(width, o)
  const list = width - detail - 1
  const title = list - ROW_FIXED_PX - (list >= DATA_WIDE_PX ? FROM_COLUMN_PX : 0)
  return title < TITLE_MIN
}

export function TableLayout({ store, opts, pane }: { store: DraftsStore; opts: LabOptions; pane?: PaneSpec }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [fold, setFold] = React.useState<boolean | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFold(shouldFold(el.clientWidth, opts, pane))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [opts, pane])
  return (
    <WorkspacePage ref={ref}>
      <div className="flex min-h-0 flex-1 flex-col" style={fold === null ? { visibility: "hidden" } : undefined}>
        {fold ? (
          <LineupSurface store={store} opts={opts} sheet={pane ? (r) => pane.render(r, store) : undefined} />
        ) : (
          <TableSurface store={store} opts={opts} pane={pane} />
        )}
      </div>
    </WorkspacePage>
  )
}

function TableSurface({ store, opts, pane }: { store: DraftsStore; opts: LabOptions; pane?: PaneSpec }) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  useDraftKeys(store, searchRef, { preview: !pane })
  const open = store.selected
  const cols = React.useMemo(() => columns(opts.title), [opts.title])
  const width = pane ? pane.width(opts) : `clamp(${opts.detailMin}px, ${opts.detailShare}cqi, ${opts.detailMax}px)`
  const anyWaiting = store.rows.some((r) => r.bucket === "waiting")

  return (
    <>
      <DraftsToolbar store={store} searchRef={searchRef} />
      {store.phase === "empty" ? (
        <NothingYet />
      ) : (
        <>
          <DraftsFilters store={store} />
          <WorkspacePanes>
            <Panel label="Drafts">
              <PanelBody>
                <DataList
                  label="Drafts"
                  aria-keyshortcuts="j k a e p u"
                  items={store.shown}
                  getKey={(r) => r.id}
                  getLabel={(r) => (opts.title === "idea" ? r.draft.idea : r.opening)}
                  value={open?.id ?? null}
                  onValueChange={store.select}
                  columns={cols}
                  status={store.phase === "loading" ? "loading" : "ready"}
                  loadingLabel="Loading drafts"
                  empty={<FilteredEmpty store={store} />}
                />
              </PanelBody>
            </Panel>
            <Panel label="Open draft" width={width} edge="start">
              <PanelBody label="The open draft" scrollKey={open?.id ?? null}>
                {open && store.phase === "live" ? (
                  <>
                    <PanelHeader end={open.draft.kind ? <Tag look="text">{open.draft.kind}</Tag> : undefined}>
                      <FromGlyph row={open} />
                      <span className="truncate">{open.draft.from.adaptedFrom ? `Adapted from ${fromName(open)}` : `From your ${open.draft.from.sourceLabel}`}</span>
                      <span aria-hidden>·</span>
                      <span className="font-kit-mono text-kit-mono-sm">{open.draft.from.at}</span>
                    </PanelHeader>
                    <div className="px-kit-group py-kit-group">
                      {pane ? pane.render(open, store) : <DraftSheet row={open} store={store} />}
                    </div>
                  </>
                ) : store.phase !== "loading" && !anyWaiting ? (
                  // Every draft decided: the pane's one message, in the middle
                  // of the space under its strip (the strip keeps one line
                  // across both panes).
                  <div className="flex min-h-full flex-col">
                    <PanelHeader>
                      <span aria-hidden />
                    </PanelHeader>
                    <EmptyRegion>
                      <AllDecided />
                    </EmptyRegion>
                  </div>
                ) : (
                  <>
                    <PanelHeader>
                      <span aria-hidden />
                    </PanelHeader>
                    <div className="px-kit-group pt-kit-group">
                      {store.phase === "loading" ? null : (
                        <div className="flex flex-col gap-kit-tight">
                          <p className="text-kit-dense font-kit-strong text-kit-ink">Nothing open.</p>
                          <p className="text-kit-dense text-pretty text-kit-ink-muted">Pick a draft, or press j, to read it marked up.</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </PanelBody>
            </Panel>
          </WorkspacePanes>
        </>
      )}
      {store.phase === "empty" ? null : <DraftsFoot store={store} onUndo={store.undo} keys={pane ? KEYS_POST : undefined} />}
    </>
  )
}
