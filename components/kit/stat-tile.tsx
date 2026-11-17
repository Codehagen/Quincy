"use client"

import * as React from "react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ICON_DENSE_CHEVRON } from "./control-styles"

/**
 * A number said as a sentence against the person's own usual
 * (docs/design/workspace.md, "StatTile and Sparkline"). A light object on the
 * ground, not a dark shouted count. Compound: the root is the object, the
 * parts are its four lines, in this order.
 *
 * ```tsx
 * <StatTile onClick={open} data-return="tile-replies">
 *   <StatTile.Label group="Depth">Replies</StatTile.Label>
 *   <StatTile.Value>9 replies</StatTile.Value>
 *   <StatTile.Against>Under your usual 19 in 30 days.</StatTile.Against>
 *   <StatTile.Spark><Sparkline … /></StatTile.Spark>
 *   <StatTile.Opens>Open the posts that got replies.</StatTile.Opens>
 * </StatTile>
 * ```
 *
 * With `onClick` the root is a button (it opens what is behind the number)
 * and the label row shows a chevron, always, so the label never shifts on
 * hover. Without it, a plain object: a number the product cannot read yet
 * is not a way in.
 */

const Pressable = React.createContext(false)

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ")
}

const SURFACE = "@container/kit-tile relative flex min-w-0 flex-col gap-kit-tight rounded-kit-control bg-kit-object px-kit-group py-kit-related text-start shadow-kit-object"

const PRESSABLE =
  "group/tile cursor-pointer outline-hidden transition-[background-color,scale] duration-(--kit-duration-state) ease-kit-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus active:scale-(--kit-press-scale) motion-reduce:transition-none motion-reduce:active:scale-100"

/** A plain object: nothing behind the number. */
type StaticTileProps = React.ComponentPropsWithRef<"div"> & { onClick?: undefined }
/** A way in: a button that opens what is behind the number. */
type PressableTileProps = Omit<React.ComponentPropsWithRef<"button">, "type"> & {
  onClick: React.MouseEventHandler<HTMLButtonElement>
}
export type StatTileProps = StaticTileProps | PressableTileProps

function StatTileRoot(props: StatTileProps) {
  if (props.onClick) {
    const { className, children, ...rest } = props
    return (
      <Pressable value>
        <button type="button" data-slot="kit-stat-tile" className={cx(SURFACE, PRESSABLE, className)} {...rest}>
          {children}
        </button>
      </Pressable>
    )
  }
  const { className, children, ...rest } = props
  return (
    <div data-slot="kit-stat-tile" className={cx(SURFACE, className)} {...rest}>
      {children}
    </div>
  )
}

export type StatTileLabelProps = React.ComponentPropsWithRef<"span"> & {
  /** The group it belongs to, at the end of the row: "Depth", "Volume". */
  group?: React.ReactNode
}

/** The name row: the label, then the group and (on a pressable tile) the chevron at the end. */
function StatTileLabel({ group, className, children, ...rest }: StatTileLabelProps) {
  const pressable = React.useContext(Pressable)
  return (
    <span data-slot="kit-stat-tile-label" className={cx("flex items-baseline justify-between gap-2 text-kit-meta", className)} {...rest}>
      <span className="font-kit-strong text-kit-ink">{children}</span>
      {group != null || pressable ? (
        <span className="flex items-center gap-1 text-kit-ink-muted">
          {/* Under 13rem of tile (two up on a phone) the group gives the label the row, so a long label never wraps and every value sits on one line. */}
          {group != null ? <span className="@max-[13rem]/kit-tile:hidden">{group}</span> : null}
          {pressable ? (
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
  )
}

export type StatTileValueProps = React.ComponentPropsWithRef<"span"> & {
  /** `muted`: the value is a stand-in for a number ("Not read yet", "None"), not a number. */
  tone?: "ink" | "muted"
}

/** The figure, said: "9 replies". */
function StatTileValue({ tone = "ink", className, ...rest }: StatTileValueProps) {
  return <span data-slot="kit-stat-tile-value" className={cx("text-kit-figure", tone === "muted" ? "text-kit-ink-muted" : "text-kit-ink", className)} {...rest} />
}

/** One sentence against the usual. Two lines are held, so a row of tiles keeps one height. */
function StatTileAgainst({ className, ...rest }: React.ComponentPropsWithRef<"span">) {
  return <span data-slot="kit-stat-tile-against" className={cx("line-clamp-2 min-h-8 text-kit-meta text-pretty text-kit-ink-muted", className)} {...rest} />
}

/** The trend's room: a `Sparkline`, or nothing. Its height is held either way. */
function StatTileSpark({ className, children, ...rest }: React.ComponentPropsWithRef<"span">) {
  return (
    <span data-slot="kit-stat-tile-spark" aria-hidden={children == null ? true : undefined} className={cx("block min-h-7", className)} {...rest}>
      {children}
    </span>
  )
}

/** What opening does, said to assistive tech after the sentence. Only on a pressable tile. */
function StatTileOpens({ className, ...rest }: React.ComponentPropsWithRef<"span">) {
  return <span className={cx("sr-only", className)} {...rest} />
}

export const StatTile = Object.assign(StatTileRoot, {
  Label: StatTileLabel,
  Value: StatTileValue,
  Against: StatTileAgainst,
  Spark: StatTileSpark,
  Opens: StatTileOpens,
})
