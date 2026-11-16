"use client"

import * as React from "react"

import type { LabOptions } from "../lab-options"
import { PostPane, type PostLook } from "../parts/post-pane"
import type { DraftsStore } from "../use-drafts"
import { TableLayout, type PaneSpec } from "./table"

/**
 * Round 2 (owner, 2026-11-16): the Table's left side unchanged, the right
 * pane replaced by the post itself. The pane takes what the list leaves:
 * the list keeps `listKeep` (default 580, so its title column holds 283 and
 * 1440 and 1280 stay a table), and the post gets the rest, from 440 to 860.
 * Under the fold it is Lineup, whose open row unfolds into the same post.
 */

const PANE_MIN = 440
const PANE_MAX = 860

function spec(look: PostLook): PaneSpec {
  return {
    width: (o) => `clamp(${PANE_MIN}px, calc(100cqi - ${o.listKeep}px), ${PANE_MAX}px)`,
    widthAt: (w, o) => Math.min(PANE_MAX, Math.max(PANE_MIN, w - o.listKeep)),
    render: (row, store) => <PostPane row={row} store={store} look={look} />,
  }
}

const EDITOR = spec("editor")
const STAGE = spec("stage")
const FEED = spec("feed")

export function PostEditorLayout({ store, opts }: { store: DraftsStore; opts: LabOptions }) {
  return <TableLayout store={store} opts={opts} pane={EDITOR} />
}
export function PostStageLayout({ store, opts }: { store: DraftsStore; opts: LabOptions }) {
  return <TableLayout store={store} opts={opts} pane={STAGE} />
}
export function PostFeedLayout({ store, opts }: { store: DraftsStore; opts: LabOptions }) {
  return <TableLayout store={store} opts={opts} pane={FEED} />
}
