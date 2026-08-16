"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

import {
  MEDIAN,
  formatDate,
  formatMultiple,
  hook,
  multiple,
  type Post,
} from "./data"

/**
 * Shared measuring tape and the read-out that hangs off it. Everything here is
 * scale and chrome — no variant's layout idea lives in this file, so the three
 * directions stay genuinely comparable instead of quietly converging on
 * whatever got written first.
 */

/**
 * One scale, in log2 of the multiple.
 *
 * The corpus spans 0.31× to 74×. A linear axis gives the 74× post the whole
 * plot and renders the other 56 as a flat smear against the baseline, which is
 * the opposite of the point — the page exists to show that most posts sit just
 * under the line and a few carry everything. Log2 is the honest encoding for a
 * ratio, and the reader is never shown a logarithm: every tick is labelled in
 * multiples.
 *
 * Above and below the line share the same pixels-per-unit. Two scales meeting
 * at a baseline would exaggerate one half, which is the classic way a diverging
 * chart lies.
 */
export const UNIT_PX = 34
export const DOMAIN_UP = 6.3 // 2^6.3 ≈ 79×
export const DOMAIN_DOWN = -1.9 // 2^-1.9 ≈ 0.27×
export const PLOT_UP = Math.round(DOMAIN_UP * UNIT_PX)
export const PLOT_DOWN = Math.round(Math.abs(DOMAIN_DOWN) * UNIT_PX)
export const PLOT_H = PLOT_UP + PLOT_DOWN

export function logMultiple(post: Post) {
  return Math.log2(multiple(post))
}

/** Distance in px from the baseline, clamped into the domain. */
export function barLength(post: Post) {
  const v = logMultiple(post)
  const clamped = Math.max(DOMAIN_DOWN, Math.min(DOMAIN_UP, v))
  return Math.abs(clamped) * UNIT_PX
}

/**
 * True when the clamp above actually bit.
 *
 * Callers need this because a clamped bar and a bar that genuinely reached the
 * ceiling are drawn identically, and on a chart whose subject is outliers that
 * is the one thing the geometry must not imply. Nothing in the current corpus
 * trips it — the best post is 74.16× against a 2^6.3 ≈ 79× ceiling — but the
 * fixture is a snapshot and a live query will find the post that does.
 */
export function isClipped(post: Post) {
  const v = logMultiple(post)
  return v > DOMAIN_UP || v < DOMAIN_DOWN
}

/** Height of the miniature strip, in px. */
export const STRIP_H = 44

export const TICKS = [
  { m: 64, v: 6 },
  { m: 16, v: 4 },
  { m: 4, v: 2 },
  { m: 1, v: 0 },
  { m: 0.5, v: -1 },
] as const

export function tickLabel(m: number) {
  return m >= 1 ? `${m}×` : `${m}×`
}

/**
 * The read-out. Values are reachable without it — every variant ships a table
 * view — so this enhances rather than gates, which is the rule tooltips break
 * most often.
 */
export function Readout({
  post,
  className,
}: {
  post: Post
  className?: string
}) {
  const m = multiple(post)
  return (
    <div
      className={cn(
        "pointer-events-none w-72 rounded-lg bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
        className
      )}
    >
      <p className="text-xs text-muted-foreground">
        {formatDate(post.at)} · {post.at.slice(0, 4)}
      </p>
      {/* rounded-lg is 12px against 12px of padding, so children take rounded-xs
          (4px) if they ever need a radius. Nothing nested here does. */}
      <p className="mt-1.5 line-clamp-3 text-sm leading-snug text-pretty">
        {hook(post, 120)}
      </p>
      <dl className="tabular mt-2.5 flex items-baseline gap-3 text-xs">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Multiple of your median</dt>
          <dd
            className={cn(
              "font-semibold",
              m >= 1
                ? "text-[var(--proto-up-ink)]"
                : "text-[var(--proto-down-ink)]"
            )}
          >
            {formatMultiple(m)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1 text-muted-foreground">
          <dt>Views</dt>
          <dd className="text-foreground">
            {post.impr.toLocaleString("en-US")}
          </dd>
        </div>
        <div className="flex items-baseline gap-1 text-muted-foreground">
          <dt>Replies</dt>
          <dd className="text-foreground">{post.replies}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * The table twin every chart owes. Color and length carry the story on the
 * plot; this is where the same numbers are readable without either.
 */
export function TableView({ posts }: { posts: Post[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Every post, its reach, and its multiple of your median of{" "}
          {MEDIAN.toLocaleString("en-US")} views
        </caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th
              scope="col"
              className="py-2 pr-4 font-medium text-muted-foreground"
            >
              Date
            </th>
            <th
              scope="col"
              className="py-2 pr-4 font-medium text-muted-foreground"
            >
              Opening line
            </th>
            <th
              scope="col"
              className="py-2 pr-4 text-right font-medium text-muted-foreground"
            >
              Views
            </th>
            <th
              scope="col"
              className="py-2 text-right font-medium text-muted-foreground"
            >
              vs median
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => {
            const m = multiple(post)
            return (
              <tr
                key={post.id}
                className="border-b border-border/60 last:border-0"
              >
                <td className="tabular py-2 pr-4 align-top whitespace-nowrap text-muted-foreground">
                  {formatDate(post.at)}
                </td>
                <td className="max-w-[38ch] py-2 pr-4 align-top">
                  <span className="line-clamp-1">{hook(post, 70)}</span>
                </td>
                <td className="tabular py-2 pr-4 text-right align-top">
                  {post.impr.toLocaleString("en-US")}
                </td>
                <td
                  className={cn(
                    "tabular py-2 text-right align-top font-medium",
                    m >= 1
                      ? "text-[var(--proto-up-ink)]"
                      : "text-[var(--proto-down-ink)]"
                  )}
                >
                  {formatMultiple(m)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A hairline sparkstrip of every post, used by variants that need the shape of
 * the distribution without giving it a whole plot.
 */
export function DistributionStrip({ posts }: { posts: Post[] }) {
  // The strip is the plot in miniature, so it keeps the plot's baseline. Growing
  // every mark up from a shared floor would draw a below-median post as a tall
  // bar, which is the opposite of what it means — the strip has to diverge for
  // the same reason the full chart does.
  const scale = STRIP_H / (DOMAIN_UP + Math.abs(DOMAIN_DOWN))
  const zero = Math.round(DOMAIN_UP * scale)

  return (
    <div
      className="relative"
      style={{ height: STRIP_H }}
      role="img"
      aria-label={`Distribution of ${posts.length} posts against your median. Most sit at or just under the line; a small number reach many times it.`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 h-px bg-foreground/20"
        style={{ top: zero }}
      />
      <div aria-hidden="true" className="absolute inset-0 flex gap-px">
        {posts.map((post) => {
          const up = multiple(post) >= 1
          const len = Math.max(1.5, (barLength(post) / UNIT_PX) * scale)
          return (
            <span key={post.id} className="relative min-w-px flex-1">
              <span
                className="absolute left-0 w-full"
                style={{
                  height: len,
                  top: up ? zero - len : zero,
                  background: up ? "var(--proto-up)" : "var(--proto-down)",
                  opacity: up ? 1 : 0.7,
                }}
              />
            </span>
          )
        })}
      </div>
    </div>
  )
}
