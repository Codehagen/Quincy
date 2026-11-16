"use client"

import * as React from "react"

import { useLetterKeys, type LetterKeyMap } from "@/components/kit"

import type { Item, LineupStore } from "../use-lineup"

/**
 * The page's letter keys, the same in every layout (workspace.md, "Keys"):
 *
 * - j / k: the next / previous item in time order (the approved posts with
 *   no time first, then the week).
 * - ⇧J / ⇧K: the open post one place later / earlier on its own channel. It
 *   trades places with the next queued post (`reorderLineup`, both or
 *   neither), or takes the next open slot (`movePost`). Shift and a letter,
 *   not [ and ]: on a Norwegian Mac those need Option, which the kit's
 *   letter keys stand down for.
 * - M: the Move menu. P: Post now, which opens the confirmation (the
 *   dialog is the confirmation, so the key is safe). B: Back to Drafts. G:
 *   give an approved post its time. U: undo the last move. S: the slots.
 *
 * `useLetterKeys` matches letters in lower case, so a held Shift arrives
 * here as the same key with `shiftKey` set.
 */
export function useLineupKeys(
  store: LineupStore,
  { reveal, extra = {}, enabled = true, within }: { reveal: (key: string) => void; extra?: LetterKeyMap; enabled?: boolean; /** Only these items are stepped through (Feed: one platform). */ within?: (item: Item) => boolean }
) {
  const open = store.selected
  const post = open?.kind === "post" ? open.post : null

  const go = (by: 1 | -1) => {
    const key = store.step(by, within)
    if (key) reveal(key)
  }

  // An action moved the selection (a move, a send-back, an undo): bring it into view.
  const lastKey = React.useRef(store.selectedKey)
  React.useEffect(() => {
    if (store.selectedKey && store.selectedKey !== lastKey.current) reveal(store.selectedKey)
    lastKey.current = store.selectedKey
  }, [store.selectedKey, reveal])

  useLetterKeys(
    {
      j: (e) => (e.shiftKey ? (post ? store.shift(post.id, 1) : undefined) : go(1)),
      k: (e) => (e.shiftKey ? (post ? store.shift(post.id, -1) : undefined) : go(-1)),
      m: { once: true, run: () => (post?.state === "queued" ? store.setMenu(post.id) : undefined) },
      p: {
        once: true,
        run: () => {
          if (!open) return
          if (open.kind === "stranded" || (post && (post.state === "queued" || post.state === "failed"))) store.setConfirm(open.key)
        },
      },
      b: { once: true, run: () => (post && (post.state === "queued" || post.state === "failed") ? store.unschedule(post.id) : undefined) },
      g: { once: true, run: () => (open?.kind === "stranded" ? store.place(open.s.versionId) : undefined) },
      u: () => {
        store.undo()
      },
      s: { once: true, run: () => store.setRhythmOpen(true) },
      ...extra,
    },
    { enabled: enabled && store.phase === "live" }
  )
}

/** Scroll the item's element into view inside its own scroller and focus it, without moving the page. */
export function revealItem(key: string, block: ScrollLogicalPosition = "nearest") {
  const el = document.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"]`)
  if (!el) return
  el.scrollIntoView({ block, inline: "nearest" })
  if (document.activeElement?.closest("[data-item]") || document.activeElement === document.body) el.focus({ preventScroll: true })
}
