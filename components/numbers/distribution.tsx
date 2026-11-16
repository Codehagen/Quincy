"use client"

import * as React from "react"

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
import { Segmented, Text } from "@/components/kit"
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
 *
 * On the kit since 2026-11-16, and on kit tokens only (plans/029): a bar
 * above your median is ink, a bar below it is the faint mark, so the side of
 * the line carries the reading and the colour only agrees with it. No green
 * and red: the kit has one hue per job, and "did well" is not one of them.
 * The two views are a Segmented (a value, not a panel of content).
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
      <div className="flex justify-end">
        <Segmented
          aria-label="Show as"
          options={[
            { value: "plot", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
          value={view}
          onValueChange={setView}
        />
      </div>

      {view === "table" ? (
        <PostTable posts={posts} median={median} />
      ) : (
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
                      className={`w-8 shrink-0 text-right font-kit-mono text-kit-mono leading-none tabular-nums ${
                        isBase ? "font-kit-strong text-kit-ink" : "text-kit-ink-muted"
                      }`}
                    >
                      {tick.m}×
                    </span>
                    {/* The base line is the dashed median, as on the
                        landing's median picture; the rest are hairlines. */}
                    <span
                      className={
                        isBase
                          ? "h-0 flex-1 border-t border-dashed border-kit-mark"
                          : "h-px flex-1 bg-kit-hairline"
                      }
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
                      className="group relative min-w-0 flex-1 cursor-default rounded-kit-chip outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus"
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
                        className={`absolute left-0 w-full transition-opacity duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none ${
                          up ? "rounded-t-kit-chip bg-kit-ink" : "rounded-b-kit-chip bg-kit-mark"
                        }`}
                        style={{
                          height: drawn,
                          top: up ? PLOT_UP - drawn : PLOT_UP,
                          // The read-out's bar stands out; the rest step back.
                          opacity: active === null || isActive ? 1 : 0.55,
                        }}
                      />
                      {/* A clipped bar has to say so. `barLength` clamps to the
                          domain, so a post past it is otherwise drawn as if it
                          landed exactly on the ceiling — the one reading a
                          chart about outliers must never give. */}
                      {clipped ? (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 h-[3px] w-full bg-kit-object"
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
                          className="absolute left-1/2 hidden -translate-x-1/2 font-kit-mono text-kit-mono leading-none font-kit-strong whitespace-nowrap text-kit-ink tabular-nums sm:block"
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
                className="absolute right-0 left-10 flex justify-between font-kit-mono text-kit-mono text-kit-ink-muted"
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
    <div className="pointer-events-none flex w-72 max-w-[calc(100vw-4rem)] flex-col gap-kit-tight rounded-kit-control bg-kit-object px-kit-recess py-kit-recess-y shadow-kit-lifted">
      <span className="font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">
        {post.date}
      </span>
      <Text as="div" variant="small">
        <span className="line-clamp-3 text-pretty">{post.hook}</span>
      </Text>
      <dl className="flex items-baseline gap-kit-related text-kit-small tabular-nums">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">Multiple of your median</dt>
          <dd
            className={`font-kit-strong ${
              post.multiple >= 1 ? "text-kit-ink" : "text-kit-ink-muted"
            }`}
          >
            {formatMultiple(post.multiple)}
          </dd>
        </div>
        <div className="flex items-baseline gap-1 text-kit-ink-muted">
          <dt>Views</dt>
          <dd className="text-kit-ink">
            {post.impressions.toLocaleString("en-US")}
          </dd>
        </div>
        <div className="flex items-baseline gap-1 text-kit-ink-muted">
          <dt>Replies</dt>
          <dd className="text-kit-ink">{post.replies}</dd>
        </div>
      </dl>
    </div>
  )
}
