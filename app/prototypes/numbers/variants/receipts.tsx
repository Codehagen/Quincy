"use client"

import * as React from "react"

import {
  ArrowDown01Icon,
  Comment01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { Button } from "@/components/ui/button"

import {
  BY_REACH,
  MEDIAN,
  OUTLIER_GATE,
  POSTS,
  formatDate,
  formatMultiple,
  hook,
  isOutlier,
  multiple,
} from "../data"
import { DistributionStrip, TableView } from "../parts"

/**
 * Receipts — the page organised around the words.
 *
 * Axis: editorial. The unit is the post and the design element is its opening
 * line, set large enough to actually read, because the thing that separated a
 * 74× from a 0.4× is not visible in a bar — it is visible in the first eight
 * words. The plot is demoted to a hairline strip that gives shape and nothing
 * else. What you learn is *what to write next*, not what the distribution looks
 * like.
 */
export function Receipts() {
  const [showFloor, setShowFloor] = React.useState(false)

  const winners = BY_REACH.filter(isOutlier)
  const floor = BY_REACH.filter((p) => !isOutlier(p))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 pt-6 pb-16">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>What actually landed.</PageHeaderTitle>
          <PageHeaderDescription>
            Your median post does {MEDIAN.toLocaleString("en-US")} views. These{" "}
            {winners.length} did at least {OUTLIER_GATE}× that.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <section className="px-3">
        <DistributionStrip
          posts={[...POSTS].sort((a, b) => a.at.localeCompare(b.at))}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          57 posts, oldest to newest. The line is your median.
        </p>
      </section>

      <section className="flex flex-col px-3">
        <h2 className="text-section">Above the line</h2>
        <ol className="mt-1 flex flex-col">
          {winners.map((post) => (
            <li
              key={post.id}
              className="group flex items-start gap-6 border-b border-border py-5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                {/* The hook at reading size, capped at a sane measure and
                    balanced so a two-line opener does not leave one orphan. */}
                <p className="max-w-[52ch] text-lg leading-snug text-balance">
                  {hook(post, 110)}
                </p>
                <div className="tabular mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatDate(post.at)}</span>
                  <span className="inline-flex items-center gap-1">
                    <HugeiconsIcon
                      aria-hidden="true"
                      className="size-3.5"
                      icon={ViewIcon}
                      strokeWidth={1.8}
                    />
                    {post.impr.toLocaleString("en-US")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <HugeiconsIcon
                      aria-hidden="true"
                      className="size-3.5"
                      icon={Comment01Icon}
                      strokeWidth={1.8}
                    />
                    {post.replies}
                    <span className="sr-only"> replies</span>
                  </span>
                </div>
              </div>
              {/* Emphasis, not categorical: one accent on the thing that matters
                  and nothing else competing for the eye. Proportional figures —
                  this is a display number, not a column. */}
              <p className="shrink-0 text-2xl leading-none font-medium text-[var(--proto-up-ink)]">
                {formatMultiple(multiple(post))}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-section text-muted-foreground">
            Below the line
            <span className="tabular ml-2 font-normal">{floor.length}</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFloor((v) => !v)}
            aria-expanded={showFloor}
          >
            {showFloor ? "Hide" : "Show"}
            <HugeiconsIcon
              aria-hidden="true"
              className={cn(
                "proto-chevron size-4",
                showFloor && "proto-chevron-open"
              )}
              icon={ArrowDown01Icon}
              strokeWidth={1.8}
            />
          </Button>
        </div>

        {showFloor ? (
          <ol className="mt-3 flex flex-col">
            {floor.map((post) => (
              <li
                key={post.id}
                className="flex items-baseline gap-6 border-b border-border/60 py-3 last:border-0"
              >
                <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {hook(post, 80)}
                </p>
                <span className="tabular shrink-0 text-xs text-muted-foreground">
                  {formatDate(post.at)}
                </span>
                <span
                  className={cn(
                    "tabular w-14 shrink-0 text-right text-sm",
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
        ) : (
          <p className="mt-2 max-w-[62ch] text-sm text-pretty text-muted-foreground">
            Nothing here is a failure — six of them are “Repo 🔗” replies that
            were never competing for reach. The same body posted twice did 4,247
            and 743.
          </p>
        )}
      </section>

      <section className="px-3">
        <h2 className="text-section">Every post</h2>
        <div className="mt-3">
          <TableView posts={BY_REACH} />
        </div>
      </section>
    </div>
  )
}
