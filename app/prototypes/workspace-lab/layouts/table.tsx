"use client"

import * as React from "react"
import { Layers01Icon, Menu01Icon } from "@hugeicons/core-free-icons"

import { IdeaTable } from "../parts/idea-table"
import { MarkedUp } from "../parts/marked-up"
import { Panel, PanelBody } from "../parts/panel"
import { ViewSwitch } from "../parts/filters"
import { useWorkspaceKeys, type Workspace } from "../use-workspace"
import { Announcer, FilterBar, Foot, PageBar } from "./header"
import { InlineLayout } from "./inline"

/**
 * A · Table and panel. A toolbar of two rows (the page, then the filters),
 * a dense table of ideas with columns, and the open idea Marked up in a
 * fixed panel on the right. The workspace a team tool would ship.
 *
 * Under the fold it is Inline: the same store, the same keys (j k D N L U /),
 * the open row unfolding in place. See `shouldFold`.
 */
export function TableLayout({ ws, keys }: { ws: Workspace; keys: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const fold = useFold(ref)
  return (
    // Hidden only until the first measure (before paint on the client), so
    // a narrow screen never flashes the table before it folds.
    <div ref={ref} className="h-full min-h-0" style={fold === null ? { visibility: "hidden" } : undefined}>
      {fold ? <InlineLayout ws={ws} keys={keys} /> : <TableView ws={ws} keys={keys} />}
    </div>
  )
}

function TableView({ ws, keys }: { ws: Workspace; keys: boolean }) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [view, setView] = React.useState<"flat" | "grouped">("flat")
  useWorkspaceKeys(ws, { enabled: keys, searchRef })

  return (
    // data-letter-keys: bare letters here are the workspace's (the theme key stands down).
    <div data-letter-keys className="@container/ws flex h-full min-h-0 flex-col bg-kit-ground">
      <Announcer>
      <PageBar ws={ws} searchRef={searchRef} divided={false} />
      <FilterBar
        ws={ws}
        end={
          <ViewSwitch
            label="View"
            value={view}
            onValueChange={setView}
            options={[
              { value: "flat", label: "Every idea, newest first", icon: Menu01Icon },
              { value: "grouped", label: "Grouped by source", icon: Layers01Icon },
            ]}
          />
        }
      />
      <div className="flex min-h-0 flex-1">
        <Panel pane="list" label="Ideas">
          <PanelBody>
            <IdeaTable ws={ws} grouped={view === "grouped"} />
          </PanelBody>
        </Panel>
        <Panel pane="detail" label="Open idea" width="var(--ws-detail-w)">
          <PanelBody label="Where the idea came from" scrollKey={ws.selected?.riff.id ?? null}>
            <MarkedUp ws={ws} row={ws.selected} strip />
          </PanelBody>
        </Panel>
      </div>
      <Foot ws={ws} />
      </Announcer>
    </div>
  )
}

/* ── The fold ─────────────────────────────────────────────────────────── */

/** Under this the page is a phone or a split tablet: Inline, whatever the columns would leave. */
const FOLD_MIN_WIDTH = 900
/**
 * The narrowest title column the table is allowed to leave. The brief said
 * ~360; at the defaults that folds the 1280 desktop (its title column is
 * 340), which is the screen the owner picked Table for. 320 keeps 1280 a
 * table and folds the 1024 tablet (title column ~80).
 */
const TITLE_MIN = 320
/**
 * What a row spends outside the title, from IdeaTable's grid: 8+8 inset,
 * 12+12 padding, a 16 glyph, Shape 5.5rem, For 3.25rem, Age 3rem, four
 * 12px gaps. From a 46rem list the Source column (7.5rem + a gap) joins.
 */
const ROW_FIXED = 16 + 24 + 16 + 88 + 52 + 48 + 4 * 12
const SOURCE_COL = 120 + 12
const SOURCE_FROM = 736

function px(el: Element, name: string, fallback: number) {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name))
  return Number.isFinite(v) ? v : fallback
}

/**
 * Fold when the workspace is under 900, or when the detail, at the width
 * candidates.css gives it (clamp(min, 36cqi, max)), would leave the title
 * column under TITLE_MIN.
 */
function shouldFold(width: number, detailMin: number, detailMax: number) {
  if (width < FOLD_MIN_WIDTH) return true
  const detail = Math.min(detailMax, Math.max(detailMin, width * 0.36))
  const list = width - detail - 1
  const title = list - ROW_FIXED - (list >= SOURCE_FROM ? SOURCE_COL : 0)
  return title < TITLE_MIN
}

/**
 * Measures the layout's own box (not the viewport: in the lab it sits in a
 * scaled frame beside a sidebar) and re-measures when it resizes or when
 * the control panel moves the detail's floor or ceiling on `.ws`.
 */
function useFold(ref: React.RefObject<HTMLDivElement | null>) {
  const [fold, setFold] = React.useState<boolean | null>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const root = el.closest(".ws") ?? el
    const measure = () => {
      setFold(shouldFold(el.clientWidth, px(root, "--ws-detail-min", 440), px(root, "--ws-detail-max", 560)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const mo = new MutationObserver(measure)
    mo.observe(root, { attributes: true, attributeFilter: ["style"] })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [ref])
  return fold
}
