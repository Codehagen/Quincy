"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { DENSE_HEIGHT, SEGMENT_HEIGHT, SEGMENT_ITEM, SEGMENT_THUMB, SEGMENT_TRACK } from "@/components/kit/control-styles"

import type { Filter } from "../data"
import type { ConnectorsStore } from "../use-connectors"

/**
 * The reference's tab strip with counts, on Base UI's Tabs and the kit's
 * segment styles (the same track, ink thumb and item as kit Tabs). Arrow keys
 * move along it, Home and End jump, Enter or Space picks.
 *
 * Proposed for the kit: `Tab` takes a `count`. Kit `Tab` takes a string
 * only, so this lab draws its own. The count is the label's colour at the
 * regular weight, never an alpha: on the ink thumb it is --kit-primary-on,
 * so it flips with the mode (AGENTS.md, a fill's label colour).
 */

export const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "connected", label: "Connected" },
  { value: "source", label: "Sources" },
  { value: "channel", label: "Channels" },
]

export function FilterTabs({
  store,
  children,
}: {
  store: ConnectorsStore
  /** What the tabs show: rendered once, inside the active panel. */
  children: React.ReactNode
}) {
  return (
    <TabsPrimitive.Root
      value={store.filter}
      onValueChange={(v) => store.setFilter(v as Filter)}
      className="contents"
    >
      {children}
    </TabsPrimitive.Root>
  )
}

export function FilterTabList({ store, size = "md" }: { store: ConnectorsStore; size?: "md" | "xs" }) {
  const height = size === "xs" ? DENSE_HEIGHT.xs : SEGMENT_HEIGHT.md
  return (
    // The strip scrolls inside itself on a phone rather than pushing the page sideways.
    <div className="-m-1 max-w-full overflow-x-auto p-1 [scrollbar-width:none]">
      <TabsPrimitive.List
        aria-label="Show"
        className={`${SEGMENT_TRACK} ${height} inline-flex ${size === "xs" ? "text-kit-dense" : ""}`}
      >
        <TabsPrimitive.Indicator className={`${SEGMENT_THUMB} top-1 bottom-1 left-(--active-tab-left) w-(--active-tab-width)`} />
        {FILTERS.map((f) => (
          <TabsPrimitive.Tab
            key={f.value}
            value={f.value}
            className={`${SEGMENT_ITEM} gap-1.5 ${size === "xs" ? "px-2.5" : ""} data-active:text-kit-primary-on data-active:hover:text-kit-primary-on`}
          >
            {f.label}
            <span className="font-kit-regular tabular-nums">{store.counts[f.value]}</span>
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>
    </div>
  )
}

/** One panel per tab; only the active one mounts its content. */
export function FilterPanels({ store, className, children }: { store: ConnectorsStore; className?: string; children: React.ReactNode }) {
  return (
    <>
      {FILTERS.map((f) => (
        <TabsPrimitive.Panel
          key={f.value}
          value={f.value}
          className={`outline-hidden ${className ?? ""}`}
          // The grid's cards are the tab stops; the panel itself is not one.
          tabIndex={-1}
        >
          {store.filter === f.value ? children : null}
        </TabsPrimitive.Panel>
      ))}
    </>
  )
}
