"use client"

import * as React from "react"

import type { AimPoint } from "@/lib/editor/zoom-aim"

import type { FrameRect } from "./preview-handles"
import { usePlayheadSelector, type Player } from "./use-player"

/**
 * Over the preview while a zoom is selected and the playhead is inside it:
 * click where the close-up should look at this moment (lib/editor/zoom-aim.ts).
 *
 * The points already set are drawn where they sit on the frame, numbered in
 * the order the close-up visits them, so you can see the path you are making.
 * The click is handed over in 0–1 of the picture as you see it; the studio
 * turns that back into the full frame, since you are clicking on a picture
 * that may already be pushed in.
 */
export function ZoomAimOverlay({
  player,
  frame,
  windowUs,
  points,
  onAim,
  onClear,
  toShown,
}: {
  player: Player
  frame: FrameRect
  /** The zoom's window in scene time: the overlay only takes clicks inside it. */
  windowUs: { startUs: number; endUs: number }
  points: AimPoint[]
  onAim: (point: { x: number; y: number }) => void
  onClear: () => void
  /** Where a point on the full frame shows on the picture at this moment. */
  toShown: (
    point: { x: number; y: number },
    atUs: number
  ) => { x: number; y: number }
}) {
  const inside = usePlayheadSelector(
    player,
    (atUs) => atUs >= windowUs.startUs && atUs < windowUs.endUs
  )
  // Rounded so the selector settles: it re-renders on a changed value, and
  // a float that moves every frame would render the dots every frame for a
  // difference nobody can see.
  const shownKey = usePlayheadSelector(player, (atUs) =>
    points
      .map((point) => {
        const shown = toShown(point, atUs)
        return `${shown.x.toFixed(3)},${shown.y.toFixed(3)}`
      })
      .join(";")
  )
  if (!inside) return null
  const shown = shownKey
    ? shownKey.split(";").map((pair) => {
        const [x, y] = pair.split(",").map(Number)
        return { x, y }
      })
    : []

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label="Click where the close-up should look at this moment"
      className="absolute cursor-crosshair overflow-hidden"
      style={{
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        const box = event.currentTarget.getBoundingClientRect()
        onAim({
          x: (event.clientX - box.left) / box.width,
          y: (event.clientY - box.top) / box.height,
        })
      }}
    >
      {shown.map((point, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="absolute grid size-5 -translate-1/2 place-items-center rounded-full border border-white/90 bg-black/55 font-kit-mono text-[10px] leading-none text-white shadow-kit-control"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        >
          {index + 1}
        </span>
      ))}

      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
        <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/65 px-2.5 py-1 text-kit-meta text-white">
          {points.length === 0
            ? "Click where the close-up should look"
            : "Move the playhead and click again to follow"}
          {points.length > 0 ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onClear}
              className="rounded-full px-1 text-white/75 underline-offset-2 outline-hidden hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-solid"
            >
              Clear
            </button>
          ) : null}
        </span>
      </div>
    </div>
  )
}
