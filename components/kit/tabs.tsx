"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import type { AccessibleName } from "./a11y"
import {
  DENSE_HEIGHT,
  FOCUS_RING,
  SEGMENT_HEIGHT,
  SEGMENT_ITEM,
  SEGMENT_THUMB,
  SEGMENT_TRACK,
  type ControlSize,
} from "./control-styles"

type Unstyled<P> = Omit<P, "className" | "style" | "render">

export type TabsProps = Omit<
  Unstyled<TabsPrimitive.Root.Props>,
  "value" | "defaultValue" | "onValueChange" | "orientation"
> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /**
   * `stack` (default): the strip, then its panel, 16 apart, content-width.
   * `fill`: a workspace (docs/design/workspace.md), where the strip sits in
   * a Toolbar and the panel takes the rest of the column. The root adds no
   * box of its own, and each panel is a flex column that fills.
   */
  layout?: "stack" | "fill"
  children: React.ReactNode
}

/**
 * Tabs look exactly like Segmented and differ only in what they mean:
 * Segmented picks a VALUE (radiogroup, arrows select, submits with a form);
 * Tabs swap a PANEL (tablist + tabpanel, each tab controls its panel). If
 * the picked thing changes what is shown below, it is Tabs.
 *
 * ```tsx
 * <Tabs defaultValue="drafts">
 *   <TabList aria-label="Pieces">
 *     <Tab value="drafts">Drafts</Tab>
 *     <Tab value="sent">Sent</Tab>
 *   </TabList>
 *   <TabPanel value="drafts">…</TabPanel>
 *   <TabPanel value="sent">…</TabPanel>
 * </Tabs>
 * ```
 */
export function Tabs({ onValueChange, layout = "stack", ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      {...props}
      onValueChange={(v) => onValueChange?.(String(v))}
      data-slot="kit-tabs"
      data-layout={layout}
      className={layout === "fill" ? "group/kit-tabs contents" : "group/kit-tabs flex flex-col items-start gap-kit-stack"}
    />
  )
}

export type TabListProps = Omit<
  Unstyled<TabsPrimitive.List.Props>,
  "aria-label" | "aria-labelledby" | "children"
> &
  AccessibleName & {
    children: React.ReactNode
    /**
     * `md` (36px) is the app default; `lg` (44px) beside a hero action;
     * `xs` (28px) only in a workspace's filter Toolbar, beside its other
     * dense controls.
     */
    size?: ControlSize | "xs"
  }

/**
 * The pill of tabs. Tabs are content-width (unlike Segmented's equal
 * segments), so the tint is Base UI's measured indicator. Arrow keys move
 * focus; Enter/Space activates (activateOnFocus off), so arrowing past a
 * heavy panel does not render it.
 */
export function TabList({ children, size = "md", ...props }: TabListProps) {
  return (
    <TabsPrimitive.List
      {...props}
      data-slot="kit-tab-list"
      data-size={size}
      className={`${SEGMENT_TRACK} ${size === "xs" ? `${DENSE_HEIGHT.xs} group/kit-tab-list text-kit-dense` : SEGMENT_HEIGHT[size]} inline-flex`}
    >
      <TabsPrimitive.Indicator
        className={`${SEGMENT_THUMB} top-1 bottom-1 left-(--active-tab-left) w-(--active-tab-width)`}
      />
      {children}
    </TabsPrimitive.List>
  )
}

export type TabProps = Omit<Unstyled<TabsPrimitive.Tab.Props>, "value" | "children"> & {
  value: string
  children: string
  /**
   * How many the panel holds ("Connected 4"), after the label at the
   * regular weight and in tabular figures, so a count that changes by one
   * digit never moves the strip. It takes the label's colour, never an
   * alpha: on the ink thumb that is --kit-primary-on, which flips with the
   * mode. Said with the label ("Connected, 4").
   */
  count?: number
}

export function Tab({ children, count, ...props }: TabProps) {
  return (
    <TabsPrimitive.Tab
      {...props}
      data-slot="kit-tab"
      className={`${SEGMENT_ITEM} gap-1.5 group-data-[size=xs]/kit-tab-list:px-2.5 data-active:text-kit-primary-on data-active:hover:text-kit-primary-on`}
    >
      {children}
      {count != null ? (
        <>
          <span className="sr-only">, </span>
          <span className="font-kit-regular tabular-nums">{count}</span>
        </>
      ) : null}
    </TabsPrimitive.Tab>
  )
}

export type TabPanelProps = Omit<Unstyled<TabsPrimitive.Panel.Props>, "value"> & {
  value: string
  children: React.ReactNode
}

/**
 * Focusable as a whole (Base UI), so it carries the kit's focus ring. In a
 * `fill` layout it is a flex column that takes the rest of the workspace;
 * pass `tabIndex={-1}` there when the panel's own list is the tab stop.
 */
export function TabPanel({ children, ...props }: TabPanelProps) {
  return (
    <TabsPrimitive.Panel
      {...props}
      data-slot="kit-tab-panel"
      className={`w-full rounded-kit-object ${FOCUS_RING} group-data-[layout=fill]/kit-tabs:flex group-data-[layout=fill]/kit-tabs:min-h-0 group-data-[layout=fill]/kit-tabs:flex-1 group-data-[layout=fill]/kit-tabs:flex-col group-data-[layout=fill]/kit-tabs:rounded-none`}
    >
      {children}
    </TabsPrimitive.Panel>
  )
}
