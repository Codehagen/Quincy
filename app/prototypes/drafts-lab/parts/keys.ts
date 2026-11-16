"use client"

import * as React from "react"

import { revealDataListRow, useLetterKeys } from "@/components/kit"

import type { DraftsStore } from "../use-drafts"

/**
 * The page's letter keys, the same in every layout (workspace.md, "Keys"):
 * j / k move through what the filters show, A approves the open draft's
 * first undecided version, E edits it (from Preview it goes back to Marked
 * up first), P switches the open draft between Marked up and Preview, U
 * undoes the last approval, / goes to the search. Discard has no key: it is a hold, and a hold is the
 * confirmation (removing.md). Post now has none: it is irreversible.
 *
 * `useLetterKeys` listens in the capture phase and ignores keys in a field,
 * with a modifier, and inside an open menu or dialog.
 */
export function useDraftKeys(store: DraftsStore, searchRef: React.RefObject<HTMLInputElement | null>, { enabled = true } = {}) {
  // Where the open row last stood: when it leaves the view, j / k carry on from there.
  const lastAt = React.useRef(0)
  React.useLayoutEffect(() => {
    const i = store.shown.findIndex((r) => r.id === store.selected?.id)
    if (i >= 0) lastAt.current = i
  })

  const move = (by: 1 | -1) => {
    const list = store.shown
    if (list.length === 0) return
    const i = list.findIndex((r) => r.id === store.selected?.id)
    const to = i >= 0 ? i + by : by > 0 ? lastAt.current : lastAt.current - 1
    const next = list[Math.min(list.length - 1, Math.max(0, to))]!
    store.select(next.id)
    revealDataListRow(next.id)
  }

  // An action moved the selection (an approval that finished the piece, a
  // discard): follow it with focus, since the pressed button is gone.
  React.useEffect(() => {
    if (store.moved) revealDataListRow(store.moved.id, document, { recover: true })
  }, [store.moved])

  const open = store.selected
  const firstWriting = open?.draft.versions.find((v) => v.state === "writing")

  useLetterKeys(
    {
      j: () => move(1),
      k: () => move(-1),
      "/": () => searchRef.current?.focus(),
      a: { once: true, run: () => (open && firstWriting ? store.approve(open, firstWriting.id) : undefined) },
      e: { once: true, run: () => (firstWriting ? store.setEditing(firstWriting.id) : undefined) },
      p: { once: true, run: () => (open ? store.togglePreview(open) : undefined) },
      u: () => {
        const id = store.undo()
        if (id) revealDataListRow(id, document, { recover: true })
      },
    },
    { enabled }
  )

  return { move }
}
