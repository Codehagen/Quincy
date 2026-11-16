"use client"

import * as React from "react"

import { formatMultiple, type AngleRow } from "@/lib/numbers"
import { Accordion, AccordionItem, Mono, Text, TextLink } from "@/components/kit"

/**
 * The ledger: one row per angle, the posts filed under it as evidence.
 *
 * The row is the unit, not the post. Ranking posts tells you which tweet did
 * well — a fact you cannot act on. Ranking the shapes you write in tells you
 * what to write next, which is the only thing this page is for.
 *
 * On the kit since 2026-11-16: an Accordion (several open at once), each
 * item's summary the angle and its note, its meta the bar and the multiple.
 * Kit tokens only: ink above your median, the faint mark below it, so the
 * side of the line is said by the number and the bar agrees.
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
    // The best angle is the answer to the question the page asks, so it is
    // open on arrival. Everything else waits to be asked for — five groups
    // expanded at once is a list of 57 posts with headings in it.
    <Accordion multiple defaultValue={rows[0] ? [rows[0].id] : []}>
      {rows.map((row) => (
        <LedgerItem key={row.id} row={row} widest={widest} />
      ))}
    </Accordion>
  )
}

function LedgerItem({ row, widest }: { row: AngleRow; widest: number }) {
  const up = row.medianMultiple >= 1
  const width = (Math.abs(Math.log2(row.medianMultiple || 1)) / widest) * 100

  return (
    <AccordionItem
      value={row.id}
      summary={
        <span className="flex min-w-0 flex-col">
          <span className="flex items-baseline gap-kit-controls">
            <span className="truncate">{row.label}</span>
            <Mono>{row.posts.length}</Mono>
          </span>
          <span className="truncate text-kit-small font-kit-regular text-kit-ink-muted">
            {row.note}
          </span>
        </span>
      }
      meta={
        <span className="flex items-center gap-kit-related">
          {/* Length encodes rank; the side of the line is the number's job. */}
          <span aria-hidden className="hidden h-1.5 w-32 items-center sm:flex">
            <span
              className={`h-full rounded-full ${up ? "bg-kit-ink" : "bg-kit-mark"}`}
              // A group exactly on the median has zero length and would vanish;
              // 4% is the floor that keeps it a mark rather than an absence.
              style={{ width: `${Math.max(4, width)}%` }}
            />
          </span>
          <span
            className={`w-14 text-right font-kit-strong ${up ? "text-kit-ink" : "text-kit-ink-muted"}`}
          >
            {formatMultiple(row.medianMultiple)}
          </span>
        </span>
      }
    >
      <ol className="flex flex-col gap-kit-tight">
        {row.posts.map((post) => (
          // Two lines on a phone, one line from `sm`. Held on one line at
          // 375px the three figures keep their widths and the hook is left
          // with about two characters. `sm:contents` dissolves the figures'
          // wrapper at the breakpoint so they rejoin the row and keep their
          // columns.
          <li
            key={post.id}
            className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-kit-group"
          >
            {/* The link is the hook, not a trailing icon. Rows imported
                before `url` existed carry an empty string, so the anchor is
                earned rather than assumed. */}
            <Text as="div">
              <span className="block min-w-0 truncate">
                {post.url ? (
                  <TextLink href={post.url} target="_blank" rel="noopener noreferrer">
                    {post.hook}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </TextLink>
                ) : (
                  post.hook
                )}
              </span>
            </Text>
            <span className="flex items-baseline gap-kit-group sm:contents">
              <span className="shrink-0 sm:ml-auto">
                <Mono>{post.date}</Mono>
              </span>
              <span className="shrink-0 text-kit-body tabular-nums sm:w-16 sm:text-right">
                {post.impressions.toLocaleString("en-US")}
              </span>
              <span
                className={`shrink-0 text-kit-body font-kit-strong tabular-nums sm:w-14 sm:text-right ${
                  post.multiple >= 1 ? "text-kit-ink" : "text-kit-ink-muted"
                }`}
              >
                {formatMultiple(post.multiple)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </AccordionItem>
  )
}
