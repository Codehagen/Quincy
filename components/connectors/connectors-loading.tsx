"use client"

import {
  DataList,
  KeyBar,
  KitPage,
  Panel,
  PanelBody,
  PanelHeader,
  Toolbar,
  ToolbarTitle,
  WorkspacePage,
  WorkspacePanes,
} from "@/components/kit"
import type { Connector } from "@/lib/connectors"

import { COLUMNS, FOLDED, KEYS, UNFOLDED } from "./connectors-workspace"

const NO_ROWS: readonly Connector[] = []

/**
 * /connectors while its reads are on the way (page.tsx's Suspense fallback):
 * the workspace's own frame at its final size, so nothing moves when the
 * connectors land. The title row, the filter row (empty), the heads over
 * DataList's eight static loading rows, the pane's strip and the keys.
 * Under the fold, the Grid's title alone: its cards have no loading shape.
 * The fold is the workspace's own CSS (FOLDED / UNFOLDED), so the frame
 * needs no script and paints at the side the page will.
 */
export function ConnectorsLoading() {
  return (
    <WorkspacePage>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={FOLDED}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <KitPage title="Connectors" width="wide">{null}</KitPage>
          </div>
        </div>
        <div className={UNFOLDED}>
          <Toolbar label="Connectors" divided={false}>
            <div className="flex min-w-0 items-baseline gap-kit-related">
              <ToolbarTitle>Connectors</ToolbarTitle>
              <p className="hidden truncate text-kit-meta text-kit-ink-muted @[56rem]/kit-workspace:block">
                What I read, and where I post.
              </p>
            </div>
          </Toolbar>
          <Toolbar label="Filters" size="filter">
            {/* The chips' line (28), so the row is as tall as the real one, hairline and all. */}
            <span aria-hidden className="h-7" />
          </Toolbar>
          <WorkspacePanes>
            <Panel label="Connectors">
              <PanelBody>
                <DataList
                  label="Connectors"
                  items={NO_ROWS}
                  getKey={(c) => c.id}
                  getLabel={(c) => c.name}
                  value={null}
                  onValueChange={() => {}}
                  columns={COLUMNS}
                  status="loading"
                  loadingLabel="Loading connectors"
                />
              </PanelBody>
            </Panel>
            <Panel label="Open connector" width="clamp(380px, 38cqi, 520px)" edge="start">
              <PanelBody>
                <PanelHeader>
                  <span aria-hidden />
                </PanelHeader>
              </PanelBody>
            </Panel>
          </WorkspacePanes>
          <KeyBar keys={KEYS} />
        </div>
      </div>
    </WorkspacePage>
  )
}
