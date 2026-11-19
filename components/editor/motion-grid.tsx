"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

import "./motion-grid.css"

/**
 * A grid of moves, each a small frame that plays the move while you point at
 * it (motion-grid.css). Used for how a text enters and for the kind of zoom.
 *
 * Tiles rather than a list of names, because "pop" and "rise" are words for a
 * movement and a movement is quicker to recognise than to read. Three across
 * at the panel's 260px gives each tile about 76px: room for the frame and a
 * one-word label, not for a sentence, so the sentence is the tooltip.
 */

export type MotionOption<K extends string> = {
  key: K
  label: string
  hint: string
}

export function MotionGrid<K extends string>({
  label,
  options,
  value,
  onPick,
  kind,
  feel,
  disabled,
}: {
  /** Names the group for a screen reader. */
  label: string
  options: readonly MotionOption<K>[]
  /** The picked move; null when the grid is an action rather than a choice. */
  value: K | null
  onPick: (key: K) => void
  /** What the little frame shows moving: a line of text, or the picture. */
  kind: "text" | "zoom"
  feel?: "smooth" | "snappy"
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-1.5">
      {options.map((option) => {
        const on = value === option.key
        return (
          <button
            key={option.key}
            type="button"
            title={option.hint}
            aria-pressed={value === null ? undefined : on}
            disabled={disabled}
            onClick={() => onPick(option.key)}
            data-feel={feel}
            className={cn(
              "motion-tile flex flex-col items-stretch gap-1 rounded-kit-control border p-1 text-left outline-hidden",
              "transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.97]",
              "focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid",
              "disabled:pointer-events-none disabled:opacity-50",
              on
                ? "border-kit-ink bg-kit-selected"
                : "border-kit-hairline hover:bg-kit-row-hover"
            )}
          >
            <span
              aria-hidden="true"
              className="motion-tile-stage grid h-10 place-items-center rounded-[5px] bg-kit-ink/8"
            >
              {kind === "text" ? (
                <span
                  data-move={option.key}
                  className="motion-tile-mark block h-1.5 w-8 rounded-full bg-kit-ink"
                />
              ) : (
                <span
                  data-move={option.key}
                  className="motion-tile-mark grid size-full place-items-center"
                >
                  {/* A head and shoulders: what a zoom pushes into here. */}
                  <span className="flex flex-col items-center">
                    <span className="size-2.5 rounded-full bg-kit-ink/70" />
                    <span className="mt-0.5 h-2 w-5 rounded-t-full bg-kit-ink/70" />
                  </span>
                </span>
              )}
            </span>
            <span className="truncate px-0.5 text-kit-meta text-kit-ink">
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Smooth or snappy, as two chips: the second word of every motion. */
export function FeelSwitch({
  value,
  onChange,
  disabled,
}: {
  value: "smooth" | "snappy"
  onChange: (feel: "smooth" | "snappy") => void
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label="Feel" className="flex items-center gap-1">
      <span className="mr-1 text-kit-meta text-kit-ink-muted">Feel</span>
      {(["smooth", "snappy"] as const).map((feel) => (
        <button
          key={feel}
          type="button"
          aria-pressed={value === feel}
          disabled={disabled}
          onClick={() => onChange(feel)}
          className="inline-flex min-h-6 items-center rounded-kit-chip border border-kit-hairline px-2 text-kit-meta text-kit-ink outline-hidden transition-[background-color,border-color] duration-150 ease-out hover:bg-kit-row-hover focus-visible:outline-2 focus-visible:outline-kit-focus focus-visible:outline-solid disabled:text-kit-ink-muted aria-pressed:border-kit-ink aria-pressed:bg-kit-row-hover"
        >
          {feel === "smooth" ? "Smooth" : "Snappy"}
        </button>
      ))}
    </div>
  )
}
