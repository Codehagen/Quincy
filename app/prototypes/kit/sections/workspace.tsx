import * as React from "react"

import { DenseControls, PanelDemo, ToolbarDemo, WorkspaceDemo } from "../workspace-demos"
import { Code, Demo, P, type Section } from "../doc"

/**
 * The workspace components (docs/design/workspace.md): a dense working
 * surface, promoted from /prototypes/workspace-lab when the owner picked
 * Table for Ideas (2026-11-16). Not a dashboard: no tiles, no charts, one
 * number against the person's own week.
 */
export const workspace: Section[] = [
  {
    id: "workspace-controls",
    title: "Dense controls",
    group: "Workspace",
    doc: "buttons.md",
    body: (
      <>
        <P>
          A workspace is one px denser than a Card page. <Code>Button</Code>{" "}
          takes <Code>size=&quot;xs&quot;</Code> (28) and <Code>&quot;sm&quot;</Code> (32), the{" "}
          <Code>ghost</Code> variant (no surface at rest), and a{" "}
          <Code>shortcut</Code> cap. <Code>Kbd size=&quot;sm&quot;</Code> is the 18px cap,{" "}
          <Code>tone=&quot;on-ink&quot;</Code> on the ink pill. <Code>Tag look=&quot;text&quot;</Code>{" "}
          is a fact in a column. <Code>StatusMark</Code> is a row&apos;s state as a mark and a word.
        </P>
        <Demo caption="Ghost Clear, quiet Clear filters, sm Record with its icon at stroke 1.75, the ink action with its D cap, ghost Undo with U. Then caps, the text Tag beside the chip, and the four StatusMarks.">
          <DenseControls />
        </Demo>
      </>
    ),
  },
  {
    id: "toolbar",
    title: "Toolbar and FilterMenu",
    group: "Workspace",
    doc: "workspace.md",
    body: (
      <>
        <P>
          <Code>Toolbar</Code> is the page row (52, the shell bar) and the filter row
          (44) under it, one hairline under both. <Code>FilterMenu</Code> shows how
          many rows each value would leave; a 0 is disabled. <Code>SearchField size=&quot;sm&quot;</Code>{" "}
          is flat with the &quot;/&quot; that reaches it, and <Code>Segmented size=&quot;xs&quot;</Code>{" "}
          is the icon-only view switch.
        </P>
        <Demo backdrop="grid" caption="Pick a source: the chip turns white and Clear appears. RSS has nothing in it, so it cannot be picked. Under 40rem the search takes its own row.">
          <ToolbarDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "data-list",
    title: "DataList and KeyBar",
    group: "Workspace",
    doc: "workspace.md",
    body: (
      <>
        <P>
          <Code>DataList</Code> is a dense listbox with columns: 36px rows, a sticky
          32px head band, the open row grey with a 3px ink bar and its title at 560.
          ↑ ↓ and typeahead are the list&apos;s; j k N U are the page&apos;s, heard in the
          capture phase. <Code>KeyBar</Code> says them along the foot, and the Undo
          note takes its place at the same height.
        </P>
        <Demo caption="Click a row, then j and k. N sets the open idea aside, focus stays on the next row, and the Undo note replaces the key bar without moving anything; U brings it back. Loading keeps the grid; Empty keeps the heads.">
          <WorkspaceDemo />
        </Demo>
      </>
    ),
  },
  {
    id: "panel",
    title: "Panel",
    group: "Workspace",
    doc: "workspace.md",
    body: (
      <>
        <P>
          <Code>Panel</Code> is a pane of one surface, split by a hairline, each with
          its own scroll. <Code>PanelHeader</Code> is the 32px sticky strip on the
          head band&apos;s line. <Code>PanelBody scrollKey</Code> goes back to the top
          when another item opens.
        </P>
        <Demo caption="Scroll the right pane, then open another source: it starts at the top. Tab reaches the reading pane, with the ring drawn inside it.">
          <PanelDemo />
        </Demo>
      </>
    ),
  },
]
