"use client"

import * as React from "react"

import { Chart01Icon, Table01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import {
  BY_DATE,
  MEAN,
  MEDIAN,
  OUTLIER_GATE,
  POSTS,
  formatDate,
  formatMultiple,
  hook,
  isOutlier,
  multiple,
} from "../data"
import {
  PLOT_DOWN,
  PLOT_H,
  PLOT_UP,
  Readout,
  TICKS,
  TableView,
  UNIT_PX,
  barLength,
  isClipped,
  tickLabel,
} from "../parts"

/**
 * Baseline — the page organised around the distribution.
 *
 * Axis: statistical. The median is the subject and every post is a deviation
 * from it, so the lead form is a diverging bar against a baseline and the hero
 * figure is the line itself. What you learn at a glance is the *shape*: a long
 * quiet floor with four spikes standing out of it, which is the whole argument
 * in docs/vision.md rendered from this account's own history.
 */
export function Baseline() {
  const [view, setView] = React.useState<"plot" | "table">("plot")
  const [active, setActive] = React.useState<string | null>(null)

  const outliers = POSTS.filter(isOutlier)
  const below = POSTS.filter((p) => multiple(p) < 1)
  const activePost = BY_DATE.find((p) => p.id === active) ?? null

  /**
   * Roving tabindex over the 57 bars.
   *
   * One tab stop for the whole plot, arrow keys to walk it. Without this a
   * keyboard user tabs 57 times to get past the chart, and the arrow presses
   * would fall through to the harness and flip the variant mid-read — the
   * handler stops propagation for exactly that reason. The bars stay real
   * buttons so focus still opens the read-out.
   */
  const [roving, setRoving] = React.useState(0)
  const barRefs = React.useRef<(HTMLButtonElement | null)[]>([])

  const moveTo = React.useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(BY_DATE.length - 1, next))
    setRoving(clamped)
    barRefs.current[clamped]?.focus()
  }, [])

  function onBarKeyDown(e: React.KeyboardEvent, i: number) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"]
    if (!keys.includes(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === "ArrowRight") moveTo(i + 1)
    else if (e.key === "ArrowLeft") moveTo(i - 1)
    else if (e.key === "Home") moveTo(0)
    else moveTo(BY_DATE.length - 1)
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-6 pb-16">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>What actually landed.</PageHeaderTitle>
          <PageHeaderDescription>
            57 posts on X, Nov 2025 to Aug 2026. Every one measured against you,
            not against a follower count.
          </PageHeaderDescription>
        </PageHeaderContent>
        <ToggleGroup
          value={[view]}
          onValueChange={(v) => setView((v[0] as "plot" | "table") ?? "plot")}
          aria-label="Chart or table"
        >
          <ToggleGroupItem value="plot" aria-label="Chart">
            <HugeiconsIcon aria-hidden="true" icon={Chart01Icon} strokeWidth={1.8} />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table">
            <HugeiconsIcon aria-hidden="true" icon={Table01Icon} strokeWidth={1.8} />
          </ToggleGroupItem>
        </ToggleGroup>
      </PageHeader>

      {/* The hero figure. Proportional figures, not tabular — equal-width digits
          make a display number look loose. Same sans as everything else. */}
      <section className="px-3">
        <p className="text-eyebrow text-muted-foreground uppercase">
          Your median post
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-display">{MEDIAN.toLocaleString("en-US")}</p>
          <p className="text-sm text-muted-foreground">
            views. Your mean is {MEAN.toLocaleString("en-US")}, which is{" "}
            {(MEAN / MEDIAN).toFixed(1)}× higher — the gap is{" "}
            {outliers.length} posts carrying the other {POSTS.length - outliers.length}.
          </p>
        </div>
      </section>

      {view === "table" ? (
        <section className="px-3">
          <TableView posts={BY_DATE} />
        </section>
      ) : (
        <section className="px-3">
          <figure className="m-0">
            <figcaption className="sr-only">
              Every post against your median, in order of publication. Bars above
              the line beat the median; bars below fall short.
            </figcaption>

            <div
              className="relative"
              style={{ height: PLOT_H + 28 }}
              onMouseLeave={() => setActive(null)}
            >
              {/* Recessive grid: solid hairlines one shade off the surface, never
                  dashed — a dash reads as "threshold" when it is just a grid. */}
              {TICKS.map((tick) => {
                const top = PLOT_UP - tick.v * UNIT_PX
                const isBase = tick.v === 0
                return (
                  // `-translate-y-1/2` is load-bearing, not spacing. The row is
                  // `items-center`, so its 1px rule sits at the row's vertical
                  // middle — without the shift the rule lands ~5px below the
                  // `top` it was given, and every bar in the plot is measured
                  // against a line drawn 5px off its own zero. Caught by
                  // comparing the median bar's bottom edge to the 1× rule in
                  // the browser; it is invisible by eye.
                  <div
                    key={tick.m}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 items-center gap-2"
                    style={{ top }}
                  >
                    <span
                      className={cn(
                        "tabular w-8 shrink-0 text-right text-[11px] leading-none",
                        isBase ? "font-medium text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {tickLabel(tick.m)}
                    </span>
                    <span
                      className={cn(
                        "h-px flex-1",
                        isBase ? "bg-foreground/25" : "bg-border"
                      )}
                    />
                  </div>
                )
              })}

              {/* Bars. 2px of surface between neighbours rather than a stroke —
                  a border drawn around marks to separate them is the thing that
                  makes a chart look assembled. */}
              <div
                role="group"
                data-proto-keys=""
                aria-label="Every post against your median. Arrow keys to walk the timeline."
                className="absolute inset-y-0 left-10 flex items-stretch gap-[2px]"
                style={{ right: 0 }}
              >
                {BY_DATE.map((post, i) => {
                  const up = multiple(post) >= 1
                  // Clamp once, then use the clamped length for BOTH the height
                  // and the offset. Reading the floor into `height` but the raw
                  // length into `top` hangs any bar shorter than the floor over
                  // the wrong side of the baseline — and the bar that hits is
                  // the median post itself (938, exactly 1.0×, length 0), drawn
                  // brass but sitting under the line it defines.
                  const drawn = Math.max(2, barLength(post))
                  const isActive = active === post.id
                  return (
                    <button
                      key={post.id}
                      type="button"
                      ref={(el) => {
                        barRefs.current[i] = el
                      }}
                      tabIndex={i === roving ? 0 : -1}
                      className="proto-bar group relative min-w-0 flex-1 cursor-default rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onMouseEnter={() => setActive(post.id)}
                      onFocus={() => {
                        setActive(post.id)
                        setRoving(i)
                      }}
                      onBlur={() => setActive(null)}
                      onKeyDown={(e) => onBarKeyDown(e, i)}
                      aria-label={`${formatDate(post.at)}: ${formatMultiple(
                        multiple(post)
                      )} your median, ${post.impr.toLocaleString("en-US")} views.${
                        isClipped(post) ? " Bar clipped to the axis." : ""
                      } ${hook(post, 60)}`}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-0 w-full",
                          up ? "rounded-t-[3px]" : "rounded-b-[3px]"
                        )}
                        style={{
                          height: drawn,
                          top: up ? PLOT_UP - drawn : PLOT_UP,
                          background: up ? "var(--proto-up)" : "var(--proto-down)",
                          opacity: isActive ? 1 : up ? 0.9 : 0.6,
                        }}
                      />
                      {/* A clipped bar has to say so. `barLength` clamps to the
                          domain, so a post past it is otherwise drawn as if it
                          landed exactly on the ceiling — the one reading a
                          chart about outliers must never give. Nothing in the
                          current corpus trips this (the best post is 74×
                          against a ~79× ceiling); a live query eventually
                          will. */}
                      {isClipped(post) ? (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 h-[3px] w-full rounded-t-[1px] bg-background"
                          style={{ top: PLOT_UP - drawn + 3 }}
                        />
                      ) : null}
                      {/* Direct labels, selectively — only the four that cleared
                          15×. A value on every mark is chaos at 57 bars and goes
                          unread. The gate is 15 rather than 10 because at 10 the
                          20× and 11× posts land four bars apart and their labels
                          overlap; a clipped label is worse than no label, and
                          the tooltip and table both still carry the value.
                          Dropped entirely under `sm`: at 375px the whole plot
                          is ~300px wide and even four labels touch, which is
                          the breakpoint the content actually breaks at rather
                          than a device size.
                          The label rides the bar rather than being positioned
                          against the container, so it cannot drift out of
                          register when the plot is resized. */}
                      {multiple(post) >= 15 ? (
                        <span
                          aria-hidden="true"
                          className="tabular absolute left-1/2 hidden -translate-x-1/2 text-[11px] leading-none font-medium whitespace-nowrap text-[var(--proto-up-ink)] sm:block"
                          style={{ top: PLOT_UP - drawn - 14 }}
                        >
                          {formatMultiple(multiple(post))}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <div
                aria-hidden="true"
                className="absolute inset-x-10 flex justify-between text-[11px] text-muted-foreground"
                style={{ top: PLOT_UP + PLOT_DOWN + 10 }}
              >
                <span>Nov 2025</span>
                <span>Aug 2026</span>
              </div>

              {activePost ? (
                <div className="pointer-events-none absolute top-0 right-0 z-10">
                  <Readout post={activePost} />
                </div>
              ) : null}
            </div>
          </figure>

          <dl className="mt-8 grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Cleared {OUTLIER_GATE}×</dt>
              <dd className="tabular mt-1 text-2xl">
                {outliers.length}
                <span className="text-base text-muted-foreground"> of {POSTS.length}</span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Fell under the line</dt>
              <dd className="tabular mt-1 text-2xl">
                {below.length}
                <span className="text-base text-muted-foreground"> of {POSTS.length}</span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Best post</dt>
              <dd className="tabular mt-1 text-2xl text-[var(--proto-up-ink)]">
                {formatMultiple(multiple(outliers[0]))}
              </dd>
            </div>
          </dl>

          <p className="mt-6 max-w-[62ch] text-sm text-pretty text-muted-foreground">
            The floor is not failure. Six of the posts below the line are link
            replies hung under a thread — they were never competing for reach.
            Filtering those out is the next question this page has to answer.
          </p>
        </section>
      )}
    </div>
  )
}
