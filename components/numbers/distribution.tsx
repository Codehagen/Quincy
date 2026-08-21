"use client"

import * as React from "react"

import { Chart01Icon, Table01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  PLOT_DOWN,
  PLOT_H,
  PLOT_UP,
  TICKS,
  UNIT_PX,
  barLength,
  formatMultiple,
  isClipped,
  type ScoredPost,
} from "@/lib/numbers"
import { cn } from "@/lib/utils"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PostTable } from "@/components/numbers/post-table"

/**
 * The distribution: every post as a deviation from your own median.
 *
 * What you learn at a glance is the *shape* — a long quiet floor with a few
 * spikes standing out of it. That is the argument in docs/vision.md, drawn from
 * this account's own history rather than asserted in prose.
 *
 * The toggle swaps the figure for its table twin and nothing else on the page,
 * because the two are the same data in two encodings. Colour and bar length
 * carry the story in one; the other is where the numbers are readable without
 * either.
 */
export function Distribution({
  posts,
  median,
  fromAxis,
  toAxis,
}: {
  posts: ScoredPost[]
  median: number
  fromAxis: string | null
  toAxis: string | null
}) {
  const [view, setView] = React.useState<"plot" | "table">("plot")
  const [active, setActive] = React.useState<string | null>(null)
  const activePost = posts.find((p) => p.id === active) ?? null

  /**
   * Roving tabindex over the bars.
   *
   * One tab stop for the whole plot, arrow keys to walk it. Without this a
   * keyboard user tabs 57 times to get past the chart. The bars stay real
   * buttons so focus still opens the read-out.
   */
  const [roving, setRoving] = React.useState(0)
  const barRefs = React.useRef<(HTMLButtonElement | null)[]>([])

  const moveTo = React.useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(posts.length - 1, next))
      setRoving(clamped)
      barRefs.current[clamped]?.focus()
    },
    [posts.length]
  )

  function onBarKeyDown(e: React.KeyboardEvent, i: number) {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"]
    if (!keys.includes(e.key)) return
    e.preventDefault()
    if (e.key === "ArrowRight") moveTo(i + 1)
    else if (e.key === "ArrowLeft") moveTo(i - 1)
    else if (e.key === "Home") moveTo(0)
    else moveTo(posts.length - 1)
  }

  return (
    <>
      <div className="flex items-center justify-end px-3">
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
      </div>

      {view === "table" ? (
        <section className="px-3">
          <PostTable posts={posts} median={median} />
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
              {/* Recessive grid: solid hairlines one shade off the surface,
                  never dashed — a dash reads as "threshold" when it is just a
                  grid. */}
              {TICKS.map((tick) => {
                const top = PLOT_UP - tick.v * UNIT_PX
                const isBase = tick.v === 0
                return (
                  // `-translate-y-1/2` is load-bearing, not spacing. The row is
                  // `items-center`, so its 1px rule sits at the row's vertical
                  // middle — without the shift the rule lands ~5px below the
                  // `top` it was given, and every bar is measured against a
                  // line drawn off its own zero. Invisible by eye; obvious once
                  // the rectangles are compared.
                  <div
                    key={tick.m}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 flex -translate-y-1/2 items-center gap-2"
                    style={{ top }}
                  >
                    <span
                      className={cn(
                        "tabular w-8 shrink-0 text-right text-[11px] leading-none",
                        isBase
                          ? "text-foreground font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {tick.m}×
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
                aria-label="Every post against your median. Arrow keys to walk the timeline."
                className="absolute inset-y-0 right-0 left-10 flex items-stretch gap-[2px]"
              >
                {posts.map((post, i) => {
                  const up = post.multiple >= 1
                  // Clamp once, then use the clamped length for BOTH the height
                  // and the offset. Reading the floor into `height` but the raw
                  // length into `top` hangs any bar shorter than the floor over
                  // the wrong side of the baseline — and the bar that hits is
                  // the median post itself, drawn brass but sitting under the
                  // line it defines.
                  const drawn = Math.max(2, barLength(post.multiple))
                  const clipped = isClipped(post.multiple)
                  const isActive = active === post.id
                  return (
                    <button
                      key={post.id}
                      type="button"
                      ref={(el) => {
                        barRefs.current[i] = el
                      }}
                      tabIndex={i === roving ? 0 : -1}
                      className="group relative min-w-0 flex-1 cursor-default rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      onMouseEnter={() => setActive(post.id)}
                      onFocus={() => {
                        setActive(post.id)
                        setRoving(i)
                      }}
                      onBlur={() => setActive(null)}
                      onKeyDown={(e) => onBarKeyDown(e, i)}
                      aria-label={`${post.date}: ${formatMultiple(
                        post.multiple
                      )} your median, ${post.impressions.toLocaleString(
                        "en-US"
                      )} views.${clipped ? " Bar clipped to the axis." : ""} ${
                        post.hook
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-0 w-full transition-opacity duration-150 ease-out",
                          up ? "bg-gain rounded-t-[3px]" : "bg-shortfall rounded-b-[3px]"
                        )}
                        style={{
                          height: drawn,
                          top: up ? PLOT_UP - drawn : PLOT_UP,
                          opacity: isActive ? 1 : up ? 0.9 : 0.6,
                        }}
                      />
                      {/* A clipped bar has to say so. `barLength` clamps to the
                          domain, so a post past it is otherwise drawn as if it
                          landed exactly on the ceiling — the one reading a
                          chart about outliers must never give. */}
                      {clipped ? (
                        <span
                          aria-hidden="true"
                          className="bg-background absolute left-0 h-[3px] w-full rounded-t-[1px]"
                          style={{ top: PLOT_UP - drawn + 3 }}
                        />
                      ) : null}
                      {/* Direct labels, selectively — only what cleared 15×. A
                          value on every mark is chaos at 57 bars and goes
                          unread. The gate is 15 rather than 10 because at 10
                          the 20× and 11× posts land four bars apart and their
                          labels overlap; a clipped label is worse than no
                          label, and the read-out and table both still carry the
                          value. Dropped entirely under `sm`, which is the width
                          the content actually breaks at rather than a device
                          size. The label rides the bar rather than the
                          container, so it cannot drift out of register when the
                          plot is resized. */}
                      {post.multiple >= 15 ? (
                        <span
                          aria-hidden="true"
                          className="tabular text-gain-ink absolute left-1/2 hidden -translate-x-1/2 text-[11px] leading-none font-medium whitespace-nowrap sm:block"
                          style={{ top: PLOT_UP - drawn - 14 }}
                        >
                          {formatMultiple(post.multiple)}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              {/* `right-0 left-10`, matching the bar strip exactly rather than
                  `inset-x-10`. Inset on both sides the right-hand label sits
                  40px in from the last bar it is supposed to date — invisible
                  at 1280px, obvious at 375px where 40px is a tenth of the
                  plot. */}
              <div
                aria-hidden="true"
                className="text-muted-foreground absolute right-0 left-10 flex justify-between text-[11px]"
                style={{ top: PLOT_UP + PLOT_DOWN + 10 }}
              >
                <span>{fromAxis}</span>
                <span>{toAxis}</span>
              </div>

              {activePost ? (
                <div className="pointer-events-none absolute top-0 right-0 z-10">
                  <Readout post={activePost} />
                </div>
              ) : null}
            </div>
          </figure>
        </section>
      )}
    </>
  )
}

/**
 * The read-out. Values are reachable without it — the table twin is one press
 * away — so this enhances rather than gates, which is the rule tooltips break
 * most often.
 */
function Readout({ post }: { post: ScoredPost }) {
  return (
    <div className="bg-popover text-popover-foreground ring-foreground/10 pointer-events-none w-72 rounded-lg p-3 shadow-lg ring-1">
      <p className="text-muted-foreground text-xs">{post.date}</p>
      {/* rounded-lg is 12px against 12px of padding, so children take rounded-xs
          if they ever need a radius. Nothing nested here does. */}
      <p className="mt-1.5 line-clamp-3 text-sm leading-snug text-pretty">
        {post.hook}
      </p>
      <dl className="tabular mt-2.5 flex items-baseline gap-3 text-xs">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Multiple of your median</dt>
          <dd
            className={cn(
              "font-semibold",
              post.multiple >= 1 ? "text-gain-ink" : "text-shortfall-ink"
            )}
          >
            {formatMultiple(post.multiple)}
          </dd>
        </div>
        <div className="text-muted-foreground flex items-baseline gap-1">
          <dt>Views</dt>
          <dd className="text-foreground">
            {post.impressions.toLocaleString("en-US")}
          </dd>
        </div>
        <div className="text-muted-foreground flex items-baseline gap-1">
          <dt>Replies</dt>
          <dd className="text-foreground">{post.replies}</dd>
        </div>
      </dl>
    </div>
  )
}
