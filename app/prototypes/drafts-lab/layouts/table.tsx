"use client"

import * as React from "react"

import {
  DataList,
  Panel,
  PanelBody,
  PanelHeader,
  Tag,
  WorkspacePage,
  WorkspacePanes,
} from "@/components/kit"

import { DATA_WIDE_PX, FROM_COLUMN_PX, FromGlyph, ROW_FIXED_PX, columns, fromName } from "../parts/cells"
import { AllDecided, DraftsFilters, DraftsFoot, DraftsToolbar, FilteredEmpty, NothingYet } from "../parts/chrome"
import { DraftSheet } from "../parts/draft-sheet"
import { useDraftKeys } from "../parts/keys"
import type { LabOptions } from "../lab-options"
import type { DraftsStore } from "../use-drafts"
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

export function shouldFold(width: number, o: LabOptions) {
  if (width < FOLD_MIN_WIDTH) return true
  const detail = Math.min(o.detailMax, Math.max(o.detailMin, (width * o.detailShare) / 100))
  const list = width - detail - 1
  const title = list - ROW_FIXED_PX - (list >= DATA_WIDE_PX ? FROM_COLUMN_PX : 0)
  return title < TITLE_MIN
}

export function TableLayout({ store, opts }: { store: DraftsStore; opts: LabOptions }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [fold, setFold] = React.useState<boolean | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFold(shouldFold(el.clientWidth, opts))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [opts])
  return (
    <WorkspacePage ref={ref}>
      <div className="flex min-h-0 flex-1 flex-col" style={fold === null ? { visibility: "hidden" } : undefined}>
        {fold ? <LineupSurface store={store} opts={opts} /> : <TableSurface store={store} opts={opts} />}
      </div>
    </WorkspacePage>
  )
}

function TableSurface({ store, opts }: { store: DraftsStore; opts: LabOptions }) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  useDraftKeys(store, searchRef)
  const open = store.selected
  const cols = React.useMemo(() => columns(opts.title), [opts.title])
  const width = `clamp(${opts.detailMin}px, ${opts.detailShare}cqi, ${opts.detailMax}px)`
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
                      <DraftSheet row={open} store={store} />
                    </div>
                  </>
                ) : (
                  <>
                    <PanelHeader>
                      <span aria-hidden />
                    </PanelHeader>
                    <div className="px-kit-group pt-kit-group">
                      {store.phase === "loading" ? null : anyWaiting ? (
                        <div className="flex flex-col gap-kit-tight">
                          <p className="text-kit-dense font-kit-strong text-kit-ink">Nothing open.</p>
                          <p className="text-kit-dense text-pretty text-kit-ink-muted">Pick a draft, or press j, to read it marked up.</p>
                        </div>
                      ) : (
                        <AllDecided />
                      )}
                    </div>
                  </>
                )}
              </PanelBody>
            </Panel>
          </WorkspacePanes>
        </>
      )}
      {store.phase === "empty" ? null : <DraftsFoot store={store} onUndo={store.undo} />}
    </>
  )
}
