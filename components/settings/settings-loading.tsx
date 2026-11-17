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

import { COLUMNS, KEYS, LIST_OUTER, LIST_TRACKS, PANE_WIDTH, UNFOLDED } from "./settings-desk"
import type { Item } from "./settings-rows"

const NO_ROWS: readonly Item[] = []

/**
 * /settings while its reads are on the way (page.tsx's Suspense fallback):
 * the desk's own frame at its final size, so nothing moves when the account
 * lands (states.md). The title row, the filter row (empty), the list's
 * heads over DataList's static loading rows, the pane's strip, and the
 * keys. The pane is the workspace's own CSS fold, so under 900px the frame
 * is the one column, with no script.
 */
export function SettingsLoading() {
  return (
    <WorkspacePage>
      <div className="flex min-h-0 flex-1 flex-col">
        <Toolbar label="Settings" divided={false}>
          <ToolbarTitle>Settings</ToolbarTitle>
          {/* The real search, inert until the page is: it takes the same room,
              so a phone's toolbar wraps to the same two rows. */}
          <ToolbarGroup end grow>
            <span inert className="contents">
              <SearchField size="sm" shortcut="/" aria-label="Search settings" placeholder="Search settings" />
            </span>
          </ToolbarGroup>
        </Toolbar>
        <Toolbar label="Filters" size="filter">
          {/* The chips' line (28), so the row is as tall as the real one. */}
          <span aria-hidden className="h-7" />
        </Toolbar>
        <WorkspacePanes>
          <Panel label="Settings">
            <PanelBody>
              <div className={LIST_OUTER}>
                <div className={LIST_TRACKS}>
                  <DataList
                    label="Settings"
                    items={NO_ROWS}
                    getKey={(i) => i.id}
                    getLabel={(i) => i.title}
                    value={null}
                    onValueChange={() => {}}
                    columns={COLUMNS}
                    status="loading"
                    loadingLabel="Loading settings"
                  />
                </div>
              </div>
            </PanelBody>
          </Panel>
          <div className={UNFOLDED}>
            <Panel label="The open setting" width={PANE_WIDTH} edge="start">
              <PanelBody>
                <PanelHeader>
                  <span aria-hidden />
                </PanelHeader>
              </PanelBody>
            </Panel>
          </div>
        </WorkspacePanes>
        <KeyBar keys={KEYS} />
      </div>
    </WorkspacePage>
  )
}
