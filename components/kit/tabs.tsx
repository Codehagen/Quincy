"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import type { AccessibleName } from "./a11y"
import {
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
export function Tabs({ onValueChange, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      {...props}
      onValueChange={(v) => onValueChange?.(String(v))}
      data-slot="kit-tabs"
      className="flex flex-col items-start gap-kit-stack"
    />
  )
}

export type TabListProps = Omit<
  Unstyled<TabsPrimitive.List.Props>,
  "aria-label" | "aria-labelledby" | "children"
> &
  AccessibleName & {
    children: React.ReactNode
    /** `md` (36px) is the app default; `lg` (44px) beside a hero action. */
    size?: ControlSize
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
      className={`${SEGMENT_TRACK} ${SEGMENT_HEIGHT[size]} inline-flex`}
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
}

export function Tab({ children, ...props }: TabProps) {
  return (
    <TabsPrimitive.Tab
      {...props}
      data-slot="kit-tab"
      className={`${SEGMENT_ITEM} data-active:text-kit-primary-on data-active:hover:text-kit-primary-on`}
    >
      {children}
    </TabsPrimitive.Tab>
  )
}

export type TabPanelProps = Omit<Unstyled<TabsPrimitive.Panel.Props>, "value"> & {
  value: string
  children: React.ReactNode
}

/** Focusable as a whole (Base UI), so it carries the kit's focus ring. */
export function TabPanel({ children, ...props }: TabPanelProps) {
  return (
    <TabsPrimitive.Panel
      {...props}
      data-slot="kit-tab-panel"
      className={`w-full rounded-kit-object ${FOCUS_RING}`}
    >
      {children}
    </TabsPrimitive.Panel>
  )
}
