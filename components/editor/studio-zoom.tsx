"use client"

import * as React from "react"

/**
 * Timeline zoom. Ported from app/prototypes/editor/zoom.tsx, unchanged: it
 * never touched the fixtures.
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
    /** Absolute, for the timeline's zoom slider. */
    set: (value: number) => setZoom(clamp(value)),
    /** Continuous, for pinch and Cmd+wheel. */
    scaleBy: (factor: number) => setZoom((value) => clamp(value * factor)),
    /**
     * Zoom so a range fills the lane, for drag-to-zoom.
     *
     * Absolute rather than relative because the gesture states an answer — this
     * span, this wide — where every other control states a direction. Clamped
     * like the rest, so selecting three frames lands at 32x and the lane scrolls
     * to them rather than refusing.
     */
    zoomToSpan: (rangeUs: number, spanUs: number) =>
      setZoom(clamp(rangeUs > 0 ? spanUs / rangeUs : MAX_ZOOM)),
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
  }
}
