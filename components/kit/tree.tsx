"use client"

/*
 * Built on ui-sdk (@ui-sdk/react/tree), not Base UI: Base UI has no tree.
 * ui-sdk gives the WAI-ARIA tree pattern: one tab stop, Up/Down between
 * visible pages, Right opens and Left closes a branch, Home/End, typeahead on
 * the labels, and aria-level/posinset/setsize on every page.
 */

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import {
  Tree as TreeRoot,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "@ui-sdk/react/tree"

import { FOCUS_RING, HIT_40_44 } from "./control-styles"

export type TreeNode = {
  /** Unique across the tree: the page's slug or id. */
  value: string
  label: string
  /** Leading hugeicon. Decorative beside the label. */
  icon?: IconSvgElement
  /** Right-aligned and muted: a count, "updated 2d". */
  meta?: string
  children?: readonly TreeNode[]
  disabled?: boolean
}

export type TreeStatus = "idle" | "loading" | "error"

export type TreeProps = {
  items: readonly TreeNode[]
  /** The open page. Announced as current, shown in the selected grey. */
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (value: string | null) => void
  /** Branches open at first. The ancestors of `value` open too. */
  defaultExpanded?: string[]
  /** Names the tree: "Brain pages". */
  "aria-label": string
  status?: TreeStatus
  onRetry?: () => void
  /** Shown when `items` is empty and nothing is loading. */
  empty?: React.ReactNode
}

// The label is the visible row; the item (which holds focus) wraps the label
// and its children, so its ring and grey are drawn on its own label only.
const ITEM =
  "outline-none " +
  "[&:focus-visible>[data-slot=tree-label]]:outline-solid [&:focus-visible>[data-slot=tree-label]]:outline-2 [&:focus-visible>[data-slot=tree-label]]:outline-kit-focus " +
  // The open page is the selected grey at the same weight (as ListRow), so
  // its label and meta never reflow, and hover leaves it selected.
  "[&[data-selected]>[data-slot=tree-label]]:bg-kit-selected [&[data-selected]>[data-slot=tree-label]:hover]:bg-kit-selected " +
  "[&[data-expanded]>[data-slot=tree-label]_[data-slot=tree-indicator]]:rotate-90 " +
  "[&[data-disabled]>[data-slot=tree-label]]:opacity-50 [&[data-disabled]>[data-slot=tree-label]:hover]:bg-transparent"

const LABEL =
  "relative flex min-h-10 w-full min-w-0 cursor-default items-center gap-2 rounded-kit-control pr-4 text-kit-body text-kit-ink select-none pointer-coarse:min-h-11 " +
  // 16px per level, after the 12px row inset of the first.
  "pl-[calc(0.75rem+(var(--tree-level,1)-1)*1rem)] " +
  "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none hover:bg-kit-control-hover"

/**
 * The brain's pages as a hierarchy: a branch has a chevron that turns as it
 * opens, the open page is the selected grey (never blue), and rows are 40px
 * on a mouse, 44 on touch. Put it in a List-like column with the 6px row
 * inset, so the 12px rows nest in an 18px object.
 */
export function Tree({
  items,
  value,
  defaultValue,
  onValueChange,
  defaultExpanded,
  "aria-label": ariaLabel,
  status = "idle",
  onRetry,
  empty = "No pages yet. Quincy writes one after your first conversation.",
}: TreeProps) {
  if (status === "loading" && items.length === 0) {
    return (
      <p role="status" className="px-4 py-3 text-kit-ink-muted">
        Loading pages…
      </p>
    )
  }
  if (status === "error" && items.length === 0) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="text-kit-danger">Pages didn’t load.</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={`relative font-kit-strong text-kit-ink underline decoration-kit-link-line underline-offset-(--kit-link-offset) ${FOCUS_RING} ${HIT_40_44} rounded-kit-chip`}
          >
            Try again
          </button>
        ) : null}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="px-4 py-3 text-kit-ink-muted">{empty}</p>
  }
  // ui-sdk writes its own data-slot on the root, so the kit's sits on a
  // wrapper that takes no box (display: contents).
  return (
    <div data-slot="kit-tree" className="contents">
      <TreeRoot
        aria-label={ariaLabel}
        mode="single"
        // Arrows only move focus; Enter or a click opens the page. Opening a
        // brain page loads it, and arrowing past ten pages should not load ten.
        activation="manual"
        value={value}
        defaultValue={defaultValue ?? undefined}
        onValueChange={(next) => onValueChange?.(typeof next === "string" ? next : null)}
        defaultExpanded={defaultExpanded}
        className="flex flex-col gap-0.5"
      >
        <Nodes nodes={items} />
      </TreeRoot>
    </div>
  )
}

function Nodes({ nodes }: { nodes: readonly TreeNode[] }) {
  return nodes.map((node) => (
    <TreeItem key={node.value} value={node.value} label={node.label} disabled={node.disabled} className={ITEM}>
      <TreeItemLabel className={LABEL}>
        {node.children?.length ? (
          <TreeItemIndicator className="grid size-4 shrink-0 place-items-center text-kit-ink-muted transition-[rotate] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none">
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} aria-hidden />
          </TreeItemIndicator>
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        {node.icon ? (
          <HugeiconsIcon icon={node.icon} size={16} strokeWidth={2} aria-hidden className="shrink-0 text-kit-ink-muted" />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        {node.meta ? (
          <span className="shrink-0 font-kit-mono text-kit-mono text-kit-ink-muted">{node.meta}</span>
        ) : null}
      </TreeItemLabel>
      {node.children?.length ? (
        <TreeGroup className="flex flex-col gap-0.5 pt-0.5">
          <Nodes nodes={node.children} />
        </TreeGroup>
      ) : null}
    </TreeItem>
  ))
}
