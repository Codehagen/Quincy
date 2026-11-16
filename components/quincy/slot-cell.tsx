"use client"

import * as React from "react"

import { ListRow, Mono } from "@/components/kit"
import { againstMedian } from "@/lib/against-median"
import type { Slot } from "@/lib/lineup"

/**
 * One opening in the week: its hour, its channel, and what is in it
 * (plans/030 #6; lab 19, 26, 28). A kit ListRow, so it sits in a `List` and
 * pressing it picks the slot (fill it, open the composer, move a post here).
 */

/**
 * Your own numbers at this slot's hour.
 *
 * **Data gap.** Nothing in lib/ computes this yet: `Slot` carries no median,
 * and lib/numbers.ts scores posts against the whole corpus, not by hour. Lab
 * 19 and 28 rely on it. The prop is typed so the cell is ready; leave it out
 * until a reader groups `post_metric` / `source_item` by posting hour.
 */
export type SlotMedian = {
  /** Median views of your posts at this hour on this channel. */
  views: number
  /** How many posts that median is over. Under 3 it is not said. */
  posts: number
  /** Your overall median (`NumbersView.median`), to state it against. */
  overall: number
}

/**
 * `upcoming` (default) and `next` are ahead; `past` is history and cannot be
 * picked. The page knows the clock, so it says which.
 */
export type SlotTiming = "upcoming" | "next" | "past"

export type SlotCellProps = {
  /** The standing slot, from `getLineup` (lib/lineup.ts `Slot`). */
  slot: Slot
  timing?: SlotTiming
  /** The opening line of the entry filling it (`Entry.opening`). */
  filledTitle?: string
  median?: SlotMedian
  /** The slot whose detail or composer is showing. */
  selected?: boolean
  onSelect: () => void
}

/** The cell's state, from the slot and the clock. */
export type SlotState = "open" | "next" | "filled" | "unused" | "past"

export function slotState(slot: Pick<Slot, "filledBy">, timing: SlotTiming = "upcoming"): SlotState {
  const filled = slot.filledBy != null
  if (timing === "past") return filled ? "past" : "unused"
  if (filled) return "filled"
  return timing === "next" ? "next" : "open"
}

const TITLE: Record<Exclude<SlotState, "filled" | "past">, string> = {
  open: "Open",
  next: "Open, and next",
  unused: "Went unused",
}

function medianWords(m: SlotMedian | undefined): string | null {
  if (!m || m.posts < 3) return null
  const against = againstMedian({ value: m.views, median: m.overall })
  return `${m.views.toLocaleString("en-US")} views over your last ${m.posts} here. ${against.text}`
}

export function SlotCell({
  slot,
  timing = "upcoming",
  filledTitle,
  median,
  selected = false,
  onSelect,
}: SlotCellProps) {
  const state = slotState(slot, timing)
  const title = state === "filled" || state === "past" ? (filledTitle ?? "Filled") : TITLE[state]
  const words = medianWords(median)

  return (
    <ListRow
      data-state={state}
      selected={selected}
      disabled={timing === "past"}
      titleLines={state === "filled" || state === "past" ? 2 : 1}
      description={words ? `${slot.channelLabel} · ${words}` : slot.channelLabel}
      meta={<Mono tone={state === "next" ? "ink" : "muted"}>{slot.label}</Mono>}
      onClick={onSelect}
    >
      {title}
    </ListRow>
  )
}
