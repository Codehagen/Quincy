"use client"

import {
  DataList,
  KeyBar,
  Panel,
  PanelBody,
  PanelHeader,
  SearchField,
  Toolbar,
  ToolbarGroup,
  ToolbarTitle,
  WorkspacePage,
  WorkspacePanes,
} from "@/components/kit"

import { DRAFT_COLUMNS } from "./draft-cells"
import type { Row } from "./draft-rows"
import { FOLDED, PANE_PX, UNFOLDED } from "./drafts-fold"
import { KEYS } from "./drafts-workspace"

const NO_ROWS: readonly Row[] = []

/**
 * /drafts while its reads are on the way (page.tsx's Suspense fallback):
 * the workspace's own frame at its final size, so nothing moves when the
 * drafts land. The title row, the filter row (empty), the table's heads over
 * DataList's eight static loading rows, the open-draft pane's strip, and the
 * keys. Under the fold, the one column, without heads. The fold is the
 * workspace's own CSS (FOLDED / UNFOLDED), so the frame needs no script and
 * paints at the side the page will.
 */
function Rows({ columns }: { columns?: typeof DRAFT_COLUMNS }) {
  return (
    <DataList
      label="Drafts"
      items={NO_ROWS}
      getKey={(r) => r.id}
      getLabel={(r) => r.id}
      value={null}
      onValueChange={() => {}}
      columns={columns}
      status="loading"
      loadingLabel="Loading drafts"
    />
  )
}

export function DraftsLoading() {
  return (
    <WorkspacePage>
      <div className="flex min-h-0 flex-1 flex-col">
        <Toolbar label="Drafts" divided={false}>
          <ToolbarTitle>Drafts</ToolbarTitle>
          {/* The real search, inert until the page is: it takes the same room,
              so a phone's toolbar wraps to the same two rows and nothing moves. */}
          <ToolbarGroup end grow>
            <span inert className="contents">
              <SearchField size="sm" shortcut="/" aria-label="Search drafts" placeholder="Search drafts" />
            </span>
          </ToolbarGroup>
        </Toolbar>
        <Toolbar label="Filters" size="filter">
          {/* The chips' line (28), so the row is as tall as the real one, hairline and all. */}
          <span aria-hidden className="h-7" />
        </Toolbar>
        <div className={FOLDED}>
          <PanelBody>
            <Rows />
          </PanelBody>
        </div>
        <div className={UNFOLDED}>
          <WorkspacePanes>
            <Panel label="Drafts">
              <PanelBody>
                <Rows columns={DRAFT_COLUMNS} />
              </PanelBody>
            </Panel>
            <Panel label="Open draft" width={`${PANE_PX}px`} edge="start">
              <PanelBody>
                <PanelHeader>
                  <span aria-hidden />
                </PanelHeader>
              </PanelBody>
            </Panel>
          </WorkspacePanes>
        </div>
        <KeyBar keys={KEYS} />
      </div>
    </WorkspacePage>
  )
}
