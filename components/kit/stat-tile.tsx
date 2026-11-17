import * as React from "react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ICON_DENSE_CHEVRON } from "./control-styles"

/**
 * A number said as a sentence against the person's own usual
 * (docs/design/workspace.md, "StatTile and Sparkline"). Numbers is the only
 * page with tiles (decisions.md, "Never"): a light object on the ground, not
 * a dark shouted count.
 *
 * ```tsx
 * <StatTile label="Replies" group="Depth" value="9 replies"
 *   sentence="Under your usual 19 in 30 days." trend={<Sparkline … />}
 *   onOpen={…} opensLabel="Open the posts that got replies." />
 * ```
 *
 * With `onOpen` it is a button (it opens what is behind the number) with a
 * chevron that is always shown, so the label never shifts on hover. Without
 * it, a plain object: a number the product cannot read yet is not a way in.
 */
export type StatTileProps = {
  /** "Replies". */
  label: string
  /** The group it belongs to, at the end of the name row: "Depth", "Volume". */
  group?: string
  /** The figure, said: "9 replies". A tile that cannot be computed says so ("Not read yet") and passes `quiet`. */
  value: string
  /** One sentence against the usual. Two lines are held, so a row of tiles keeps one height. */
  sentence: string
  /** A `Sparkline`, or nothing. Its height is held either way. */
  trend?: React.ReactNode
  /** The value is a stand-in for a number, not a number: muted. */
  quiet?: boolean
  /** Makes the tile a button. */
  onOpen?: () => void
  /** What opening does, said to assistive tech after the sentence. */
  opensLabel?: string
  /** `data-*` attributes for the root, e.g. a hook to put focus back on the way back. */
  data?: { [key: `data-${string}`]: string }
}

const SURFACE = "relative flex min-w-0 flex-col gap-kit-tight rounded-kit-control bg-kit-object px-kit-group py-kit-related text-start shadow-kit-object"

const PRESSABLE =
  "group/tile cursor-pointer outline-hidden transition-[background-color,scale] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:active:scale-100"

export function StatTile({ label, group, value, sentence, trend, quiet = false, onOpen, opensLabel, data }: StatTileProps) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2 text-kit-meta">
        <span className="font-kit-strong text-kit-ink">{label}</span>
        {group || onOpen ? (
          <span className="flex items-center gap-1 text-kit-ink-muted">
            {group}
            {onOpen ? (
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                {...ICON_DENSE_CHEVRON}
                aria-hidden
                className="-me-1 transition-[translate] duration-(--kit-duration-state) ease-kit-out group-hover/tile:translate-x-0.5 motion-reduce:transition-none"
              />
            ) : null}
          </span>
        ) : null}
      </span>
      <span className={`text-kit-figure ${quiet ? "text-kit-ink-muted" : "text-kit-ink"}`}>{value}</span>
      <span className="line-clamp-2 min-h-8 text-kit-meta text-pretty text-kit-ink-muted">{sentence}</span>
      {trend ?? <span className="block h-7" aria-hidden />}
    </>
  )

  if (onOpen) {
    return (
      <button type="button" data-slot="kit-stat-tile" onClick={onOpen} className={`${SURFACE} ${PRESSABLE}`} {...data}>
        {body}
        {opensLabel ? <span className="sr-only">{opensLabel}</span> : null}
      </button>
    )
  }
  return (
    <div data-slot="kit-stat-tile" className={SURFACE} {...data}>
      {body}
    </div>
  )
}
