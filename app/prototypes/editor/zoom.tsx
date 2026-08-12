"use client"

import * as React from "react"
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

/**
 * Timeline zoom.
 *
 * 1 is fit: the cut spans the row exactly. Above that the lane grows wider than
 * its container and scrolls, which is how you get to a single word without the
 * clip being three pixels across.
 *
 * Steps are multiplicative rather than linear. Going 1 → 2 → 4 keeps each press
 * feeling like the same amount of change, where 1 → 2 → 3 feels enormous then
 * negligible. Capped at 32, which puts a 48 second cut at roughly a second and
 * a half per screen — past that you are looking at frames, and frames need the
 * seek index this prototype does not have.
 */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 32

export function useZoom() {
  const [zoom, setZoom] = React.useState(1)

  const clamp = (value: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(3))))

  return {
    zoom,
    fit: () => setZoom(1),
    zoomIn: () => setZoom((value) => clamp(value * 2)),
    zoomOut: () => setZoom((value) => clamp(value / 2)),
    /** Continuous, for pinch and Cmd+wheel. */
    scaleBy: (factor: number) => setZoom((value) => clamp(value * factor)),
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
  }
}

export function ZoomControls({
  zoom,
  onFit,
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}: {
  zoom: number
  onFit: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  canZoomIn: boolean
  canZoomOut: boolean
}) {
  const button = cn(
    "grid size-7 place-items-center rounded-md",
    "text-muted-foreground transition-colors duration-150 ease-out",
    "hover:bg-secondary hover:text-foreground",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    "disabled:pointer-events-none disabled:text-muted-foreground/40"
  )

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        className={button}
      >
        <HugeiconsIcon aria-hidden="true" icon={MinusSignIcon} size={14} />
      </button>

      {/* Doubles as the fit control, because "back to normal" and "what is
          normal" are the same question and two buttons for it is one too many.
          Tabular so the row does not jog between 100% and 1600%. */}
      <button
        type="button"
        onClick={onFit}
        className={cn(
          "text-muted-foreground hover:bg-secondary hover:text-foreground",
          "h-7 rounded-md px-2 text-xs tabular-nums focus-visible:ring-ring",
          "transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:outline-none"
        )}
      >
        {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        className={button}
      >
        <HugeiconsIcon aria-hidden="true" icon={PlusSignIcon} size={14} />
      </button>
    </div>
  )
}
