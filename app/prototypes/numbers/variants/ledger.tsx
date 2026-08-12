"use client"

import * as React from "react"

import {
  ArrowRight01Icon,
  ChartHistogramIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

import {
  MEDIAN,
  POSTS,
  formatDate,
  formatMultiple,
  hook,
  multiple,
  rollupByAngle,
} from "../data"
import { TableView } from "../parts"

/**
 * Ledger — the page organised around cause.
 *
 * Axis: provenance. The row is not a post, it is an *angle*, and the posts are
 * the evidence filed under it. The question this page answers is the one
 * app/(app)/numbers/page.tsx already promises and nothing else on the market
 * answers: "read backwards into Riffs, so the next round starts from what
 * performed instead of from nothing."
 *
 * The honest caveat is on the page rather than in this comment: `scheduled_post`
 * is empty, so there is no riff_angle → post edge to read yet. These groups are
 * inferred from the shape of each opening line, which is the same question asked
 * of data that exists. When Quincy publishes, the inference is replaced by the
 * join and this layout does not change.
 */
export function Ledger() {
  const rows = React.useMemo(() => rollupByAngle(), [])
  const [open, setOpen] = React.useState<string | null>(rows[0]?.angle.id ?? null)

  // `Math.max()` with no arguments is -Infinity, which propagates into every
  // bar width as NaN. The `|| 1` is the guard, not decoration: an empty corpus
  // is the first thing a promoted version meets, on the account that has just
  // connected X and imported nothing yet.
  const widest =
    Math.max(...rows.map((r) => Math.abs(Math.log2(r.medianMultiple))), 0) || 1
  // "Unfiled" is a residue bucket, not an angle, so it is excluded from the
  // read-out — naming it as the winner would be a claim about nothing. Both
  // ends can be absent (no corpus, or a corpus where nothing matched an
  // angle), so the summary below is rendered only when there is one to state.
  const named = rows.filter((r) => r.angle.id !== "unfiled")
  const best = named.length > 0 ? named[0] : null
  const worst = named.length > 1 ? named[named.length - 1] : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-6 pb-16">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Which angle wins.</PageHeaderTitle>
          <PageHeaderDescription>
            Not which post. {POSTS.length} posts grouped by the shape of their
            opening line, each scored against your median of{" "}
            {MEDIAN.toLocaleString("en-US")}.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="mx-3 flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5 text-sm ring-1 ring-foreground/5">
        <HugeiconsIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          icon={InformationCircleIcon}
          strokeWidth={1.8}
        />
        <p className="max-w-[70ch] text-pretty text-muted-foreground">
          Inferred, not recorded. Quincy has not published anything yet, so these
          angles are read off your imported history. Once a riff produces a post,
          the group becomes the actual angle that drafted it.
        </p>
      </div>

      <section className="flex flex-col px-3">
        {rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ChartHistogramIcon}
                  strokeWidth={1.8}
                />
              </EmptyMedia>
              <EmptyTitle>No posts to group yet.</EmptyTitle>
              <EmptyDescription>
                Connect X and let an import run — angles are read off your
                history, so there is nothing to score until there is history.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {rows.map((row) => {
          const isOpen = open === row.angle.id
          const up = row.medianMultiple >= 1
          const width = (Math.abs(Math.log2(row.medianMultiple)) / widest) * 100

          return (
            <div key={row.angle.id} className="border-b border-border last:border-0">
              <h2>
                <button
                  type="button"
                  className="proto-row flex w-full items-center gap-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={() => setOpen(isOpen ? null : row.angle.id)}
                  aria-expanded={isOpen}
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    className={cn(
                      "proto-chevron size-4 shrink-0 text-muted-foreground",
                      isOpen && "proto-chevron-open-90"
                    )}
                    icon={ArrowRight01Icon}
                    strokeWidth={1.8}
                  />

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-medium">{row.angle.label}</span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        {row.posts.length}
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.angle.note}
                    </span>
                  </span>

                  {/* One hue for magnitude, not a rainbow across the rows: the
                      bar length already encodes rank, so hue is free to carry
                      the one thing length cannot — which side of the line. */}
                  <span
                    aria-hidden="true"
                    className="hidden h-1.5 w-40 shrink-0 items-center sm:flex"
                  >
                    <span
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, width)}%`,
                        background: up ? "var(--proto-up)" : "var(--proto-down)",
                      }}
                    />
                  </span>

                  <span
                    className={cn(
                      "tabular w-16 shrink-0 text-right font-medium",
                      up
                        ? "text-[var(--proto-up-ink)]"
                        : "text-[var(--proto-down-ink)]"
                    )}
                  >
                    {formatMultiple(row.medianMultiple)}
                  </span>
                </button>
              </h2>

              {isOpen ? (
                <ol className="mb-4 ml-8 flex flex-col gap-px">
                  {row.posts.map((post) => (
                    <li
                      key={post.id}
                      className="flex items-baseline gap-4 rounded-xs px-2 py-2"
                      style={{
                        background:
                          multiple(post) >= 1
                            ? "var(--proto-up-soft)"
                            : "var(--proto-down-soft)",
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {hook(post, 84)}
                      </span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        {formatDate(post.at)}
                      </span>
                      <span className="tabular w-16 shrink-0 text-right text-sm">
                        {post.impr.toLocaleString("en-US")}
                      </span>
                      <span
                        className={cn(
                          "tabular w-14 shrink-0 text-right text-sm font-medium",
                          multiple(post) >= 1
                            ? "text-[var(--proto-up-ink)]"
                            : "text-[var(--proto-down-ink)]"
                        )}
                      >
                        {formatMultiple(multiple(post))}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          )
        })}
      </section>

      {/* Derived, not written. A hardcoded sentence here went stale the first
          time the grouping changed and told the reader the opposite of what the
          rows above it showed. It needs two named angles to make a comparison,
          so with fewer than two there is no sentence to write and the section
          does not render at all — an empty paragraph would read as a bug. */}
      {best && worst ? (
        <section className="px-3">
          <p className="max-w-[62ch] text-sm text-pretty text-muted-foreground">
            <span className="text-foreground">{best.angle.label}</span> is the
            angle that works, at {formatMultiple(best.medianMultiple)} your
            median across {best.posts.length} posts.{" "}
            <span className="text-foreground">{worst.angle.label}</span> is the
            one that does not, at {formatMultiple(worst.medianMultiple)}. Start
            the next riff from the top row.
          </p>
        </section>
      ) : null}

      <section className="px-3">
        <h2 className="text-section">Every post</h2>
        <div className="mt-3">
          <TableView posts={POSTS} />
        </div>
      </section>
    </div>
  )
}
