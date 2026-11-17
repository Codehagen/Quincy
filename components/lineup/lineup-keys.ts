"use client"

import * as React from "react"

import { useLetterKeys, type KeyBarItem } from "@/components/kit"

import type { Item } from "./lineup-model"
import type { LineupStore } from "./use-lineup"

/**
 * The page's letter keys, the same on the calendar and the Feed
 * (docs/design/workspace.md, "Keys"):
 *
 * - j / k: the next / previous item (the approved posts with no time first,
 *   then the week in time order).
 * - ⇧J / ⇧K: the open post one place later / earlier on its own channel.
 *   Shift and a letter, not [ and ]: on a Norwegian Mac those need Option,
 *   which the kit's letter keys stand down for.
 * - M the Move menu. P Post now, which opens the confirmation (the dialog is
 *   the confirmation, so the key is safe). B Back to Drafts. G give an
 *   approved post its time. U undo the last move. S the slots.
 *
 * `useLetterKeys` matches letters in lower case, so a held Shift arrives
 * here as the same key with `shiftKey` set.
 */
export function useLineupKeys(store: LineupStore, { reveal, within }: { reveal: (key: string) => void; /** Only these items are stepped through (the Feed: one platform). */ within?: (item: Item) => boolean }) {
  const open = store.selected
  const post = open?.kind === "post" ? open.post : null

  const go = (by: 1 | -1) => {
    const key = store.step(by, within)
    if (key) reveal(key)
  }

  // An action moved the selection (a move, an undo): bring it into view.
  const lastKey = React.useRef(store.selectedKey)
  React.useEffect(() => {
    if (store.selectedKey && store.selectedKey !== lastKey.current) reveal(store.selectedKey)
    lastKey.current = store.selectedKey
  }, [store.selectedKey, reveal])

  useLetterKeys({
    j: (e) => (e.shiftKey ? (post ? store.shift(post.id, 1) : undefined) : go(1)),
    k: (e) => (e.shiftKey ? (post ? store.shift(post.id, -1) : undefined) : go(-1)),
    m: { once: true, run: () => (post?.state === "queued" ? store.setMenu(post.id) : undefined) },
    p: {
      once: true,
      run: () => {
        if (!open) return
        if (open.kind === "unplaced" || (post && (post.state === "queued" || post.state === "failed"))) store.setConfirm(open.key)
      },
    },
    b: { once: true, run: () => (post && (post.state === "queued" || post.state === "failed") ? store.unschedule(post.id) : undefined) },
    g: { once: true, run: () => (open?.kind === "unplaced" && open.reason !== "slots-full" ? store.place(open.unplaced.versionId) : undefined) },
    u: { once: true, run: () => store.undo() },
    s: { once: true, run: () => store.setSlotsOpen(true) },
  })
}

/** The calendar's keys: the grid's own, then the page's. */
export const CALENDAR_KEYS: readonly KeyBarItem[] = [
  { keys: ["←", "↑", "↓", "→"], label: "Time" },
  { keys: ["Enter"], label: "Pick up, drop" },
  { keys: ["⇧↑", "⇧↓"], label: "An hour" },
  { keys: ["Esc"], label: "Put back" },
  { keys: ["P"], label: "Post now" },
  { keys: ["B"], label: "Back to Drafts" },
  { keys: ["U"], label: "Undo" },
  { keys: ["S"], label: "Slots" },
]

/** The Feed's keys. */
export const FEED_KEYS: readonly KeyBarItem[] = [
  { keys: ["j", "k"], label: "Move" },
  { keys: ["⇧J", "⇧K"], label: "Later, earlier" },
  { keys: ["M"], label: "Move to…" },
  { keys: ["P"], label: "Post now" },
  { keys: ["B"], label: "Back to Drafts" },
  { keys: ["U"], label: "Undo" },
  { keys: ["S"], label: "Slots" },
]
