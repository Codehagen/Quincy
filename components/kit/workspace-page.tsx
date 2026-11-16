import * as React from "react"

import { Announcer } from "./announcer"

/**
 * The frame of a workspace page (docs/design/workspace.md, docs/design/page.md
 * "Workspace"): the whole content column under the shell, full bleed and full
 * height, where a KitPage is a 720 column with a 28px title. The page's
 * children are its Toolbars, a row of Panels and a foot, in that order:
 *
 * ```tsx
 * <WorkspacePage>
 *   <Toolbar label="Ideas" divided={false}>…</Toolbar>
 *   <Toolbar label="Filters" size="filter">…</Toolbar>
 *   <WorkspacePanes>
 *     <Panel label="Ideas">…</Panel>
 *     <Panel label="Open idea" width="clamp(440px, 36cqi, 560px)" edge="start">…</Panel>
 *   </WorkspacePanes>
 *   <KeyBar keys={…} />
 * </WorkspacePage>
 * ```
 *
 * What it owns:
 * - **Height.** It fills `<main>` (a flex column with a definite height in
 *   AppShell), so each pane scrolls inside itself and the toolbars and the
 *   foot never scroll away.
 * - **One Announcer** for the surface, mounted with it and never remounted.
 * - **`data-letter-keys`**, so the app's bare D (theme) stands down while
 *   the page's own letter keys (useLetterKeys) are live.
 * - **A size container** (`kit-workspace`), so a fixed pane's width is a
 *   share of the workspace in `cqi`, never of the viewport: the sidebar is
 *   not the page's.
 * - **The shell's corner.** With the desktop sidebar hidden, its Show control
 *   sits in the column's top-left corner, and AppShell says how wide that
 *   corner is in `--kit-shell-inset`; the first Toolbar starts its controls
 *   past it.
 */
export type WorkspacePageProps = {
  children: React.ReactNode
  /** The element to measure (a fold decision); the frame's root. */
  ref?: React.Ref<HTMLDivElement>
}

export function WorkspacePage({ children, ref }: WorkspacePageProps) {
  return (
    <div
      ref={ref}
      data-slot="kit-workspace"
      data-letter-keys
      className="@container/kit-workspace flex min-h-0 w-full flex-1 flex-col [&_[data-slot=kit-toolbar]:first-of-type]:ps-[max(var(--spacing-kit-group),var(--kit-shell-inset,0px))]"
    >
      <Announcer>{children}</Announcer>
    </div>
  )
}

/** The row of Panels between the toolbars and the foot: takes what is left, never scrolls itself. */
export function WorkspacePanes({ children }: { children: React.ReactNode }) {
  return (
    <div data-slot="kit-workspace-panes" className="flex min-h-0 flex-1">
      {children}
    </div>
  )
}
