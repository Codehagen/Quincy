"use client"

import * as React from "react"

import { optionsFor, type StatusFilter } from "../data"
import { FilterMenu, type FilterOption } from "../parts/filters"
import { IdeaTable } from "../parts/idea-table"
import { MarkedUp } from "../parts/marked-up"
import { Panel, PanelBody, PanelHeader } from "../parts/panel"
import { SourceRail } from "../parts/source-rail"
import { useWorkspaceKeys, type Workspace } from "../use-workspace"
import { Announcer, Foot, PageBar } from "./header"

/**
 * B · Three panes. What Quincy read on the left (a rail of sources with
 * their state), the ideas from the picked source in the middle, the open
 * idea Marked up on the right, given the most room. The mail client's
 * shape: the source is a first-class thing again, as it was on /ideas.
 */
export function ThreePaneLayout({ ws, keys }: { ws: Workspace; keys: boolean }) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  useWorkspaceKeys(ws, { enabled: keys, searchRef })
  const f = ws.filters
  const picked = f.riff === "all" ? null : ws.rows.find((r) => r.riff.id === f.riff)?.riff

  return (
    // data-letter-keys: bare letters here are the workspace's (the theme key stands down).
    <div data-letter-keys className="@container/ws flex h-full min-h-0 flex-col bg-kit-ground">
      <Announcer>
      <PageBar ws={ws} searchRef={searchRef} searchWidth="w-64" />
      <div className="flex min-h-0 flex-1">
        <Panel pane="rail" label="What Quincy read" width="var(--ws-rail-w)">
          <PanelHeader>What I read</PanelHeader>
          <PanelBody>
            <SourceRail ws={ws} />
          </PanelBody>
        </Panel>
        <Panel pane="list" label="Ideas" width="22rem" afterRail>
          <PanelHeader
            end={
              <FilterMenu<StatusFilter>
                label="Status"
                value={f.status}
                options={optionsFor(ws.rows, f, "status") as FilterOption<StatusFilter>[]}
                onValueChange={(v) => ws.setFilter("status", v)}
              />
            }
          >
            {picked ? picked.sourceLabel : "Every idea"}
            <span className="ms-2 font-kit-mono font-kit-regular tabular-nums">{ws.shown.length}</span>
          </PanelHeader>
          <PanelBody>
            <IdeaTable ws={ws} variant="list" />
          </PanelBody>
        </Panel>
        <Panel pane="detail" label="Open idea">
          <PanelBody label="Where the idea came from">
            <div className="mx-auto max-w-[52rem]">
              <MarkedUp ws={ws} row={ws.selected} />
            </div>
          </PanelBody>
        </Panel>
      </div>
      <Foot ws={ws} />
      </Announcer>
    </div>
  )
}
