"use client"

import * as React from "react"

import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { formatMultiple, type AngleRow } from "@/lib/numbers"
import { cn } from "@/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

/**
 * The ledger: one row per angle, the posts filed under it as evidence.
 *
 * The row is the unit, not the post. Ranking posts tells you which tweet did
 * well — a fact you cannot act on. Ranking the shapes you write in tells you
 * what to write next, which is the only thing this page is for.
 */
export function AngleLedger({ rows }: { rows: AngleRow[] }) {
  // The widest bar sets the scale, in log space for the same reason the
  // multiples themselves are ratios: a group at 6× and a group at 0.4× are
  // equally far from the line in opposite directions, and a linear width would
  // draw the second as almost nothing.
  //
  // `Math.max()` with no arguments is -Infinity, which propagates into every
  // width as NaN. The `|| 1` is the guard, not decoration — a single group
  // sitting exactly on the median gives a legitimate 0 here.
  const widest =
    Math.max(0, ...rows.map((r) => Math.abs(Math.log2(r.medianMultiple || 1)))) ||
    1

  return (
    <div className="flex flex-col">
      {rows.map((row, i) => (
        <AngleLedgerRow
          key={row.id}
          row={row}
          widest={widest}
          // The best angle is the answer to the question the page asks, so it
          // is open on arrival. Everything else waits to be asked for — five
          // groups expanded at once is a list of 57 posts with headings in it.
          defaultOpen={i === 0}
        />
      ))}
    </div>
  )
}

function AngleLedgerRow({
  row,
  widest,
  defaultOpen,
}: {
  row: AngleRow
  widest: number
  defaultOpen: boolean
}) {
  const up = row.medianMultiple >= 1
  const width = (Math.abs(Math.log2(row.medianMultiple || 1)) / widest) * 100

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="border-border border-b last:border-0"
    >
      {/* h2 wraps the trigger rather than the trigger being an h2: the heading
          is what a screen reader lists when jumping through the page, and the
          button is what it activates. Collapsing the two loses one or the
          other. */}
      <h2>
        <CollapsibleTrigger
          className={cn(
            // The group lives on the trigger, not on the root: Base UI sets
            // `data-panel-open` here, and hanging it on the root leaves the
            // chevron pointing right at an open row.
            "group/angle flex w-full items-center gap-4 rounded-xs py-4 text-left",
            "transition-colors duration-150 ease-out",
            "hover:bg-accent",
            // Colour, not scale(0.96): this row is the full content width, and
            // scaling an 900px band reads as the page flexing rather than as a
            // control going down.
            "active:bg-secondary",
            "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
          )}
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowRight01Icon}
            strokeWidth={1.8}
            // Shares the panel's curve and duration — a disclosure and its
            // indicator are one gesture.
            className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-panel-open/angle:rotate-90"
          />

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline gap-2">
              <span className="truncate font-medium">{row.label}</span>
              <span className="tabular text-muted-foreground shrink-0 text-xs">
                {row.posts.length}
              </span>
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {row.note}
            </span>
          </span>

          {/* One hue for magnitude, not a rainbow across the rows: length
              already encodes rank, which frees hue to carry the one thing
              length cannot — which side of the line the group sits on. */}
          <span
            aria-hidden="true"
            className="hidden h-1.5 w-40 shrink-0 items-center sm:flex"
          >
            <span
              className={cn(
                "h-full rounded-full",
                up ? "bg-gain" : "bg-shortfall"
              )}
              // A group exactly on the median has zero length and would vanish;
              // 4% is the floor that keeps it a mark rather than an absence.
              style={{ width: `${Math.max(4, width)}%` }}
            />
          </span>

          <span
            className={cn(
              "tabular w-16 shrink-0 text-right font-medium",
              up ? "text-gain-ink" : "text-shortfall-ink"
            )}
          >
            {formatMultiple(row.medianMultiple)}
          </span>
        </CollapsibleTrigger>
      </h2>

      {/* Height is a layout property and normally off-limits, but a disclosure
          genuinely changes layout and Base UI hands us the measured height as a
          variable, so there is nothing to re-measure. Same values as the draft
          card and the reasoning panel, deliberately — three disclosures in one
          product should not open at three speeds. `prefers-reduced-motion` is
          handled globally in app/globals.css. */}
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:h-0 data-ending-style:opacity-0 data-ending-style:duration-150 data-ending-style:ease-in data-starting-style:h-0 data-starting-style:opacity-0">
        <ol className="mb-4 ml-8 flex flex-col gap-px">
          {row.posts.map((post) => (
            // Two lines under `sm`, one line above it. Held on one line at
            // 375px the three figures keep their widths and the hook is left
            // with about two characters — which deletes the only part of the
            // row worth reading. `sm:contents` dissolves the metadata wrapper
            // at the breakpoint so the figures rejoin the row flex and keep
            // their columns.
            <li
              key={post.id}
              className={cn(
                "flex flex-col gap-1 rounded-xs px-2 py-2 sm:flex-row sm:items-baseline sm:gap-4",
                post.multiple >= 1 ? "bg-gain-soft" : "bg-shortfall-soft"
              )}
            >
              {/* The link is the hook, not a trailing icon: the words are what
                  you want to reread, and they are already the biggest target
                  in the row. Rows imported before `url` existed carry an empty
                  string, so the anchor is earned rather than assumed — a link
                  to nowhere is worse than text. */}
              {post.url ? (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="decoration-muted-foreground/40 min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline"
                >
                  {post.hook}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm">
                  {post.hook}
                </span>
              )}
              <span className="flex items-baseline gap-4 sm:contents">
                <span className="tabular text-muted-foreground shrink-0 text-xs">
                  {post.date}
                </span>
                <span className="tabular shrink-0 text-sm sm:w-16 sm:text-right">
                  {post.impressions.toLocaleString("en-US")}
                </span>
                <span
                  className={cn(
                    "tabular shrink-0 text-sm font-medium sm:w-14 sm:text-right",
                    post.multiple >= 1 ? "text-gain-ink" : "text-shortfall-ink"
                  )}
                >
                  {formatMultiple(post.multiple)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}
