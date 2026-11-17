"use client"

import { MagicWand01Icon, Mic01Icon } from "@hugeicons/core-free-icons"

import {
  Button,
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

import { IDEA_COLUMNS } from "./idea-cells"
import type { IdeaRow } from "./idea-rows"
import { DETAIL_WIDTH } from "./ideas-fold"
import { KEYS } from "./ideas-workspace"
import "./ideas.css"

const NO_ROWS: readonly IdeaRow[] = []

/**
 * /ideas while its reads are on the way (page.tsx's Suspense fallback): the
 * workspace's own frame at its final size, so nothing moves when the ideas
 * land. The title row, the filter row (empty), the heads over DataList's
 * eight static loading rows, the open idea's strip, and the keys. Under the
 * fold, the one column, without heads. The fold is the workspace's own CSS
 * (ideas.css), so the frame needs no script and paints at the side the page
 * will.
 */
function Rows({ columns }: { columns?: typeof IDEA_COLUMNS }) {
  return (
    <DataList
      label="Ideas"
      items={NO_ROWS}
      getKey={(r) => r.key}
      getLabel={(r) => r.title}
      value={null}
      onValueChange={() => {}}
      columns={columns}
      status="loading"
      loadingLabel="Loading ideas"
    />
  )
}

export function IdeasLoading() {
  return (
    <WorkspacePage>
      <div className="flex min-h-0 flex-1 flex-col">
        <Toolbar label="Ideas" divided={false}>
          <ToolbarTitle>Ideas</ToolbarTitle>
          {/* The real controls, inert until the page is: they take the same room,
              so a phone's toolbar wraps to the same two rows and nothing moves. */}
          <ToolbarGroup end grow>
            <span inert className="contents">
              <SearchField size="sm" shortcut="/" aria-label="Search ideas" placeholder="Search ideas" />
            </span>
          </ToolbarGroup>
          <ToolbarGroup>
            <span inert className="contents">
              <Button variant="quiet" size="sm" icon={Mic01Icon}>
                Record a thought
              </Button>
              <Button size="sm" icon={MagicWand01Icon}>
                Adapt a post
              </Button>
            </span>
          </ToolbarGroup>
        </Toolbar>
        <Toolbar label="Filters" size="filter">
          {/* The chips' line (28), so the row is as tall as the real one, hairline and all. */}
          <span aria-hidden className="h-7" />
        </Toolbar>
        <div className="ideas-folded">
          <PanelBody>
            <Rows />
          </PanelBody>
        </div>
        <div className="ideas-unfolded">
          <WorkspacePanes>
            <Panel label="Ideas">
              <PanelBody>
                <Rows columns={IDEA_COLUMNS} />
              </PanelBody>
            </Panel>
            <Panel label="Open idea" width={DETAIL_WIDTH} edge="start">
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
